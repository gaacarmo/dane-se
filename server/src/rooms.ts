import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  type Ack,
  type CharacterId,
  type ChatMessage,
  type ClientToServerEvents,
  type Entry,
  type ErrorCode,
  type GameSettings,
  type GameType,
  type PlayerView,
  type PokerSettings,
  type PokerView,
  type ProfileView,
  type RoomClosedReason,
  type RoomStatus,
  type RoomView,
  type RoomViewBase,
  type ServerToClientEvents,
  type Session,
  CHARACTER_IDS,
  CHAT_HISTORY,
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  POKER_TURN_TIMEOUT_MS,
  REACTIONS,
  REACTION_COOLDOWN_MS,
  LOOK_INTERVAL_MS,
  type VoiceSignal,
  ROOM_CODE_LENGTH,
  assertConservation,
  isCharacterId,
  isValidMoney,
  normalizeRoomCode,
} from '@dane-se/shared';
import { type AnyGameModule, gameModule } from './hub/registry.js';
import type { ProfileRow } from './hub/store.js';
import { WalletService } from './hub/walletService.js';

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
  /** Rebuy window between hands of a cash-game (poker bust). */
  betweenHandsMs: number;
  /** How long a player has to act before auto check/fold (poker). */
  turnTimeoutMs: number;
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
  betweenHandsMs: 30_000,
  turnTimeoutMs: POKER_TURN_TIMEOUT_MS,
};

/** A seated player who times out this many turns in a row is sat out (bot plays). */
export const SIT_OUT_AFTER_TIMEOUTS = 2;

export interface SocketData {
  code?: string;
  playerId?: string;
  /** The wallet this socket belongs to (set by `profile:hello`). */
  profileId?: string;
}

/** An SDP description is a few KB; anything much bigger is not a real signal. */
const MAX_VOICE_SIGNAL_BYTES = 16_000;

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface Member {
  id: string;
  profileId: string;
  name: string;
  token: string;
  socketId: string | null;
  autoPlay: boolean;
  isBot: boolean;
  lastReactionAt: number;
  lastLookAt: number;
  inVoice: boolean;
  character: CharacterId;
  /** What this member paid into the room, or null if nothing (yet). */
  entry: number | null;
  /** Consecutive turns this player let the clock run out (poker). */
  timeouts: number;
}

interface Room {
  /** Unique per room (never reused), used as the settlement key prefix. */
  id: string;
  code: string;
  gameType: GameType;
  hostId: string;
  status: RoomStatus;
  settings: Record<string, unknown>;
  /** A room with bots is "treino": no money moves. */
  practice: boolean;
  /** Join order = seat order. */
  members: Member[];
  game: unknown;
  /** Increments on every start; settlements are keyed room+game. */
  gameSeq: number;
  waitingFor: { playerId: string; deadline: number } | null;
  chat: ChatMessage[];
  chatSeq: number;
  gameTimer: NodeJS.Timeout | null;
  hostTimer: NodeJS.Timeout | null;
  emptyTimer: NodeJS.Timeout | null;
  lastActivity: number;
  /** Sum of entries currently held by the room. */
  paidTotal: number;
  settled: boolean;
  results: RoomView['results'];
}

const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels: no accidental words, no 0/O confusion
const BOT_NAMES = ['Zé Robô', 'Tia Bot', 'Bot do Bar', 'Robozão', 'Dona Bot', 'Seu Chip', 'Bot Anônimo', 'Zé Ficha'];

