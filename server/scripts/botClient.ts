import { io, type Socket } from 'socket.io-client';
import {
  type Ack,
  type PlayerView,
  type ProfileView,
  type Reaction,
  type ClientToServerEvents,
  type RoomView,
  type ServerToClientEvents,
  type Session,
  CHARACTER_KITS,
  chooseBotBet,
  chooseBotCard,
} from '@dane-se/shared';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * A real Socket.IO client that sees exactly what a browser would. Used by the
 * simulation script and the integration tests.
 */
export class BotClient {
  readonly socket: ClientSocket;
  view: RoomView | null = null;
  session: Session | null = null;
  profile: ProfileView | null = null;
  profileToken: string | null = null;
  readonly views: RoomView[] = [];
  closedReason: string | null = null;
  readonly reactions: Reaction[] = [];
  kicked = false;
  autoPlay = false;
  /** When set, the bot also fires its arcade abilities once each (simulation only). */
  arcade = false;
  private acting = false;
  private arcadeActing = false;
  private readonly arcadeFired = new Set<string>();
  private readonly arcadeAttempts = new Map<string, number>();
  private waiters: { pred: (v: RoomView) => boolean; resolve: (v: RoomView) => void }[] = [];

  constructor(
    url: string,
    readonly name: string,
  ) {
    this.socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('room:state', (view) => {
      this.view = view;
      this.views.push(view);
      this.waiters = this.waiters.filter((w) => (w.pred(view) ? (w.resolve(view), false) : true));
      this.maybeAct();
      this.maybeArcade();
    });
    this.socket.on('profile:state', (profile) => {
      this.profile = profile;
    });
    this.socket.on('room:closed', (reason) => (this.closedReason = reason));
    this.socket.on('room:kicked', () => (this.kicked = true));
    this.socket.on('room:reaction', (r) => this.reactions.push(r));
  }

  private call<T = object>(event: keyof ClientToServerEvents, ...args: any[]): Promise<Ack<T>> {
    return new Promise((resolve) => {
      (this.socket.emit as any)(event, ...args, resolve);
    });
  }

  /** Creates (or resumes) this client's wallet. */
  async hello(nickname?: string): Promise<ProfileView> {
    const r = await this.call<{ token: string; profile: ProfileView }>('profile:hello', {
      token: this.profileToken ?? undefined,
      nickname: nickname ?? this.name,
    });
    if (!r.ok) throw new Error(`hello failed: ${r.error}`);
    this.profileToken = r.token;
    this.profile = r.profile;
    return r.profile;
  }

  async rename(nickname: string): Promise<Ack<{ profile: ProfileView }>> {
    const r = await this.call<{ profile: ProfileView }>('profile:rename', { nickname });
    if (r.ok) this.profile = r.profile;
    return r;
  }

  async refill(): Promise<Ack<{ profile: ProfileView }>> {
    const r = await this.call<{ profile: ProfileView }>('profile:refill');
    if (r.ok) this.profile = r.profile;
    return r;
  }

  async create(options: { gameType?: string; settings?: object; arcade?: boolean } = {}): Promise<Session> {
    const r = await this.call<Session>('room:create', { name: this.name, ...options });
    if (!r.ok) throw new Error(`create failed: ${r.error}`);
    return (this.session = r);
  }

  async join(code: string): Promise<Ack<Session>> {
    const r = await this.call<Session>('room:join', { code, name: this.name });
    if (r.ok) this.session = r;
    return r;
  }

  resume(code: string, token: string) {
    return this.call<Session>('room:resume', { code, token });
  }

  start() {
    return this.call('room:start');
  }
  leave() {
    return this.call('room:leave');
  }
  settings(patch: object) {
    return this.call('room:settings', patch);
  }
  setCharacter(character: string) {
    return this.call('room:character', { character });
  }
  setArcade(arcade: boolean) {
    return this.call('room:arcade', { arcade });
  }
  setTalents(talents: string[]) {
    return this.call('room:talent', { talents });
  }
  addBot() {
    return this.call('room:addBot');
  }
  kick(playerId: string) {
    return this.call('room:kick', { playerId });
  }
  skipWaiting() {
    return this.call('room:skipWaiting');
  }
  react(emoji: string) {
    return this.call('room:react', { emoji });
  }
  rematch() {
    return this.call('room:rematch');
  }
  bet(bet: number) {
    return this.call('game:bet', { bet });
  }
  play(cardId?: string) {
    return this.call('game:play', { cardId });
  }
  action(type: string, amount?: number) {
    return this.call('game:action', { type, amount });
  }
  /** Fire an arcade ability (abilities don't require it to be your turn). */
  arcadeAbility(ability: string, targetId?: string, bet?: number) {
    return this.call('game:action', { type: 'arcade', ability, targetId, bet });
  }
  rebuy(amount?: number) {
    return this.action('rebuy', amount);
  }

