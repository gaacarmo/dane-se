import { io, type Socket } from 'socket.io-client';
import {
  type Ack,
  type ProfileView,
  type Reaction,
  type ClientToServerEvents,
  type RoomView,
  type ServerToClientEvents,
  type Session,
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
  private acting = false;
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

  async create(options: { gameType?: string; settings?: object } = {}): Promise<Session> {
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

  private maybeAct(): void {
    if (!this.autoPlay || this.acting || !this.myTurn()) return;
    const room = this.view!;
    // Poker moves are driven explicitly by the caller (raise amounts differ).
    if (room.gameType === 'poker') return;
    const game = room.game!;
    this.acting = true;
    const action = game.phase === 'betting' ? this.bet(chooseBotBet(game)) : this.play(chooseBotCard(game) ?? undefined);
    void action.then((r) => {
      this.acting = false;
      if (!r.ok) throw new Error(`${this.name}: ${game.phase} rejected: ${r.error}`);
      this.maybeAct();
    });
  }

  close(): void {
    this.socket.disconnect();
  }
}
