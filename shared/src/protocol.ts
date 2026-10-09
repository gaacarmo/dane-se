import type { CharacterId } from './characters.js';
import type { GameError } from './games/danese/game.js';
import type { GameSettings } from './games/danese/rules.js';
import type { PlayerView } from './games/danese/view.js';
import type { PokerSettings } from './games/poker/rules.js';
import type { PokerView } from './games/poker/view.js';
import type { EngineError, GameType } from './hub/gameModule.js';
import type { Money } from './hub/money.js';

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomMember {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  /** A bot is playing for this player (they are disconnected, or this seat is a bot). */
  autoPlay: boolean;
  /** A bot added by the host to fill a seat. */
  isBot: boolean;
  /** Who the player looks like at the 3D table. Several players may pick the same one. */
  character: CharacterId;
  /** What this member put in the pot (buy-in), or null in practice rooms / before paying. */
  entry: Money | null;
}

export interface ChatMessage {
  id: number;
  playerId: string;
  /** Name when it was sent (the player may have left since). */
  name: string;
  text: string;
  at: number;
}

export const MAX_CHAT_LENGTH = 200;
/** Messages kept per room; older ones are dropped. */
export const CHAT_HISTORY = 50;

/** The money side of a room. */
export interface RoomMoney {
  /** Buy-in per player (0 in practice rooms). */
  entry: Money;
  /** Sum of buy-ins held by the room right now. */
  pot: Money;
  /** "Treino": no money moves for this room. */
  practice: boolean;
  /** True once the game ended and the pot was paid out. */
  settled: boolean;
}

/** One line of the post-game results screen. */
export interface ResultsEntry {
  playerId: string;
  name: string;
  amount: Money;
  /** 1-based finishing position. */
  place: number;
}

export interface RoomViewBase {
  code: string;
  youId: string;
  hostId: string;
  status: RoomStatus;
  /** In seat order (= play order). */
  members: RoomMember[];
  money: RoomMoney;
  /** Filled once the game is over and the pot settled. */
  results: ResultsEntry[] | null;
  /** The current player is disconnected; a bot takes over at `deadline` (epoch ms). */
  waitingFor: { playerId: string; deadline: number } | null;
  chat: ChatMessage[];
}

/** A room of Dane-se: the game view is the trick-round `PlayerView`. */
export interface DaneseRoomView extends RoomViewBase {
  gameType: 'danese';
  settings: GameSettings;
  game: PlayerView | null;
}

/** A room of Texas Hold'em: the game view is the `PokerView`. */
export interface PokerRoomView extends RoomViewBase {
  gameType: 'poker';
  settings: PokerSettings;
  game: PokerView | null;
}

/**
 * The whole room state as one client sees it. `gameType` discriminates the
 * union so components can narrow `game`/`settings` safely.
 */
export type RoomView = DaneseRoomView | PokerRoomView;

export function isDaneseRoom(room: RoomView): room is DaneseRoomView {
  return room.gameType === 'danese';
}

export function isPokerRoom(room: RoomView): room is PokerRoomView {
  return room.gameType === 'poker';
}

/** Everything the hub knows about a person. The client never sends amounts back. */
export interface ProfileView {
  id: string;
  nickname: string;
  balance: Money;
  /** True when the wallet may be refilled right now. */
  refillEligible: boolean;
  /** Epoch ms of the last refill (for the cooldown note). */
  refillAt: number;
}

export type ErrorCode =
  | GameError
  | EngineError
  | 'ROOM_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_NAME'
  | 'NAME_TAKEN'
  | 'INVALID_SETTINGS'
  | 'NOT_IN_ROOM'
  | 'INVALID_PAYLOAD'
  | 'TOO_FAST'
  | 'CHAT_TOO_FAST'
  | 'INVALID_GAME'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_ENTRY'
  | 'PRACTICE_LOCKED'
  | 'ALREADY_IN_ROOM'
  | 'WALLET_NOT_FOUND'
  | 'REFILL_NOT_ELIGIBLE';

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };
export type AckFn<T = object> = (result: Ack<T>) => void;

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

export interface ClientToServerEvents {
  /** Resume or create a profile. Omit the token on a first visit. */
  'profile:hello': (
    payload: { token?: string; nickname?: string },
    ack: AckFn<{ token: string; profile: ProfileView }>,
  ) => void;
  'profile:rename': (payload: { nickname: string }, ack: AckFn<{ profile: ProfileView }>) => void;
  'profile:refill': (ack: AckFn<{ profile: ProfileView }>) => void;
  'room:create': (
    payload: { name?: string; gameType?: GameType; settings?: Record<string, unknown> },
    ack: AckFn<Session>,
  ) => void;
  'room:join': (payload: { code: string; name?: string }, ack: AckFn<Session>) => void;
  'room:resume': (payload: { code: string; token: string }, ack: AckFn<Session>) => void;
  'room:leave': (ack: AckFn) => void;
  'room:settings': (payload: Partial<GameSettings>, ack: AckFn) => void;
  'room:start': (ack: AckFn) => void;
  'room:character': (payload: { character: CharacterId }, ack: AckFn) => void;
  'chat:send': (payload: { text: string }, ack: AckFn) => void;
  'room:kick': (payload: { playerId: string }, ack: AckFn) => void;
  /** Host: add a bot player to fill an empty seat (lobby only). Turns the room into "treino". */
  'room:addBot': (ack: AckFn) => void;
  /** Host: stop waiting for a disconnected player and let the bot play for them now. */
  'room:skipWaiting': (ack: AckFn) => void;
  'room:rematch': (ack: AckFn) => void;
  /** Quick emoji reaction shown over the player's seat. */
  'room:react': (payload: { emoji: string }, ack: AckFn) => void;
  /** Where the player is looking (first-person view), relayed to the others. No ack: it's sent often. */
  'look:update': (payload: { yaw: number; pitch: number }) => void;
  /** Voice chat: join (the ack lists who is already in) and leave. */
  'voice:join': (ack: AckFn<{ peers: string[] }>) => void;
  'voice:leave': (ack: AckFn) => void;
  /** WebRTC signaling (offer/answer/ICE candidate) for one other player in voice. */
  'voice:signal': (payload: { to: string; data: VoiceSignal }) => void;
  'game:bet': (payload: { bet: number }, ack: AckFn) => void;
  /** In the blind round the player can't see their card, so `cardId` is omitted. */
  'game:play': (payload: { cardId?: string }, ack: AckFn) => void;
  /**
   * Named, amount-free game actions for games that need them (poker:
   * `fold`/`check`/`call`/`allIn`), plus `rebuy` between hands. Engines without
   * commands reject it.
   */
  'game:action': (payload: { type: string; amount?: number }, ack: AckFn) => void;
}