  waitFor(pred: (v: RoomView) => boolean, timeoutMs = 10_000): Promise<RoomView> {
    if (this.view && pred(this.view)) return Promise.resolve(this.view);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name}: timed out waiting for state`)), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
      });
    });
  }

  myTurn(): boolean {
    const room = this.view;
    if (!room) return false;
    if (room.gameType === 'poker') return !!room.game && room.game.actorId === room.youId;
    const g = room.game;
    return !!g && g.turnPlayerId === room.youId && (g.phase === 'betting' || g.phase === 'playing');
  }

  /** Plays automatically using the shared bot heuristics. */
  enableAutoPlay(): void {
    this.autoPlay = true;
    this.maybeAct();
  }

  /** Also try each arcade ability once (for the arcade simulation). */
  enableArcade(): void {
    this.arcade = true;
    this.maybeArcade();
  }

  private maybeAct(): void {
    if (!this.autoPlay || this.acting || this.arcadeActing || !this.myTurn()) return;
    const room = this.view!;
    // Poker moves are driven explicitly by the caller (raise amounts differ).
    if (room.gameType === 'poker') return;
    const game = room.game!;
    this.acting = true;
    const action = game.phase === 'betting' ? this.bet(chooseBotBet(game)) : this.play(chooseBotCard(game) ?? undefined);
    void action.then((r) => {
      this.acting = false;
      // A stale bet/play can land after the turn moved: ignore it and wait for the
      // next state (the new turn-holder is already acting); don't spin retrying.
      if (r.ok) this.maybeAct();
      else if (r.error !== 'NOT_YOUR_TURN') throw new Error(`${this.name}: ${game.phase} rejected: ${r.error}`);
    });
  }

  /**
   * Fires the seat's arcade abilities once each, on its own turn (abilities are
   * not turn-bound, but the turn bounds the number of attempts so a move that is
   * only legal in a later phase gets another shot). Failures are ignored on
   * purpose: the point is to exercise the ability paths and their private data.
   */
  private maybeArcade(): void {
    if (!this.arcade || this.arcadeActing || this.acting) return;
    const room = this.view;
    if (!room || room.gameType !== 'danese' || !room.game) return;
    const g = room.game;
    const kit = g.arcade.enabled && g.arcade.loadout ? CHARACTER_KITS[g.arcade.loadout.character] : null;
    if (!kit || !g.arcade.loadout) return;
    if (g.turnPlayerId !== room.youId) return;
    if (g.phase !== 'betting' && g.phase !== 'playing' && g.phase !== 'trickEnd') return;

    const ability = this.nextArcadeAbility(g.arcade, kit.special.id);
    if (!ability) return;
    this.arcadeAttempts.set(ability, (this.arcadeAttempts.get(ability) ?? 0) + 1);
    const opponents = g.players.filter((p) => p.id !== room.youId && !p.eliminated);
    const targetId = opponents.length > 0 ? opponents[Math.floor(Math.random() * opponents.length)]!.id : undefined;
    const bet = g.legalBets[0] ?? 0;

    this.arcadeActing = true;
    void this.arcadeAbility(ability, targetId, ability === 'nuossa' ? bet : undefined).then((r) => {
      this.arcadeActing = false;
      if (r.ok) this.arcadeFired.add(ability);
    });
  }

  /** First ability worth trying: the charged special, then a charged talent. */
  private nextArcadeAbility(arcade: PlayerView['arcade'], specialId: string): string | undefined {
    const talents = arcade.loadout?.talents ?? [];
    const candidates: string[] = [];
    if (arcade.specialCharged) candidates.push(specialId);
    if (talents.includes('radar')) candidates.push('radar');
    if (talents.includes('curinga')) candidates.push('curinga');
    return candidates.find((id) => !this.arcadeFired.has(id) && (this.arcadeAttempts.get(id) ?? 0) < 8);
  }

  close(): void {
    this.socket.disconnect();
  }
}
