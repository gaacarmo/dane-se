import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  type Ack,
  type ClientToServerEvents,
  type ErrorCode,
  type GameAction,
  type GameSettings,
  type GameState,
  type RoomClosedReason,
  type RoomStatus,
  type RoomView,
  type ServerToClientEvents,
  type Session,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_LENGTH,
  DEFAULT_SETTINGS,
  applyAction,
  cardId,
  chooseBotBet,
  chooseBotCard,
  createGame,
  getPlayerView,
  normalizeRoomCode,
  wordLetters,
} from '@dane-se/shared';

export interface Timings {
  /** How long a finished trick stays on the table before it's collected. */
  trickPauseMs: number;
  /** How long the round summary shows before the next round is dealt. */
  roundSummaryMs: number;
  /** Delay before a bot acts for a disconnected player. */
  botDelayMs: number;
  /** How long we wait for a disconnected player on their turn before the bot plays for them. */
  reconnectGraceMs: number;
  /** How long a disconnected host keeps the role before it moves to someone connected. */
  hostGraceMs: number;
  /** A room with nobody connected is closed after this long ("everyone left" ends the game). */
  emptyRoomTtlMs: number;
  /** A room with no activity at all is closed after this long. */
  idleRoomTtlMs: number;
  sweepIntervalMs: number;
}

export const DEFAULT_TIMINGS: Timings = {
  trickPauseMs: 1800,
  roundSummaryMs: 6000,
  botDelayMs: 900,
  reconnectGraceMs: 30_000,
  hostGraceMs: 15_000,
  emptyRoomTtlMs: 90_000,
  idleRoomTtlMs: 2 * 60 * 60_000,
  sweepIntervalMs: 60_000,
};

