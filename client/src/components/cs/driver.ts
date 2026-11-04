import type { MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import {
  CS_INTERP_MS,
  CS_MAX_PENDING,
  CS_STEP_MS,
  IDLE_INPUT,
  MAPS,
  applySnapshot,
  buyForPlayer,
  createMatch,
  forfeit as forfeitMatch,
  interpolatePlayers,
  predictBody,
  stepMatch,
  type ClientToServerEvents,
  type BuyItem,
  type CsInputMsg,
  type CsSnapshot,
  type CsStartInfo,
  type MapDef,
  type Match,
  type Ping,
  type PingKind,
  type PlayerInput,
  type ServerToClientEvents,
  type Vec3,
  type WorldEvent,
} from '@dane-se/shared';
import type { CsInput } from './useCsInput';

const MAX_STEPS_PER_FRAME = 5;
/** Entradas guardadas esperando a confirmação do servidor; mais que isso é conexão morta. */
const MAX_UNACKED = 120;
const SNAPSHOT_HISTORY = 12;

/** O que a tela quer saber do que acontece no jogo, venha ele do relógio local ou da rede. */
export interface DriverHooks {
  /** Eventos novos do jogo (tiros, abates...) e a partida em que aconteceram. */
  onEvents(match: Match, events: WorldEvent[]): void;
  /** Passos de inimigos ouvidos fora de vista (só na rede). */
  onHeard(positions: Vec3[]): void;
  /** Ping de um colega de time (só na rede). */
  onPing(ping: Ping): void;
  /** Cada entrada do jogador, no passo em que foi lida. */
  onInput(input: PlayerInput, match: Match, now: number): void;
}

/** De onde vem a partida: do motor rodando aqui (treino) ou do servidor (sala). A tela só fala com isto. */
export interface CsDriver {
  readonly meId: string;
  /** No treino a simulação para na pausa; na rede ela nunca para. */
  readonly solo: boolean;
  readonly matchRef: MutableRefObject<Match>;
  hooks: DriverHooks;
  /** Liga o que precisa de ouvintes (socket); devolve como desligar. Pode ser chamado mais de uma vez. */
  start(): () => void;
  /** A cada quadro do navegador: avança a simulação, envia entradas ou interpola. */
  frame(now: number, dtMs: number, ctx: { input: CsInput; paused: boolean }): void;
  buy(item: BuyItem): void;
  forfeit(): void;
  ping(kind: PingKind, x: number, z: number): void;
}

const NO_HOOKS: DriverHooks = { onEvents: () => {}, onHeard: () => {}, onPing: () => {}, onInput: () => {} };

/** Treino sozinho contra bots: o motor roda no navegador. */
export class LocalDriver implements CsDriver {
  readonly solo = true;
  readonly matchRef: MutableRefObject<Match>;
  hooks = NO_HOOKS;
  private acc = 0;

  constructor(
    readonly meId: string,
    name: string,
    seed: number,
  ) {
    this.matchRef = { current: createMatch([{ id: meId, name }], seed) };
  }

  start(): () => void {
    return () => {};
  }

  frame(now: number, dtMs: number, { input, paused }: { input: CsInput; paused: boolean }): void {
    if (paused) return;
    this.acc += dtMs;
    let steps = 0;
    while (this.acc >= CS_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      const before = this.matchRef.current;
      const pressed = input.read();
      this.hooks.onInput(pressed, before, now);
      const after = stepMatch(before, { [this.meId]: pressed }, CS_STEP_MS);
      this.matchRef.current = after;
      if (after.world !== before.world && after.world.events.length > 0) this.hooks.onEvents(after, after.world.events);
      this.acc -= CS_STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
  }

  buy(item: BuyItem): void {
    this.matchRef.current = buyForPlayer(this.matchRef.current, this.meId, item);
  }

  forfeit(): void {
    const me = this.matchRef.current.roster.find((r) => r.id === this.meId)!;
    this.matchRef.current = forfeitMatch(this.matchRef.current, me.team);
  }

  ping(): void {}
}

type NetSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Partida numa sala: o servidor decide tudo; aqui só se envia entrada, se prevê o próprio corpo e se interpola o resto. */
export class NetDriver implements CsDriver {
  readonly solo = false;
  readonly matchRef: MutableRefObject<Match> = { current: null as unknown as Match };
  hooks = NO_HOOKS;
  private readonly base: { roster: CsStartInfo['roster']; map: MapDef };
  private snaps: { at: number; snap: CsSnapshot }[] = [];
  private serverMatch: Match | null = null;
  private pending: CsInputMsg[] = [];
  private seq = 0;
  /** Rodada para a qual o olhar já foi ajustado ao spawn; as entradas levam esse número para o servidor confiar nelas. */
  private lookRound = -1;
  private lastPressed: PlayerInput = IDLE_INPUT;
  private hiddenTimer: ReturnType<typeof setInterval> | undefined;
  private acc = 0;
  private pingId = 0;
  private listening = 0;

  constructor(
    private readonly socket: NetSocket,
    readonly meId: string,
    start: CsStartInfo,
    private readonly onReady: () => void,
  ) {
    const map = MAPS.find((m) => m.id === start.mapId) ?? MAPS[0]!;
    this.base = { roster: start.roster, map };
  }

  /** Os ouvintes valem enquanto alguém usar o driver: a tela de espera os liga antes de a partida aparecer. */
  start(): () => void {
    if (this.listening++ === 0) {
      this.socket.on('cs:snapshot', this.onSnapshot);
      this.socket.on('cs:ping', this.onPing);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.hiddenTimer = setInterval(() => document.hidden && this.sendNeutral(), 1000);
    }
    return () => {
      if (--this.listening === 0) {
        this.socket.off('cs:snapshot', this.onSnapshot);
        this.socket.off('cs:ping', this.onPing);
        document.removeEventListener('visibilitychange', this.onVisibility);
        clearInterval(this.hiddenTimer);
      }
    };
  }

  private readonly onSnapshot = (snap: CsSnapshot) => this.receive(snap);

  /** Aba oculta não desenha quadros e portanto não manda entradas: avisa o servidor para parar o personagem. */
  private readonly onVisibility = () => {
    if (document.hidden) this.sendNeutral();
  };

  private sendNeutral(): void {
    if (!this.serverMatch) return;
    const msg: CsInputMsg = {
      seq: ++this.seq,
      input: { ...IDLE_INPUT, yaw: this.lastPressed.yaw, pitch: this.lastPressed.pitch },
      round: this.lookRound,
    };
    this.pending.push(msg);
    if (this.pending.length > MAX_UNACKED) this.pending.shift();
    this.socket.volatile.emit('cs:input', msg);
  }

  private readonly onPing = (p: { from: string; kind: PingKind; x: number; z: number }) =>
    p.from !== this.meId &&
    this.hooks.onPing({ id: 1_000_000 + this.pingId++, kind: p.kind, x: p.x, z: p.z, by: p.from, at: performance.now() });

  private receive(snap: CsSnapshot): void {
    const first = this.serverMatch === null;
    const match = applySnapshot(this.serverMatch, snap, this.base);
    this.serverMatch = match;
    this.snaps.push({ at: performance.now(), snap });
    if (this.snaps.length > SNAPSHOT_HISTORY) this.snaps.shift();
    this.pending = this.pending.filter((p) => p.seq > snap.ack);
    if (first) {
      // Um servidor que ainda guarda numeração velha (volta por F5) não pode engolir as entradas novas.
      this.seq = Math.max(this.seq, snap.ack);
      this.matchRef.current = match;
      this.onReady();
    }
    if (snap.events.length > 0) this.hooks.onEvents(match, snap.events);
    if (snap.heard.length > 0) this.hooks.onHeard(snap.heard);
  }

  frame(now: number, dtMs: number, { input }: { input: CsInput; paused: boolean }): void {
    const server = this.serverMatch;
    if (!server) return;

    const mine = server.world.players.find((p) => p.id === this.meId);
    if (mine && this.lookRound !== server.roundIndex) {
      input.setLook(mine.yaw, mine.pitch);
      this.lookRound = server.roundIndex;
    }

    this.acc += dtMs;
    let steps = 0;
    while (this.acc >= CS_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      const pressed = input.read();
      this.lastPressed = pressed;
      const msg: CsInputMsg = { seq: ++this.seq, input: pressed, round: this.lookRound };
      this.pending.push(msg);
      if (this.pending.length > MAX_UNACKED) this.pending.shift();
      this.socket.volatile.emit('cs:input', msg);
      this.hooks.onInput(pressed, this.matchRef.current, now);
      this.acc -= CS_STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;

    this.matchRef.current = this.render(server, now);
  }

  /** A partida como se desenha agora: os outros um pouco atrás no tempo e o seu corpo à frente, pelo que você já fez. */
  private render(server: Match, now: number): Match {
    const renderAt = now - CS_INTERP_MS;
    const i = this.snaps.findIndex((s, k) => s.at <= renderAt && (this.snaps[k + 1]?.at ?? Infinity) > renderAt);
    const older = this.snaps[i];
    const newer = this.snaps[i + 1];
    const poses =
      older && newer
        ? interpolatePlayers(older.snap, newer.snap, (renderAt - older.at) / Math.max(1, newer.at - older.at))
        : null;

    const players = server.world.players.map((p) => {
      if (p.id === this.meId) {
        const body = predictBody(server.world.map, p.body, this.pending, p.weapon, p.alive, server.world.phase);
        return body === p.body ? p : { ...p, body };
      }
      const pose = poses?.get(p.id);
      if (!pose || !p.alive) return p;
      return { ...p, yaw: pose.yaw, pitch: pose.pitch, body: { ...p.body, pos: { x: pose.x, y: pose.y, z: pose.z } } };
    });
    return { ...server, world: { ...server.world, players } };
  }

  buy(item: BuyItem): void {
    this.socket.emit('cs:buy', { item }, () => {});
  }

  forfeit(): void {
    this.socket.emit('cs:forfeit', () => {});
  }

  ping(kind: PingKind, x: number, z: number): void {
    this.socket.emit('cs:ping', { kind, x, z });
  }
}