const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });
const OK = { ok: true } as const;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly io: IO,
    private readonly wallets: WalletService,
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
    for (const room of this.rooms.values()) {
      if (!room.settled) this.refundRoom(room);
      this.clearTimers(room);
    }
    this.rooms.clear();
    void this.wallets.flush();
  }

  // -------------------------------------------------------------------------
  // Profiles / wallet
  // -------------------------------------------------------------------------

  recommendHello(socket: GameSocket, token: unknown, nickname: unknown): Ack<{ token: string; profile: ProfileView }> {
    if (typeof token === 'string' && token) {
      const existing = this.wallets.profileByToken(token);
      if (existing) {
        socket.data.profileId = existing.id;
        const profile = this.wallets.profileView(existing);
        socket.emit('profile:state', profile);
        return { ok: true, token: existing.token, profile };
      }
    }
    const name = validName(nickname);
    if (!name) return fail('INVALID_NAME');
    const created = this.wallets.createProfile(name);
    socket.data.profileId = created.id;
    const profile = this.wallets.profileView(created);
    return { ok: true, token: created.token, profile };
  }

  renameProfile(socket: GameSocket, nickname: unknown): Ack<{ profile: ProfileView }> {
    const profile = this.profileFor(socket);
    if (!profile) return fail('WALLET_NOT_FOUND');
    const name = validName(nickname);
    if (!name) return fail('INVALID_NAME');
    this.wallets.rename(profile.id, name);
    const ctx = this.context(socket);
    if (ctx) {
      ctx.member.name = name;
      this.touch(ctx.room);
      this.broadcast(ctx.room);
    }
    const view = this.wallets.profileView({ ...profile, nickname: name });
    this.pushProfile(socket, view);
    return { ok: true, profile: view };
  }

  refill(socket: GameSocket): Ack<{ profile: ProfileView }> {
    const profile = this.profileFor(socket);
    if (!profile) return fail('WALLET_NOT_FOUND');
    const result = this.wallets.refill(profile);
    if (typeof result === 'string') return fail(result);
    return { ok: true, profile: result };
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  create(socket: GameSocket, payload: { name?: unknown; gameType?: unknown; settings?: unknown }): Ack<Session> {
    const gameType = typeof payload.gameType === 'string' ? (payload.gameType as GameType) : 'danese';
    const module = gameModule(gameType);
    if (!module) return fail('INVALID_GAME');

    const resolved = this.ensureProfile(socket, payload.name);
    if ('error' in resolved) return fail(resolved.error);
    const { profile } = resolved;
    if (this.roomOfProfile(profile.id)) return fail('ALREADY_IN_ROOM');

    const settings = module.validateSettings(payload.settings ?? {});
    if (!settings) return fail('INVALID_SETTINGS');

    const member = newMember(profile);
    const room: Room = {
      id: randomUUID(),
      code: this.newCode(),
      gameType,
      hostId: member.id,
      status: 'lobby',
      settings: settings as Record<string, unknown>,
      practice: false,
      members: [member],
      game: null,
      gameSeq: 0,
      waitingFor: null,
      chat: [],
      chatSeq: 0,
      gameTimer: null,
      hostTimer: null,
      emptyTimer: null,
      lastActivity: Date.now(),
      paidTotal: 0,
      settled: false,
      results: null,
    };
    this.rooms.set(room.code, room);
    this.attach(room, member, socket);
    return { ok: true, ...session(room, member) };
  }

  join(socket: GameSocket, rawCode: unknown, rawName: unknown): Ack<Session> {
    const room = typeof rawCode === 'string' ? this.rooms.get(normalizeRoomCode(rawCode)) : undefined;
    if (!room) return fail('ROOM_NOT_FOUND');
    const module = gameModule(room.gameType);
    if (!module) return fail('INVALID_GAME');
    if (room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (room.members.length >= module.maxPlayers) return fail('ROOM_FULL');

    const resolved = this.ensureProfile(socket, rawName);
    if ('error' in resolved) return fail(resolved.error);
    const { profile } = resolved;
    if (this.roomOfProfile(profile.id)) return fail('ALREADY_IN_ROOM');
    if (room.members.some((m) => m.name.toLowerCase() === profile.nickname.toLowerCase())) return fail('NAME_TAKEN');

    // Money is only charged at the start (so a lobby with bots can still become "treino"),
    // but we check up front so a broke player gets a clear error before sitting down.
    if (!room.practice) {
      const entry = module.entryFor(room.settings);
      if (!isValidMoney(entry) || entry < module.minEntry) return fail('INVALID_ENTRY');
      if (this.wallets.balance(profile.id) < entry) return fail('INSUFFICIENT_BALANCE');
    }

    const member = newMember(profile, room.members.map((m) => m.character));
    room.members.push(member);
    this.attach(room, member, socket);
    return { ok: true, ...session(room, member) };
  }

  resume(socket: GameSocket, rawCode: unknown, token: unknown): Ack<Session> {
    const room = typeof rawCode === 'string' ? this.rooms.get(normalizeRoomCode(rawCode)) : undefined;
    if (!room) return fail('ROOM_NOT_FOUND');
    const member = room.members.find((m) => m.token === token);
    if (!member) return fail('SESSION_NOT_FOUND');

    socket.data.profileId = member.profileId;
    member.autoPlay = false;
    this.attach(room, member, socket);
    return { ok: true, ...session(room, member) };
  }

  leave(socket: GameSocket): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    const { room, member } = ctx;
    this.dropVoice(room, member);
    const profileId = socket.data.profileId;
    socket.data = profileId ? { profileId } : {};
    void socket.leave(room.code);

    if (room.status === 'playing') {
      // Keep the seat: a bot plays for them (they can still come back with their token).
      // In a money room the entry stays in the pot (leaving mid-game forfeits it).
      member.socketId = null;
      member.autoPlay = true;
      this.onConnectivityChange(room, member);
      return OK;
    }

    room.members = room.members.filter((m) => m !== member);
    if (!room.members.some((m) => !m.isBot)) {
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
    const module = gameModule(room.gameType);
    if (!module) return fail('INVALID_GAME');
    if (typeof patch !== 'object' || patch === null) return fail('INVALID_SETTINGS');

    const settings = module.validateSettings({ ...room.settings, ...(patch as Record<string, unknown>) });
    if (!settings) return fail('INVALID_SETTINGS');
    room.settings = settings as Record<string, unknown>;
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  chat(socket: GameSocket, rawText: unknown): Ack {
    const { code, playerId } = socket.data;
    const room = code ? this.rooms.get(code) : undefined;
    const member = room?.members.find((m) => m.id === playerId);
    if (!room || !member) return fail('NOT_IN_ROOM');
    if (typeof rawText !== 'string') return fail('INVALID_PAYLOAD');
    const text = rawText.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return fail('INVALID_PAYLOAD');
    const now = Date.now();
    const last = [...room.chat].reverse().find((m) => m.playerId === member.id);
    if (last && now - last.at < 600) return fail('CHAT_TOO_FAST');
    room.chat.push({ id: ++room.chatSeq, playerId: member.id, name: member.name, text, at: now });
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  setCharacter(socket: GameSocket, character: unknown): Ack {
    const { code, playerId } = socket.data;
    const room = code ? this.rooms.get(code) : undefined;
    const member = room?.members.find((m) => m.id === playerId);
    if (!room || !member) return fail('NOT_IN_ROOM');
    if (!isCharacterId(character)) return fail('INVALID_PAYLOAD');
    member.character = character;
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  addBot(socket: GameSocket): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return ctx;
    const { room } = ctx;
    const module = gameModule(room.gameType);
    if (!module) return fail('INVALID_GAME');
    if (room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (room.members.length >= module.maxPlayers) return fail('ROOM_FULL');
    // A bot makes the room "treino" (no money). Since entries are only charged at
    // the start, in the lobby nobody has paid yet and this always flips cleanly.
    if (room.paidTotal > 0) return fail('PRACTICE_LOCKED');
    room.practice = true;

    const taken = new Set(room.members.map((m) => m.name.toLowerCase()));
    const name = BOT_NAMES.find((n) => !taken.has(n.toLowerCase())) ?? `Bot ${room.members.length + 1}`;
    room.members.push({ ...newMember({ id: '', token: '', nickname: name, createdAt: 0 }), autoPlay: true, isBot: true });
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

    this.removeMember(room, target);
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  start(socket: GameSocket): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return ctx;
    const { room } = ctx;
    const module = gameModule(room.gameType);
    if (!module) return fail('INVALID_GAME');
    if (room.status !== 'lobby') return fail('GAME_IN_PROGRESS');
    if (room.members.length < module.minPlayers) return fail('NOT_ENOUGH_PLAYERS');

    const collected = this.collectEntries(room, module);
    if (collected) return fail(collected);

    room.gameSeq += 1;
    const created = module.create(
      room.members.map((m) => ({ id: m.id, name: m.name })),
      room.settings,
      randomInt(2 ** 31),
    );
    if (!created.ok) return fail(created.error);
    room.game = created.state;
    room.status = 'playing';
    room.settled = false;
    room.results = null;
    for (const m of room.members) {
      m.timeouts = 0;
      m.autoPlay = m.isBot;
    }
    this.afterGameChange(room);
    return OK;
  }

  rematch(socket: GameSocket): Ack {
    const ctx = this.hostContext(socket);
    if (!ctx.ok) return ctx;
    const { room } = ctx;
    if (room.status !== 'finished') return fail('WRONG_PHASE');
    const module = gameModule(room.gameType);
    if (!module) return fail('INVALID_GAME');

    room.status = 'lobby';
    room.game = null;
    room.waitingFor = null;
    room.settled = false;
    room.results = null;
    room.paidTotal = 0;
    // Players who left for good don't come back to the lobby; bots stay.
    room.members = room.members.filter((m) => m.isBot || m.socketId !== null);
    for (const m of room.members) {
      m.autoPlay = m.isBot;
      m.entry = null;
      m.timeouts = 0;
    }
    // Anyone who can't afford the next entry leaves (they can be replaced/rejoin).
    if (!room.practice) {
      const entry = module.entryFor(room.settings);
      for (const m of [...room.members]) {
        if (!m.isBot && this.wallets.balance(m.profileId) < entry) this.removeMember(room, m);
      }
    }
    if (!room.members.some((m) => m.id === room.hostId)) this.transferHost(room);
    this.touch(room);
    this.broadcast(room);
    return OK;
  }

  /** Emoji reaction: not part of the game state, just relayed to everyone in the room. */
  /** First-person head movement: relayed to the others, never stored. */
  look(socket: GameSocket, payload: unknown): void {
    const ctx = this.context(socket);
    if (!ctx || !payload || typeof payload !== 'object') return;
    const { yaw, pitch } = payload as { yaw?: unknown; pitch?: unknown };
    if (typeof yaw !== 'number' || typeof pitch !== 'number' || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    const now = Date.now();
    if (now - ctx.member.lastLookAt < LOOK_INTERVAL_MS) return;
    ctx.member.lastLookAt = now;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    socket.to(ctx.room.code).emit('room:look', { playerId: ctx.member.id, yaw: clamp(yaw), pitch: clamp(pitch) });
  }

  voiceJoin(socket: GameSocket): Ack<{ peers: string[] }> {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    const peers = ctx.room.members.filter((m) => m !== ctx.member && m.inVoice && m.socketId).map((m) => m.id);
    if (!ctx.member.inVoice) {
      ctx.member.inVoice = true;
      socket.to(ctx.room.code).emit('voice:joined', { playerId: ctx.member.id });
    }
    return { ok: true, peers };
  }

  voiceLeave(socket: GameSocket): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    this.dropVoice(ctx.room, ctx.member);
    return OK;
  }

  /** Passes a WebRTC offer/answer/candidate to one other player in voice, in the same room. */
  voiceSignal(socket: GameSocket, payload: unknown): void {
    const ctx = this.context(socket);
    if (!ctx || !ctx.member.inVoice || !payload || typeof payload !== 'object') return;
    const { to, data } = payload as { to?: unknown; data?: unknown };
    const target = ctx.room.members.find((m) => m.id === to && m !== ctx.member);
    if (!target?.inVoice || !target.socketId) return;
    if (!data || typeof data !== 'object' || JSON.stringify(data).length > MAX_VOICE_SIGNAL_BYTES) return;
    this.io.to(target.socketId).emit('voice:signal', { from: ctx.member.id, data: data as VoiceSignal });
  }

  private dropVoice(room: Room, member: Member): void {
    if (!member.inVoice) return;
    member.inVoice = false;
    this.io.to(room.code).emit('voice:left', { playerId: member.id });
  }

  react(socket: GameSocket, emoji: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (!(REACTIONS as readonly unknown[]).includes(emoji)) return fail('INVALID_PAYLOAD');
    const now = Date.now();
    if (now - ctx.member.lastReactionAt < REACTION_COOLDOWN_MS) return fail('TOO_FAST');
    ctx.member.lastReactionAt = now;
    this.io.to(ctx.room.code).emit('room:reaction', {
      id: randomUUID().slice(0, 8),
      playerId: ctx.member.id,
      emoji: emoji as string,
    });
    return OK;
  }

  // -------------------------------------------------------------------------
  // Game actions
  // -------------------------------------------------------------------------

  bet(socket: GameSocket, bet: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (typeof bet !== 'number') return fail('INVALID_PAYLOAD');
    const module = gameModule(ctx.room.gameType);
    if (!module || !ctx.room.game) return fail('WRONG_PHASE');
    const built = module.betAction(ctx.room.game, ctx.member.id, bet);
    if (!built.ok) return fail(built.error);
    return this.dispatchHuman(ctx.room, ctx.member, built.action);
  }

  play(socket: GameSocket, rawCardId: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (rawCardId !== undefined && typeof rawCardId !== 'string') return fail('INVALID_PAYLOAD');
    const module = gameModule(ctx.room.gameType);
    if (!module || !ctx.room.game) return fail('WRONG_PHASE');
    const built = module.playAction(ctx.room.game, ctx.member.id, rawCardId);
    if (!built.ok) return fail(built.error === 'INVALID_ACTION' ? 'INVALID_PAYLOAD' : built.error);
    return this.dispatchHuman(ctx.room, ctx.member, built.action);
  }

  /**
   * Named, amount-free actions (poker: fold/check/call/all-in) and `rebuy`.
   * Engines without `commandAction` reject everything here.
   */
  action(socket: GameSocket, payload: unknown): Ack {
    const ctx = this.context(socket);
    if (!ctx) return fail('NOT_IN_ROOM');
    if (typeof payload !== 'object' || payload === null) return fail('INVALID_PAYLOAD');
    const { type, amount } = payload as { type?: unknown; amount?: unknown };
    if (type === 'rebuy') return this.rebuy(ctx, amount);
    const module = gameModule(ctx.room.gameType);
    if (!module || !ctx.room.game) return fail('WRONG_PHASE');
    if (!module.commandAction) return fail('INVALID_PAYLOAD');
    const built = module.commandAction(ctx.room.game, ctx.member.id, payload);
    if (!built.ok) return fail(built.error === 'INVALID_ACTION' ? 'INVALID_PAYLOAD' : built.error);
    return this.dispatchHuman(ctx.room, ctx.member, built.action);
  }

  /**
   * Between-hands rebuy. Money rooms charge the wallet first and refund if the
   * engine rejects the action; the amount is added to the player's escrow so
   * the settlement still balances.
   */
  private rebuy(ctx: { room: Room; member: Member }, rawAmount: unknown): Ack {
    const { room, member } = ctx;
    const module = gameModule(room.gameType);
    if (!module || !room.game) return fail('WRONG_PHASE');
    if (!module.rebuyAction) return fail('INVALID_PAYLOAD');
    const built = module.rebuyAction(room.game, member.id, rawAmount);
    if (!built.ok) return fail(built.error === 'INVALID_ACTION' ? 'INVALID_PAYLOAD' : built.error);

    const cost = room.practice ? 0 : built.cost;
    if (cost > 0) {
      const error = this.wallets.debit(member.profileId, cost, 'rebuy', room.code);
      if (error) return fail(error);
    }
    const result = module.apply(room.game, built.action);
    if (!result.ok) {
      if (cost > 0) this.wallets.credit(member.profileId, cost, 'refund', room.code);
      return fail(result.error);
    }
    room.game = result.state;
    if (!room.practice) {
      member.entry = (member.entry ?? 0) + built.cost;
      room.paidTotal += built.cost;
      this.pushProfileFor(member);
    }
    member.autoPlay = false;
    member.timeouts = 0;
    this.afterGameChange(room);
    return OK;
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

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  disconnect(socket: GameSocket): void {
    const ctx = this.context(socket);
    if (!ctx || ctx.member.socketId !== socket.id) return;
    this.dropVoice(ctx.room, ctx.member);
    ctx.member.socketId = null;
    this.onConnectivityChange(ctx.room, ctx.member);
  }

  // -------------------------------------------------------------------------
  // Money
  // -------------------------------------------------------------------------

  /**
   * Charges the entry to every human in the room (once). Returns an error code
   * if anyone can't afford it, in which case nothing was charged.
   */
  private collectEntries(room: Room, module: AnyGameModule): ErrorCode | null {
    if (room.practice) return null;
    const entry = module.entryFor(room.settings);
    if (!isValidMoney(entry) || entry < module.minEntry) return 'INVALID_ENTRY';

    const humans = room.members.filter((m) => !m.isBot);
    for (const m of humans) {
      if (m.entry === entry) continue;
      if (this.wallets.balance(m.profileId) < entry) return 'INSUFFICIENT_BALANCE';
    }
    for (const m of humans) {
      if (m.entry === entry) continue;
      const error = this.wallets.debit(m.profileId, entry, 'buyIn', room.code);
      if (error) return error;
      m.entry = entry;
      room.paidTotal += entry;
      this.pushProfileFor(m);
    }
    return null;
  }

  /** Pays the pot once, when a game finishes. Idempotent per (room, game). */
  private settleRoom(room: Room): void {
    if (room.settled) return;
    const module = gameModule(room.gameType);
    if (!module || !room.game) return;

    const payers = room.members.filter((m) => m.entry !== null);
    const entries: Entry[] = payers.map((m) => ({ playerId: m.id, amount: m.entry! }));
    const payouts = module.settle(room.game, entries);
    try {
      assertConservation(entries, payouts);
    } catch (error) {
      console.error(`[room ${room.code}] settlement not conserved`, error);
    }

    const byId = new Map(room.members.map((m) => [m.id, m]));
    if (!room.practice && room.paidTotal > 0) {
      const credits = payouts
        .map((p) => ({ profileId: byId.get(p.playerId)?.profileId ?? '', amount: p.amount, place: p.place }))
        .filter((c) => c.profileId);
      this.wallets.settle(`${room.id}:${room.gameSeq}`, credits);
    }
    room.settled = true;
    room.results = payouts.map((p) => ({
      playerId: p.playerId,
      name: byId.get(p.playerId)?.name ?? '?',
      amount: p.amount,
      place: p.place,
    }));
    for (const m of room.members) this.pushProfileFor(m);
  }

  /** Refunds everything still held when a room closes before it is settled. */
  private refundRoom(room: Room): void {
    if (room.practice || room.settled) return;
    for (const m of room.members) {
      if (m.entry === null) continue;
      this.wallets.credit(m.profileId, m.entry, 'refund', room.code);
      this.pushProfileFor(m);
      m.entry = null;
    }
    room.paidTotal = 0;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private dispatch(room: Room, action: unknown): Ack {
    if (!room.game || room.status !== 'playing') return fail('WRONG_PHASE');
    const module = gameModule(room.gameType);
    if (!module) return fail('INVALID_GAME');
    const result = module.apply(room.game, action);
    if (!result.ok) return fail(result.error);
    room.game = result.state;
    this.afterGameChange(room);
    return OK;
  }

  /** A human move: clears any sit-out/timeout state so sending it means "I'm back". */
  private dispatchHuman(room: Room, member: Member, action: unknown): Ack {
    member.autoPlay = false;
    member.timeouts = 0;
    return this.dispatch(room, action);
  }

  /** Schedules whatever happens next and broadcasts. */
  private afterGameChange(room: Room): void {
    this.touch(room);
    if (room.gameTimer) clearTimeout(room.gameTimer);
    room.gameTimer = null;
    room.waitingFor = null;
    const game = room.game;
    const module = gameModule(room.gameType);
    if (!game || !module) return;

    const later = (ms: number, fn: () => void) => {
      room.gameTimer = setTimeout(() => {
        room.gameTimer = null;
        if (this.rooms.get(room.code) === room) fn();
      }, ms);
    };

    if (module.isFinished(game)) {
      room.status = 'finished';
      this.settleRoom(room);
      this.broadcast(room);
      return;
    }

    const step = module.auto(game);
    if (step) {
      later(this.delayFor(step.delay), () => this.dispatch(room, step.action));
      this.broadcast(room);
      return;
    }

    const actorId = module.actorId(game);
    const member = actorId ? room.members.find((m) => m.id === actorId) : undefined;
    if (member) {
      if (member.autoPlay) {
        // A little variation so bots don't feel mechanical.
        later(this.timings.botDelayMs * (0.8 + Math.random() * 0.6), () => this.botAct(room, member));
      } else if (member.socketId === null) {
        room.waitingFor = { playerId: member.id, deadline: Date.now() + this.timings.reconnectGraceMs };
        later(this.timings.reconnectGraceMs, () => {
          member.autoPlay = true;
          this.afterGameChange(room);
        });
      } else if (module.timeoutAction) {
        // Connected but slow: give them the clock, then auto check/fold.
        later(this.timings.turnTimeoutMs, () => this.timeoutAct(room, member));
      }
    }
    this.broadcast(room);
  }

  private delayFor(delay: 'trickPause' | 'roundSummary' | 'betweenHands'): number {
    if (delay === 'trickPause') return this.timings.trickPauseMs;
    if (delay === 'roundSummary') return this.timings.roundSummaryMs;
    return this.timings.betweenHandsMs;
  }

  private botAct(room: Room, member: Member): void {
    const module = gameModule(room.gameType);
    const game = room.game;
    if (!module || !game || module.actorId(game) !== member.id) return;
    const step = module.botAction(game, member.id, randomInt(2 ** 31));
    if (!step) return;
    const result = this.dispatch(room, step.action);
    if (!result.ok) console.error(`[room ${room.code}] bot action failed: ${result.error}`);
  }

  /** The clock ran out: force a check/fold and sit the player out after enough misses. */
  private timeoutAct(room: Room, member: Member): void {
    const module = gameModule(room.gameType);
    const game = room.game;
    if (!module || !game || !module.timeoutAction) return;
    if (module.actorId(game) !== member.id) return; // stale timer
    const action = module.timeoutAction(game, member.id);
    if (!action) return;
    member.timeouts += 1;
    member.autoPlay = member.timeouts >= SIT_OUT_AFTER_TIMEOUTS;
    const result = this.dispatch(room, action);
    if (!result.ok) console.error(`[room ${room.code}] timeout action failed: ${result.error}`);
  }

  private attach(room: Room, member: Member, socket: GameSocket): void {
    // A socket belongs to one room at a time.
    const previous = this.context(socket);
    if (previous && previous.member !== member) this.leave(socket);

    const profileId = socket.data.profileId;
    const oldSocketId = member.socketId;
    member.socketId = socket.id;
    socket.data = { ...(profileId ? { profileId } : {}), code: room.code, playerId: member.id };
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

    const module = gameModule(room.gameType);
    const theirTurn =
      room.status === 'playing' && room.game && module ? module.actorId(room.game) === member.id : false;
    if (theirTurn) this.afterGameChange(room);
    else this.broadcast(room);
  }

  private removeMember(room: Room, member: Member): void {
    this.dropVoice(room, member);
    room.members = room.members.filter((m) => m !== member);
    const socket = member.socketId ? this.io.sockets.sockets.get(member.socketId) : undefined;
    if (socket) {
      const profileId = socket.data.profileId;
      socket.data = profileId ? { profileId } : {};
      void socket.leave(room.code);
      socket.emit('room:kicked');
    }
    if (room.hostId === member.id) this.transferHost(room);
  }

  private transferHost(room: Room): void {
    const current = room.members.find((m) => m.id === room.hostId);
    if (current?.socketId) return;
    const next = room.members.find((m) => m.socketId !== null) ?? room.members.find((m) => !m.isBot);
    if (next) room.hostId = next.id;
  }

  private profileFor(socket: GameSocket): ProfileRow | null {
    const id = socket.data.profileId;
    return id ? (this.wallets.profileById(id) ?? null) : null;
  }

  private ensureProfile(socket: GameSocket, rawName: unknown): { profile: ProfileRow } | { error: ErrorCode } {
    const existing = this.profileFor(socket);
    if (existing) return { profile: existing };
    const name = validName(rawName);
    if (!name) return { error: 'INVALID_NAME' };
    const profile = this.wallets.createProfile(name);
    socket.data.profileId = profile.id;
    this.pushProfile(socket, this.wallets.profileView(profile));
    return { profile };
  }

  private roomOfProfile(profileId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.members.some((m) => !m.isBot && m.profileId === profileId)) return room;
    }
    return undefined;
  }

  private pushProfile(socket: GameSocket, profile: ProfileView): void {
    socket.emit('profile:state', profile);
  }

  private pushProfileFor(member: Member): void {
    if (!member.socketId) return;
    const profile = this.wallets.profileById(member.profileId);
    if (profile) this.io.to(member.socketId).emit('profile:state', this.wallets.profileView(profile));
  }

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
    const module = gameModule(room.gameType);
    const entry = module && !room.practice ? module.entryFor(room.settings) : 0;
    const base: RoomViewBase = {
      code: room.code,
      youId: memberId,
      hostId: room.hostId,
      status: room.status,
      members: room.members.map((m) => ({
        id: m.id,
        name: m.name,
        isHost: m.id === room.hostId,
        connected: m.isBot || m.socketId !== null,
        autoPlay: m.autoPlay,
        isBot: m.isBot,
        character: m.character,
        entry: m.entry,
      })),
      money: { entry, pot: room.paidTotal, practice: room.practice, settled: room.settled },
      results: room.results,
      waitingFor: room.waitingFor,
      chat: room.chat,
    };
    // The only game data that leaves the server: filtered per player.
    const game = room.game && module ? module.viewFor(room.game, memberId) : null;
    if (room.gameType === 'poker') {
      return { ...base, gameType: 'poker', settings: room.settings as unknown as PokerSettings, game: game as PokerView | null };
    }
    return { ...base, gameType: 'danese', settings: room.settings as unknown as GameSettings, game: game as PlayerView | null };
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
    if (!room.settled) this.refundRoom(room);
    for (const member of room.members) {
      const socket = member.socketId ? this.io.sockets.sockets.get(member.socketId) : undefined;
      if (!socket) continue;
      const profileId = socket.data.profileId;
      socket.data = profileId ? { profileId } : {};
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

/** Prefers a character nobody in the room has yet; repeats are fine once all are taken. */
function pickCharacter(taken: CharacterId[]): CharacterId {
  const free = CHARACTER_IDS.filter((c) => !taken.includes(c));
  const pool = free.length > 0 ? free : CHARACTER_IDS;
  return pool[randomInt(pool.length)]!;
}

function newMember(profile: ProfileRow, taken: CharacterId[] = []): Member {
  return {
    id: randomUUID().slice(0, 8),
    profileId: profile.id,
    name: profile.nickname,
    token: randomUUID(),
    socketId: null,
    autoPlay: false,
    isBot: false,
    lastReactionAt: 0,
    lastLookAt: 0,
    inVoice: false,
    character: pickCharacter(taken),
    entry: null,
    timeouts: 0,
  };
}

function session(room: Room, member: Member): Session {
  return { code: room.code, token: member.token, playerId: member.id };
}

function validName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\p{C}/gu, '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
}