export interface SocketData {
  code?: string;
  playerId?: string;
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface Member {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  autoPlay: boolean;
}

interface Room {
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: GameSettings;
  /** Join order = seat order. */
  members: Member[];
  game: GameState | null;
  waitingFor: { playerId: string; deadline: number } | null;
  gameTimer: NodeJS.Timeout | null;
  hostTimer: NodeJS.Timeout | null;
  emptyTimer: NodeJS.Timeout | null;
  lastActivity: number;
}

const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels: no accidental words, no 0/O confusion
const MAX_WORD_LETTERS = 12;

const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });
const OK = { ok: true } as const;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly io: IO,
    private readonly timings: Timings = DEFAULT_TIMINGS,
  ) {
    this.sweepTimer = setInterval(() => this.sweep(), timings.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
    for (const room of this.rooms.values()) this.clearTimers(room);
    this.rooms.clear();
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  create(socket: GameSocket, rawName: unknown): Ack<Session> {
    const name = validName(rawName);
    if (!name) return fail('INVALID_NAME');

    const member = newMember(name);
    const room: Room = {
      code: this.newCode(),
      hostId: member.id,
      status: 'lobby',
      settings: { ...DEFAULT_SETTINGS },
      members: [member],
      game: null,
      waitingFor: null,
      gameTimer: null,
      hostTimer: null,
      emptyTimer: null,
      lastActivity: Date.now(),
    };
    this.rooms.set(room.code, room);
    this.attach(room, member, socket);
    return { ok: true, ...session(room, member) };
  }

  join(socket: GameSocket, rawCode: unknown, rawName: unknown): Ack<Session> {
    const room = typeof rawCode === 'string' ? this.rooms.get(normalizeRoomCode(rawCode)) : undefined;
    if (!room) return fail('ROOM_NOT_FOUND');
    const name = validName(rawName);
    if (!name) return fail('INVALID_NAME');
    if (room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (room.members.length >= MAX_PLAYERS) return fail('ROOM_FULL');
    if (room.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) return fail('NAME_TAKEN');

    const member = newMember(name);
    room.members.push(member);
    this.attach(room, member, socket);
    return { ok: true, ...session(room, member) };
  }

  resume(socket: GameSocket, rawCode: unknown, token: unknown): Ack<Session> {
    const room = typeof rawCode === 'string' ? this.rooms.get(normalizeRoomCode(rawCode)) : undefined;
    if (!room) return fail('ROOM_NOT_FOUND');
    const member = room.members.find((m) => m.token === token);
    if (!member) return fail('SESSION_NOT_FOUND');

    member.autoPlay = false;
    this.attach(room, member, socket);
    return { ok: true, ...session(room, member) };
  }

  leave(socket: GameSocket): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    const { room, member } = ctx;
    socket.data = {};
    void socket.leave(room.code);

    if (room.status === 'playing') {
      // Keep the seat: a bot plays for them (they can still come back with their token).
      member.socketId = null;
      member.autoPlay = true;
      this.onConnectivityChange(room, member);
      return OK;
    }

    room.members = room.members.filter((m) => m !== member);
    if (room.members.length === 0) {
      this.closeRoom(room, 'everyoneLeft');
      return OK;
    }
    if (room.hostId === member.id) this.transferHost(room);
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  updateSettings(socket: GameSocket, patch: unknown): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return ctx;
    const { room } = ctx;
    if (room.status !== 'lobby') return fail('GAME_IN_PROGRESS');

    const settings = validSettings(room.settings, patch);
    if (!settings) return fail('INVALID_SETTINGS');
    room.settings = settings;
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  kick(socket: GameSocket, playerId: unknown): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return ctx;
    const { room, member: host } = ctx;
    if (room.status === 'playing') return fail('GAME_IN_PROGRESS');
    const target = room.members.find((m) => m.id === playerId);
    if (!target || target === host) return fail('INVALID_PAYLOAD');

    room.members = room.members.filter((m) => m !== target);
    const targetSocket = target.socketId ? this.io.sockets.sockets.get(target.socketId) : undefined;
    if (targetSocket) {
      targetSocket.data = {};
      void targetSocket.leave(room.code);
      targetSocket.emit('room:kicked');
    }
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  start(socket: GameSocket): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return ctx;
    const { room } = ctx;
    if (room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (room.members.length < MIN_PLAYERS) return fail('NOT_ENOUGH_PLAYERS');

    const created = createGame(
      room.members.map((m) => ({ id: m.id, name: m.name })),
      randomInt(2 ** 31),
      room.settings,
    );
    if (!created.ok) return fail(created.error);
    room.game = created.state;
    room.status = 'playing';
    this.afterGameChange(room);
    return OK;
  }

  rematch(socket: GameSocket): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return ctx;
    const { room } = ctx;
    if (room.status !== 'finished') return fail('WRONG_PHASE');

    room.status = 'lobby';
    room.game = null;
    room.waitingFor = null;
    // Players who left for good don't come back to the lobby.
    room.members = room.members.filter((m) => m.socketId !== null);
    for (const m of room.members) m.autoPlay = false;
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  // -------------------------------------------------------------------------
  // Game actions
  // -------------------------------------------------------------------------

  bet(socket: GameSocket, bet: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (typeof bet !== 'number') return fail('INVALID_PAYLOAD');
    return this.dispatch(ctx.room, { type: 'bet', playerId: ctx.member.id, bet });
  }

  play(socket: GameSocket, rawCardId: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (rawCardId !== undefined && typeof rawCardId !== 'string') return fail('INVALID_PAYLOAD');
    return this.playFor(ctx.room, ctx.member.id, rawCardId);
  }

  /** Host: give up waiting for the disconnected player and let the bot play now. */
  skipWaiting(socket: GameSocket): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return ctx;
    const { room } = ctx;
    const waiting = room.waitingFor && room.members.find((m) => m.id === room.waitingFor!.playerId);
    if (!waiting) return fail('WRONG_PHASE');
    waiting.autoPlay = true;
    this.afterGameChange(room);
    return OK;
  }

  private playFor(room: Room, playerId: string, id: string | undefined): Ack {
    const game = room.game;
    if (!game) return fail('WRONG_PHASE');
    // In the blind round the player can't see their card: play whatever is on their forehead.
    const blindCard = game.cardsPerPlayer === 1 ? game.hands[playerId]?.[0] : undefined;
    const chosen = blindCard ? cardId(blindCard) : id;
    if (!chosen) return fail('INVALID_PAYLOAD');
    return this.dispatch(room, { type: 'play', playerId, cardId: chosen });
  }

  private dispatch(room: Room, action: GameAction): Ack {
    if (!room.game || room.status !== 'playing') return fail('WRONG_PHASE');
    const result = applyAction(room.game, action);
    if (!result.ok) return fail(result.error);
    room.game = result.state;
    this.afterGameChange(room);
    return OK;
  }

  /** Schedules whatever happens next (trick collection, next round, bots, waiting) and broadcasts. */
  private afterGameChange(room: Room): void {
    this.touch(room);
    if (room.gameTimer) clearTimeout(room.gameTimer);
    room.gameTimer = null;
    room.waitingFor = null;
    const game = room.game;
    if (!game) return;

    const later = (ms: number, fn: () => void) => {
      room.gameTimer = setTimeout(() => {
        room.gameTimer = null;
        if (this.rooms.get(room.code) === room) fn();
      }, ms);
    };

    switch (game.phase) {
      case 'trickEnd':
        later(this.timings.trickPauseMs, () => this.dispatch(room, { type: 'collectTrick' }));
        break;
      case 'roundSummary':
        later(this.timings.roundSummaryMs, () => this.dispatch(room, { type: 'nextRound' }));
        break;
      case 'gameOver':
        room.status = 'finished';
        break;
      case 'betting':
      case 'playing': {
        const member = room.members.find((m) => m.id === game.turnPlayerId);
        if (!member) break;
        if (member.autoPlay) {
          later(this.timings.botDelayMs, () => this.botAct(room, member));
        } else if (member.socketId === null) {
          room.waitingFor = { playerId: member.id, deadline: Date.now() + this.timings.reconnectGraceMs };
          later(this.timings.reconnectGraceMs, () => {
            member.autoPlay = true;
            this.afterGameChange(room);
          });
        }
        break;
      }
    }
    this.broadcast(room);
  }

  private botAct(room: Room, member: Member): void {
    const game = room.game;
    if (!game || game.turnPlayerId !== member.id) return;
    const view = getPlayerView(game, member.id);
    const result =
      game.phase === 'betting'
        ? this.dispatch(room, { type: 'bet', playerId: member.id, bet: chooseBotBet(view) })
        : this.playFor(room, member.id, chooseBotCard(view) ?? undefined);
    if (!result.ok) console.error(`[room ${room.code}] bot action failed: ${result.error}`);
  }

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  disconnect(socket: GameSocket): void {
    const ctx = this.context(socket);
    if (!ctx || ctx.member.socketId !== socket.id) return;
    ctx.member.socketId = null;
    this.onConnectivityChange(ctx.room, ctx.member);
  }

  private attach(room: Room, member: Member, socket: GameSocket): void {
    // A socket belongs to one room at a time.
    const previous = this.context(socket);
    if (previous && previous.member !== member) this.leave(socket);

    const oldSocketId = member.socketId;
    member.socketId = socket.id;
    socket.data = { code: room.code, playerId: member.id };
    void socket.join(room.code);
    // Same player opened another tab: the newest connection wins.
    if (oldSocketId && oldSocketId !== socket.id) this.io.sockets.sockets.get(oldSocketId)?.disconnect(true);

    this.onConnectivityChange(room, member);
  }

  private onConnectivityChange(room: Room, member: Member): void {
    const connected = room.members.filter((m) => m.socketId !== null);

    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
    if (connected.length === 0) {
      room.emptyTimer = setTimeout(() => this.closeRoom(room, 'everyoneLeft'), this.timings.emptyRoomTtlMs);
    }

    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.hostTimer = null;
    const host = room.members.find((m) => m.id === room.hostId);
    if (!host || (host.socketId === null && connected.length > 0)) {
      room.hostTimer = setTimeout(() => {
        room.hostTimer = null;
        this.transferHost(room);
        this.broadcast(room);
      }, this.timings.hostGraceMs);
    }

    const game = room.game;
    const theirTurn =
      room.status === 'playing' &&
      game?.turnPlayerId === member.id &&
      (game.phase === 'betting' || game.phase === 'playing');
    if (theirTurn) this.afterGameChange(room);
    else this.broadcast(room);
  }

  private transferHost(room: Room): void {
    const current = room.members.find((m) => m.id === room.hostId);
    if (current?.socketId) return;
    const next = room.members.find((m) => m.socketId !== null) ?? room.members[0];
    if (next) room.hostId = next.id;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private context(socket: GameSocket): { room: Room; member: Member } | null {
    const { code, playerId } = socket.data ?? {};
    const room = code ? this.rooms.get(code) : undefined;
    const member = room?.members.find((m) => m.id === playerId);
    return room && member ? { room, member } : null;
  }

  private hostContext(socket: GameSocket): { ok: true; room: Room; member: Member } | { ok: false; error: ErrorCode } {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (ctx.room.hostId !== ctx.member.id) return fail('NOT_HOST');
    return { ok: true, ...ctx };
  }

  private viewFor(room: Room, memberId: string): RoomView {
    return {
      code: room.code,
      youId: memberId,
      hostId: room.hostId,
      status: room.status,
      settings: room.settings,
      members: room.members.map((m) => ({
        id: m.id,
        name: m.name,
        isHost: m.id === room.hostId,
        connected: m.socketId !== null,
        autoPlay: m.autoPlay,
      })),
      // The only game data that leaves the server: filtered per player.
      game: room.game ? getPlayerView(room.game, memberId) : null,
      waitingFor: room.waitingFor,
    };
  }

  private broadcast(room: Room): void {
    for (const member of room.members) {
      if (member.socketId) this.io.to(member.socketId).emit('room:state', this.viewFor(room, member.id));
    }
  }

  private touch(room: Room): void {
    room.lastActivity = Date.now();
  }

  private clearTimers(room: Room): void {
    for (const timer of [room.gameTimer, room.hostTimer, room.emptyTimer]) if (timer) clearTimeout(timer);
    room.gameTimer = room.hostTimer = room.emptyTimer = null;
  }

  private closeRoom(room: Room, reason: RoomClosedReason): void {
    this.clearTimers(room);
    this.rooms.delete(room.code);
    for (const member of room.members) {
      const socket = member.socketId ? this.io.sockets.sockets.get(member.socketId) : undefined;
      if (!socket) continue;
      socket.data = {};
      void socket.leave(room.code);
      socket.emit('room:closed', reason);
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.lastActivity > this.timings.idleRoomTtlMs) this.closeRoom(room, 'idle');
    }
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}

function newMember(name: string): Member {
  return { id: randomUUID().slice(0, 8), name, token: randomUUID(), socketId: null, autoPlay: false };
}

function session(room: Room, member: Member): Session {
  return { code: room.code, playerId: member.id, token: member.token };
}

function validName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\p{C}/gu, '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
}

function validSettings(current: GameSettings, patch: unknown): GameSettings | null {
  if (typeof patch !== 'object' || patch === null) return null;
  const p = patch as Partial<Record<keyof GameSettings, unknown>>;
  const next = { ...current };

  if (p.word !== undefined) {
    if (typeof p.word !== 'string') return null;
    const word = p.word.trim().toUpperCase();
    const letters = wordLetters(word).length;
    if (letters < 1 || letters > MAX_WORD_LETTERS || word.length > 20) return null;
    next.word = word;
  }
  if (p.maxCards !== undefined) {
    if (typeof p.maxCards !== 'number' || !Number.isInteger(p.maxCards) || p.maxCards < 1 || p.maxCards > 6) return null;
    next.maxCards = p.maxCards;
  }
  if (p.cardCountMode !== undefined) {
    if (p.cardCountMode !== 'upDown' && p.cardCountMode !== 'restart') return null;
    next.cardCountMode = p.cardCountMode;
  }
  return next;
}