export type RoomClosedReason = 'everyoneLeft' | 'idle';

export interface ServerToClientEvents {
  'profile:state': (profile: ProfileView) => void;
  'room:state': (view: RoomView) => void;
  'room:kicked': () => void;
  'room:closed': (reason: RoomClosedReason) => void;
  'room:reaction': (reaction: Reaction) => void;
  'room:look': (look: { playerId: string; yaw: number; pitch: number }) => void;
  'voice:joined': (payload: { playerId: string }) => void;
  'voice:left': (payload: { playerId: string }) => void;
  'voice:signal': (payload: { from: string; data: VoiceSignal }) => void;
}

/** Opaque WebRTC signaling payload: an SDP description or an ICE candidate. */
export type VoiceSignal =
  | { type: 'description'; description: { type: 'offer' | 'answer'; sdp: string } }
  | {
      type: 'candidate';
      candidate: {
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      };
    };

/** Minimum time between two look updates from the same player. */
export const LOOK_INTERVAL_MS = 100;

export interface Reaction {
  /** Unique per reaction, for keys/animations. */
  id: string;
  playerId: string;
  emoji: string;
}

/** The emoji palette (🦐 is the group's mascot). */
export const REACTIONS = ['😂', '😱', '😡', '😭', '😎', '🙏', '👏', '🔥', '🤡', '💩', '😏', '🦐'] as const;
/** Minimum time between two reactions from the same player. */
export const REACTION_COOLDOWN_MS = 1200;

export const ROOM_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 16;

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export const ERROR_MESSAGES_PT: Record<ErrorCode, string> = {
  WRONG_PHASE: 'Não é hora dessa jogada.',
  NOT_YOUR_TURN: 'Calma, não é a sua vez.',
  ILLEGAL_BET: 'Esse palpite não é permitido.',
  ILLEGAL_RAISE: 'Esse aumento não é permitido.',
  CARD_NOT_IN_HAND: 'Essa carta não está na sua mão.',
  UNKNOWN_PLAYER: 'Você não está jogando esta rodada.',
  INVALID_PLAYER_COUNT: 'A partida precisa de 2 a 6 jogadores.',
  INVALID_ACTION: 'Jogada inválida.',
  NOT_ENOUGH_CHIPS: 'Fichas insuficientes para essa jogada.',
  ROOM_NOT_FOUND: 'Essa sala não existe mais. O servidor pode ter reiniciado — crie uma nova sala.',
  SESSION_NOT_FOUND: 'Não encontramos seu lugar nessa sala.',
  ROOM_FULL: 'A sala está cheia.',
  GAME_IN_PROGRESS: 'A partida já começou nessa sala.',
  NOT_HOST: 'Só o anfitrião pode fazer isso.',
  NOT_ENOUGH_PLAYERS: 'São necessários pelo menos 2 jogadores.',
  INVALID_NAME: `Escolha um apelido de 1 a ${MAX_NAME_LENGTH} caracteres.`,
  NAME_TAKEN: 'Já tem alguém com esse apelido na sala.',
  INVALID_SETTINGS: 'Configuração inválida.',
  NOT_IN_ROOM: 'Você não está em nenhuma sala.',
  INVALID_PAYLOAD: 'Pedido inválido.',
  TOO_FAST: 'Calma! Espere um pouquinho.',
  CHAT_TOO_FAST: 'Calma, mais devagar no chat.',
  INVALID_GAME: 'Esse jogo não existe.',
  INSUFFICIENT_BALANCE: 'Saldo insuficiente para essa entrada.',
  INVALID_ENTRY: 'Essa entrada não é válida.',
  PRACTICE_LOCKED: 'Não dá para virar treino (ou adicionar bot) depois que alguém já pagou a entrada.',
  ALREADY_IN_ROOM: 'Você já está em uma sala. Saia dela antes de entrar em outra.',
  WALLET_NOT_FOUND: 'Não encontramos sua carteira. Recarregue a página.',
  REFILL_NOT_ELIGIBLE: 'Você só pode recarregar quando o saldo estiver baixo, uma vez por hora.',
};
