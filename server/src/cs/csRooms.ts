import { randomInt, randomUUID } from 'node:crypto';
import {
  CHARACTER_IDS,
  CS_MAX_PENDING,
  CS_SNAPSHOT_EVERY,
  CS_STEP_MS,
  IDLE_INPUT,
  ROOM_CODE_LENGTH,
  TEAM_LIMIT,
  VisionTracker,
  autoTeam,
  buildSnapshot,
  buyForPlayer,
  canJoinTeam,
  createMatch,
  forfeit as forfeitMatch,
  forfeitPassed,
  isBuyItem,
  normalizeRoomCode,
  sanitizeInput,
  setBotControl,
  startError,
  stepMatch,
  type Ack,
  type CharacterId,
  type CsLobbyView,
  type CsMember,
  type CsRoomStatus,
  type Difficulty,
  type ErrorCode,
  type Match,
  type PingKind,
  type PlayerInput,
  type Session,
  type TeamId,
  type VoiceSignal,
  type WorldEvent,
} from '@dane-se/shared';
import type { GameSocket, IO, RoomManager } from '../rooms.js';

const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // sem vogais, como nas outras salas
const MAX_HUMANS = TEAM_LIMIT * 2;
const MAX_NAME_LENGTH = 16;
const MAX_VOICE_SIGNAL_BYTES = 16_000;
const PING_INTERVAL_MS = 300;
const PING_KINDS: readonly PingKind[] = ['attention', 'enemy', 'go'];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
/** Quantos passos do motor um disparo do relógio pode dar de uma vez; depois disso o atraso é descartado. */
const MAX_STEPS_PER_PUMP = 5;

const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });
const OK = { ok: true } as const;

interface Pending {
  seq: number;
  input: PlayerInput;
  round: number | undefined;
}

interface CsMemberState {
  id: string;
  profileId: string;
  name: string;
  token: string;
  socketId: string | null;
  team: TeamId;
  character: CharacterId;
  /** Saiu de propósito no meio da partida: um bot joga por ele. */
  left: boolean;
  inVoice: boolean;
  queue: Pending[];
  lastInput: PlayerInput;
  lastSeq: number;
  /** Rodada em que o cliente confirmou o olhar na última entrada; `undefined` se ele nunca informou. */
  lastRound: number | undefined;
  /** Maior `seq` já aceito na fila, para ignorar repetidas e atrasadas. */
  acceptedSeq: number;
  lastPingAt: number;
  idleSince: number | null;
}

interface CsRoom {
  code: string;
  hostId: string;
  status: CsRoomStatus;
  difficulty: Difficulty;
  members: CsMemberState[];
  match: Match | null;
  tick: number;
  events: WorldEvent[];
  tracker: VisionTracker;
  votes: Map<TeamId, Set<string>>;
  timer: NodeJS.Timeout | null;
  lastPumpAt: number;
  acc: number;
}

export interface CsOptions {
  /** Intervalo do relógio da partida, em ms (padrão 8). */
  pumpMs?: number;
  /** Sala sem ninguém conectado por este tempo é fechada (padrão 60 s). */
  emptyTtlMs?: number;
}

function validName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
}

/**
 * Salas do modo CS: lobby com times, partida em tempo real no servidor e snapshots filtrados por jogador. Convive com o
 * `RoomManager` (jogos por turno) dividindo perfis, códigos de sala e a lista de amigos.
 */
