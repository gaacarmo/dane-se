import type { GameError } from './game.js';
import type { GameSettings } from './rules.js';
import type { PlayerView } from './view.js';

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
}

export interface RoomView {
  code: string;
  youId: string;
  hostId: string;
  status: RoomStatus;
  settings: GameSettings;
  /** In seat order (= play order). */
  members: RoomMember[];
  game: PlayerView | null;
  /** The current player is disconnected; a bot takes over at `deadline` (epoch ms). */
  waitingFor: { playerId: string; deadline: number } | null;
}

export type ErrorCode =
  | GameError
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
  | 'INVALID_PAYLOAD';

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };
export type AckFn<T = object> = (result: Ack<T>) => void;

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

export interface ClientToServerEvents {
  'room:create': (payload: { name: string }, ack: AckFn<Session>) => void;
  'room:join': (payload: { code: string; name: string }, ack: AckFn<Session>) => void;
  'room:resume': (payload: { code: string; token: string }, ack: AckFn<Session>) => void;
  'room:leave': (ack: AckFn) => void;
  'room:settings': (payload: Partial<GameSettings>, ack: AckFn) => void;
  'room:start': (ack: AckFn) => void;
  'room:kick': (payload: { playerId: string }, ack: AckFn) => void;
  /** Host: add a bot player to fill an empty seat (lobby only). */
  'room:addBot': (ack: AckFn) => void;
  /** Host: stop waiting for a disconnected player and let the bot play for them now. */
  'room:skipWaiting': (ack: AckFn) => void;
  'room:rematch': (ack: AckFn) => void;
  'game:bet': (payload: { bet: number }, ack: AckFn) => void;
  /** In the blind round the player can't see their card, so `cardId` is omitted. */
  'game:play': (payload: { cardId?: string }, ack: AckFn) => void;
}

export type RoomClosedReason = 'everyoneLeft' | 'idle';

export interface ServerToClientEvents {
  'room:state': (view: RoomView) => void;
  'room:kicked': () => void;
  'room:closed': (reason: RoomClosedReason) => void;
}

export const ROOM_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 16;

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export const ERROR_MESSAGES_PT: Record<ErrorCode, string> = {
  WRONG_PHASE: 'Não é hora dessa jogada.',
  NOT_YOUR_TURN: 'Calma, não é a sua vez.',
  ILLEGAL_BET: 'Esse palpite não é permitido.',
  CARD_NOT_IN_HAND: 'Essa carta não está na sua mão.',
  UNKNOWN_PLAYER: 'Você não está jogando esta rodada.',
  INVALID_PLAYER_COUNT: 'A partida precisa de 2 a 6 jogadores.',
  ROOM_NOT_FOUND: 'Essa sala não existe mais. O servidor pode ter reiniciado — crie uma nova sala.',
  SESSION_NOT_FOUND: 'Não encontramos seu lugar nessa sala.',
  ROOM_FULL: 'A sala está cheia (máximo 6 jogadores).',
  GAME_IN_PROGRESS: 'A partida já começou nessa sala.',
  NOT_HOST: 'Só o anfitrião pode fazer isso.',
  NOT_ENOUGH_PLAYERS: 'São necessários pelo menos 2 jogadores.',
  INVALID_NAME: `Escolha um apelido de 1 a ${MAX_NAME_LENGTH} caracteres.`,
  NAME_TAKEN: 'Já tem alguém com esse apelido na sala.',
  INVALID_SETTINGS: 'Configuração inválida.',
  NOT_IN_ROOM: 'Você não está em nenhuma sala.',
  INVALID_PAYLOAD: 'Pedido inválido.',
};