export class CsRoomManager {
  private readonly rooms = new Map<string, CsRoom>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly io: IO,
    private readonly base: RoomManager,
    private readonly options: CsOptions = {},
  ) {
    base.externalCodeTaken = (code) => this.rooms.has(code);
    base.externalInRoom = (profileId) => !!this.roomOfProfile(profileId);
    this.sweepTimer = setInterval(() => this.sweep(), 2000);
    this.sweepTimer.unref();
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  /** A partida de uma sala, para testes e simulações. */
  match(code: string): Match | null {
    return this.rooms.get(code)?.match ?? null;
  }

  /** Roda a partida `ms` adiante sem esperar o relógio (testes e simulações). */
  advance(code: string, ms: number): void {
    const room = this.rooms.get(code);
    if (!room?.match) return;
    for (let t = 0; t < ms && room.status === 'playing'; t += CS_STEP_MS) this.step(room);
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
    for (const room of this.rooms.values()) this.stopLoop(room);
    this.rooms.clear();
  }

  owns(socket: GameSocket): boolean {
    return this.context(socket) !== null;
  }

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------

  create(socket: GameSocket, payload: { name?: unknown }): Ack<Session> {
    const resolved = this.base.ensureProfile(socket, payload.name);
    if ('error' in resolved) return fail(resolved.error);
    const { profile } = resolved;
    if (this.base.roomOfProfile(profile.id) || this.roomOfProfile(profile.id)) return fail('ALREADY_IN_ROOM');

    const member = this.newMember(profile.id, profile.nickname, 'A', []);
    const room: CsRoom = {
      code: this.newCode(),
      hostId: member.id,
      status: 'lobby',
      difficulty: 'normal',
      members: [member],
      match: null,
      tick: 0,
      events: [],
      tracker: new VisionTracker(),
      votes: new Map(),
      timer: null,
      lastPumpAt: 0,
      acc: 0,
    };
    this.rooms.set(room.code, room);
    this.attach(room, member, socket);
    this.broadcastLobby(room);
    return { ok: true, ...this.session(room, member) };
  }

  join(socket: GameSocket, rawCode: unknown, rawName: unknown): Ack<Session> {
    const room = typeof rawCode === 'string' ? this.rooms.get(normalizeRoomCode(rawCode)) : undefined;
    if (!room) return fail('ROOM_NOT_FOUND');
    if (room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (room.members.length >= MAX_HUMANS) return fail('ROOM_FULL');

    const resolved = this.base.ensureProfile(socket, rawName);
    if ('error' in resolved) return fail(resolved.error);
    const { profile } = resolved;
    if (this.base.roomOfProfile(profile.id) || this.roomOfProfile(profile.id)) return fail('ALREADY_IN_ROOM');
    if (room.members.some((m) => m.name.toLowerCase() === profile.nickname.toLowerCase())) return fail('NAME_TAKEN');

    const member = this.newMember(profile.id, profile.nickname, autoTeam(this.publicMembers(room)), room.members.map((m) => m.character));
    room.members.push(member);
    this.attach(room, member, socket);
    this.broadcastLobby(room);
    return { ok: true, ...this.session(room, member) };
  }

  resume(socket: GameSocket, rawCode: unknown, token: unknown): Ack<Session> {
    const room = typeof rawCode === 'string' ? this.rooms.get(normalizeRoomCode(rawCode)) : undefined;
    if (!room) return fail('ROOM_NOT_FOUND');
    const member = room.members.find((m) => m.token === token);
    if (!member) return fail('SESSION_NOT_FOUND');

    socket.data.profileId = member.profileId;
    member.left = false;
    member.idleSince = null;
    if (room.status === 'playing' && room.match) room.match = setBotControl(room.match, member.id, false);
    this.attach(room, member, socket);
    this.sendStart(room, member);
    this.broadcastLobby(room);
    return { ok: true, ...this.session(room, member) };
  }

  leave(socket: GameSocket): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    const { room, member } = ctx;
    this.dropVoice(room, member);
    const profileId = socket.data.profileId;
    socket.data = profileId ? { profileId } : {};
    void socket.leave(room.code);
    member.socketId = null;
    this.removeOrBot(room, member, true);
    if (profileId) setTimeout(() => this.base.onPresenceChange(profileId), 0);
    return OK;
  }

  setTeam(socket: GameSocket, raw: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (ctx.room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (raw !== 'A' && raw !== 'B') return fail('INVALID_PAYLOAD');
    if (!canJoinTeam(this.publicMembers(ctx.room), ctx.member.id, raw)) return fail('TEAM_FULL');
    ctx.member.team = raw;
    this.broadcastLobby(ctx.room);
    return OK;
  }

  setDifficulty(socket: GameSocket, raw: unknown): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return fail(ctx.error);
    if (ctx.room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (!DIFFICULTIES.includes(raw as Difficulty)) return fail('INVALID_SETTINGS');
    ctx.room.difficulty = raw as Difficulty;
    this.broadcastLobby(ctx.room);
    return OK;
  }

  setCharacter(socket: GameSocket, raw: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (ctx.room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (typeof raw !== 'string' || !(CHARACTER_IDS as readonly string[]).includes(raw)) return fail('INVALID_PAYLOAD');
    ctx.member.character = raw as CharacterId;
    this.broadcastLobby(ctx.room);
    return OK;
  }

  kick(socket: GameSocket, playerId: unknown): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return fail(ctx.error);
    const target = ctx.room.members.find((m) => m.id === playerId);
    if (!target || target === ctx.member) return fail('INVALID_PAYLOAD');
    const targetSocket = target.socketId ? this.socketOf(target.socketId) : undefined;
    this.dropVoice(ctx.room, target);
    if (targetSocket) {
      const profileId = targetSocket.data.profileId;
      targetSocket.data = profileId ? { profileId } : {};
      void targetSocket.leave(ctx.room.code);
      targetSocket.emit('room:kicked');
    }
    target.socketId = null;
    this.removeOrBot(ctx.room, target, true);
    return OK;
  }

  start(socket: GameSocket): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return fail(ctx.error);
    const { room } = ctx;
    if (room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    const error = startError(this.publicMembers(room));
    if (error) return fail(error);

    try {
      room.match = createMatch(
        room.members.map((m) => ({ id: m.id, name: m.name, team: m.team, character: m.character })),
        randomInt(1, 2 ** 31 - 1),
        room.difficulty,
      );
    } catch {
      return fail('TEAM_FULL');
    }
    room.status = 'playing';
    room.tick = 0;
    room.events = [];
    room.tracker = new VisionTracker();
    room.votes = new Map();
    for (const m of room.members) {
      m.queue = [];
      m.lastInput = IDLE_INPUT;
      m.lastSeq = 0;
      m.lastRound = undefined;
      m.acceptedSeq = 0;
      m.left = false;
      this.sendStart(room, m);
    }
    this.faceSpawn(room, room.match);
    this.broadcastLobby(room);
    this.startLoop(room);
    return OK;
  }

  rematch(socket: GameSocket): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return fail(ctx.error);
    if (ctx.room.status !== 'finished') return fail('NOT_IN_MATCH');
    ctx.room.status = 'lobby';
    ctx.room.match = null;
    ctx.room.members = ctx.room.members.filter((m) => !m.left && m.socketId !== null);
    this.broadcastLobby(ctx.room);
    return OK;
  }

  // ---------------------------------------------------------------------------
  // Partida
  // ---------------------------------------------------------------------------

  input(socket: GameSocket, payload: unknown): void {
    const ctx = this.context(socket);
    if (!ctx || ctx.room.status !== 'playing' || !payload || typeof payload !== 'object') return;
    const { seq, input, round } = payload as { seq?: unknown; input?: unknown; round?: unknown };
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq <= ctx.member.acceptedSeq) return;
    const clean = sanitizeInput(input);
    if (!clean) return;
    const { member } = ctx;
    member.acceptedSeq = seq;
    member.queue.push({ seq, input: clean, round: typeof round === 'number' && Number.isInteger(round) ? round : undefined });
    if (member.queue.length > CS_MAX_PENDING) member.queue.splice(0, member.queue.length - CS_MAX_PENDING);
  }

  buy(socket: GameSocket, item: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx?.room.match || ctx.room.status !== 'playing') return fail('NOT_IN_MATCH');
    if (typeof item !== 'string' || !isBuyItem(item)) return fail('INVALID_PAYLOAD');
    const next = buyForPlayer(ctx.room.match, ctx.member.id, item);
    if (next === ctx.room.match) return fail('INVALID_ACTION');
    ctx.room.match = next;
    return OK;
  }

  ping(socket: GameSocket, payload: unknown): void {
    const ctx = this.context(socket);
    if (!ctx?.room.match || ctx.room.status !== 'playing' || !payload || typeof payload !== 'object') return;
    const { kind, x, z } = payload as { kind?: unknown; x?: unknown; z?: unknown };
    if (!PING_KINDS.includes(kind as PingKind) || typeof x !== 'number' || typeof z !== 'number') return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const { min, max } = ctx.room.match.world.baseMap.bounds;
    if (x < min.x || x > max.x || z < min.z || z > max.z) return;
    const now = Date.now();
    if (now - ctx.member.lastPingAt < PING_INTERVAL_MS) return;
    ctx.member.lastPingAt = now;
    const ping = { id: randomUUID().slice(0, 8), from: ctx.member.id, kind: kind as PingKind, x, z };
    for (const m of ctx.room.members) {
      if (m.team === ctx.member.team && m.socketId) this.socketOf(m.socketId)?.emit('cs:ping', ping);
    }
  }

  forfeit(socket: GameSocket): Ack<{ votes: number; needed: number }> {
    const ctx = this.context(socket);
    if (!ctx?.room.match || ctx.room.status !== 'playing' || ctx.room.match.winner) return fail('NOT_IN_MATCH');
    const { room, member } = ctx;
    const mates = room.members.filter((m) => m.team === member.team && m.socketId !== null && !m.left);
    const votes = room.votes.get(member.team) ?? new Set<string>();
    votes.add(member.id);
    room.votes.set(member.team, votes);
    const mateIds = mates.map((m) => m.id);
    const count = mateIds.filter((id) => votes.has(id)).length;
    const needed = Math.floor(mateIds.length / 2) + 1;
    for (const m of mates) if (m.socketId) this.socketOf(m.socketId)?.emit('cs:forfeit', { votes: count, needed });
    if (forfeitPassed(votes, mateIds)) room.match = forfeitMatch(room.match!, member.team);
    return { ok: true, votes: count, needed };
  }

  private startLoop(room: CsRoom): void {
    this.stopLoop(room);
    room.lastPumpAt = performance.now();
    room.acc = 0;
    room.timer = setInterval(() => this.pump(room), this.options.pumpMs ?? 8);
    room.timer.unref();
  }

  private stopLoop(room: CsRoom): void {
    if (room.timer) clearInterval(room.timer);
    room.timer = null;
  }

  private pump(room: CsRoom): void {
    const now = performance.now();
    room.acc += now - room.lastPumpAt;
    room.lastPumpAt = now;
    let steps = 0;
    while (room.acc >= CS_STEP_MS && steps < MAX_STEPS_PER_PUMP && room.status === 'playing') {
      this.step(room);
      room.acc -= CS_STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_PUMP) room.acc = 0;
  }

  /** Um passo do motor: uma entrada de cada humano (a última se a fila secou) e, de tempos em tempos, os snapshots. */
  private step(room: CsRoom): void {
    const match = room.match;
    if (!match) return;
    const inputs: Record<string, PlayerInput> = {};
    for (const m of room.members) {
      const next = m.queue.shift();
      if (next) {
        m.lastInput = next.input;
        m.lastSeq = next.seq;
        m.lastRound = next.round;
      } else {
        // Sem entrada nova repete a anterior, menos o que só vale uma vez (recarregar e trocar de arma).
        m.lastInput = { ...m.lastInput, reload: false, slot: 0 };
      }
      // Entrada de antes de o cliente ver a rodada nova traz o olhar da rodada velha: o spawn manda até ele confirmar.
      const spawn = m.lastRound !== undefined && m.lastRound !== match.roundIndex ? match.world.players.find((p) => p.id === m.id) : undefined;
      inputs[m.id] = spawn ? { ...m.lastInput, yaw: spawn.yaw, pitch: spawn.pitch } : m.lastInput;
    }
    const before = match.world;
    const after = stepMatch(match, inputs, CS_STEP_MS);
    room.match = after;
    if (after.roundIndex !== match.roundIndex) this.faceSpawn(room, after);
    if (after.world !== before) room.events.push(...after.world.events);
    room.tick++;
    if (room.tick % CS_SNAPSHOT_EVERY === 0 || after.winner) this.broadcastSnapshots(room, !!after.winner);
    if (after.winner) this.finish(room);
  }

  /** A entrada repetida passa a olhar como no spawn; senão o olhar da rodada velha volta no primeiro passo. */
  private faceSpawn(room: CsRoom, match: Match): void {
    for (const m of room.members) {
      const spawn = match.world.players.find((p) => p.id === m.id);
      if (spawn) m.lastInput = { ...m.lastInput, yaw: spawn.yaw, pitch: spawn.pitch };
    }
  }

  private broadcastSnapshots(room: CsRoom, reliable: boolean): void {
    const match = room.match;
    if (!match) return;
    const now = performance.now();
    for (const m of room.members) {
      const socket = m.socketId ? this.socketOf(m.socketId) : undefined;
      if (!socket) continue;
      const snapshot = buildSnapshot(match, m.id, room.tracker, room.tick, m.lastSeq, now, room.events);
      (reliable ? socket : socket.volatile).emit('cs:snapshot', snapshot);
    }
    room.events = [];
  }

  private finish(room: CsRoom): void {
    this.stopLoop(room);
    room.status = 'finished';
    this.broadcastLobby(room);
  }

  // ---------------------------------------------------------------------------
  // Voz do time
  // ---------------------------------------------------------------------------

  voiceJoin(socket: GameSocket): Ack<{ peers: string[] }> {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    const mates = ctx.room.members.filter((m) => m !== ctx.member && m.team === ctx.member.team);
    const peers = mates.filter((m) => m.inVoice && m.socketId).map((m) => m.id);
    if (!ctx.member.inVoice) {
      ctx.member.inVoice = true;
      for (const m of mates) if (m.socketId) this.socketOf(m.socketId)?.emit('voice:joined', { playerId: ctx.member.id });
    }
    return { ok: true, peers };
  }

  voiceLeave(socket: GameSocket): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    this.dropVoice(ctx.room, ctx.member);
    return OK;
  }

  voiceSignal(socket: GameSocket, payload: unknown): void {
    const ctx = this.context(socket);
    if (!ctx || !ctx.member.inVoice || !payload || typeof payload !== 'object') return;
    const { to, data } = payload as { to?: unknown; data?: unknown };
    const target = ctx.room.members.find((m) => m.id === to && m !== ctx.member && m.team === ctx.member.team);
    if (!target?.inVoice || !target.socketId) return;
    if (!data || typeof data !== 'object' || JSON.stringify(data).length > MAX_VOICE_SIGNAL_BYTES) return;
    this.socketOf(target.socketId)?.emit('voice:signal', { from: ctx.member.id, data: data as VoiceSignal });
  }

  private dropVoice(room: CsRoom, member: CsMemberState): void {
    if (!member.inVoice) return;
    member.inVoice = false;
    for (const m of room.members) {
      if (m !== member && m.team === member.team && m.socketId) this.socketOf(m.socketId)?.emit('voice:left', { playerId: member.id });
    }
  }

  inviteFriend(socket: GameSocket, otherId: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    return this.base.sendInvite(ctx.member.profileId, otherId, ctx.room.code, 'cs');
  }

  // ---------------------------------------------------------------------------
  // Conexão
  // ---------------------------------------------------------------------------

  disconnect(socket: GameSocket): void {
    const ctx = this.context(socket);
    if (!ctx || ctx.member.socketId !== socket.id) return;
    this.dropVoice(ctx.room, ctx.member);
    ctx.member.socketId = null;
    this.removeOrBot(ctx.room, ctx.member, false);
  }

  /**
   * Quem sai da sala (`left`) ou perde a conexão: no lobby some da lista; na partida um bot joga por ele (e ele pode
   * voltar com o token). Sala sem ninguém conectado fecha depois de um tempo.
   */
  private removeOrBot(room: CsRoom, member: CsMemberState, left: boolean): void {
    if (room.status === 'playing' && room.match) {
      member.left = left;
      member.idleSince = Date.now();
      member.queue = [];
      room.match = setBotControl(room.match, member.id, true);
      this.touchHost(room);
      this.broadcastLobby(room);
      return;
    }
    if (room.status === 'lobby' || left) {
      room.members = room.members.filter((m) => m !== member);
    } else {
      member.idleSince = Date.now();
    }
    if (!room.members.some((m) => m.socketId !== null)) {
      this.closeRoom(room, 'everyoneLeft');
      return;
    }
    this.touchHost(room);
    this.broadcastLobby(room);
  }

  /** O anfitrião foi embora: o próximo jogador conectado assume. */
  private touchHost(room: CsRoom): void {
    const host = room.members.find((m) => m.id === room.hostId);
    if (host?.socketId) return;
    const next = room.members.find((m) => m.socketId !== null && !m.left);
    if (next) room.hostId = next.id;
  }

  private sweep(): void {
    const ttl = this.options.emptyTtlMs ?? 60_000;
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (room.members.some((m) => m.socketId !== null)) continue;
      const idle = Math.min(...room.members.map((m) => m.idleSince ?? now));
      if (now - idle >= ttl) this.closeRoom(room, 'idle');
    }
  }

  private closeRoom(room: CsRoom, reason: 'everyoneLeft' | 'idle'): void {
    this.stopLoop(room);
    this.rooms.delete(room.code);
    for (const m of room.members) {
      const socket = m.socketId ? this.socketOf(m.socketId) : undefined;
      if (!socket) continue;
      socket.emit('cs:closed', reason);
      const profileId = socket.data.profileId;
      socket.data = profileId ? { profileId } : {};
      void socket.leave(room.code);
    }
    for (const m of room.members) setTimeout(() => this.base.onPresenceChange(m.profileId), 0);
  }

  // ---------------------------------------------------------------------------
  // Auxiliares
  // ---------------------------------------------------------------------------

  private newMember(profileId: string, name: string, team: TeamId, takenCharacters: CharacterId[]): CsMemberState {
    const free = CHARACTER_IDS.filter((c) => !takenCharacters.includes(c));
    const pool = free.length > 0 ? free : CHARACTER_IDS;
    return {
      id: randomUUID(),
      profileId,
      name,
      token: randomUUID(),
      socketId: null,
      team,
      character: pool[randomInt(pool.length)]!,
      left: false,
      inVoice: false,
      queue: [],
      lastInput: IDLE_INPUT,
      lastSeq: 0,
      lastRound: undefined,
      acceptedSeq: 0,
      lastPingAt: 0,
      idleSince: null,
    };
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code) && !this.base.hasCode(code)) return code;
    }
  }

  private session(room: CsRoom, member: CsMemberState): Session {
    return { code: room.code, playerId: member.id, token: member.token };
  }

  private roomOfProfile(profileId: string): CsRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.members.some((m) => m.profileId === profileId && !m.left)) return room;
    }
    return undefined;
  }

  private context(socket: GameSocket): { room: CsRoom; member: CsMemberState } | null {
    const { code, playerId } = socket.data ?? {};
    const room = code ? this.rooms.get(code) : undefined;
    const member = room?.members.find((m) => m.id === playerId);
    return room && member ? { room, member } : null;
  }

  private hostContext(socket: GameSocket): { ok: true; room: CsRoom; member: CsMemberState } | { ok: false; error: ErrorCode } {
    const ctx = this.context(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM' };
    if (ctx.room.hostId !== ctx.member.id) return { ok: false, error: 'NOT_HOST' };
    return { ok: true, ...ctx };
  }

  private socketOf(id: string): GameSocket | undefined {
    return this.io.sockets.sockets.get(id) as GameSocket | undefined;
  }

  private attach(room: CsRoom, member: CsMemberState, socket: GameSocket): void {
    const profileId = socket.data.profileId;
    const oldSocketId = member.socketId;
    member.socketId = socket.id;
    socket.data = { ...(profileId ? { profileId } : {}), code: room.code, playerId: member.id };
    void socket.join(room.code);
    // A mesma pessoa abriu outra aba: a conexão mais nova vale.
    if (oldSocketId && oldSocketId !== socket.id) this.socketOf(oldSocketId)?.disconnect(true);
    if (profileId) this.base.onPresenceChange(profileId);
  }

  private publicMembers(room: CsRoom): CsMember[] {
    return room.members.map((m) => ({
      id: m.id,
      name: m.name,
      team: m.team,
      isHost: m.id === room.hostId,
      connected: m.socketId !== null,
      character: m.character,
    }));
  }

  private lobbyView(room: CsRoom, member: CsMemberState): CsLobbyView {
    return {
      code: room.code,
      youId: member.id,
      hostId: room.hostId,
      status: room.status,
      members: this.publicMembers(room),
      difficulty: room.difficulty,
      teamSize: TEAM_LIMIT,
    };
  }

  private broadcastLobby(room: CsRoom): void {
    for (const m of room.members) {
      if (m.socketId) this.socketOf(m.socketId)?.emit('cs:lobby', this.lobbyView(room, m));
    }
  }

  private sendStart(room: CsRoom, member: CsMemberState): void {
    if (room.status !== 'playing' || !room.match || !member.socketId) return;
    this.socketOf(member.socketId)?.emit('cs:started', { mapId: room.match.mapId, roster: room.match.roster });
  }
}
