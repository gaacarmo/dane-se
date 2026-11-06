import { nextRandom, randomInt, shuffle } from '../../rng.js';
import { type Card, type Rank, RANKS, cardId, createDeck } from '../danese/cards.js';
import {
  DUVIDO_CANDIES,
  DUVIDO_HAND_SIZE,
  DUVIDO_MAX_PLAY,
  DUVIDO_MAX_PLAYERS,
  DUVIDO_MIN_PLAYERS,
  type DuvidoSettings,
  cardCounts,
  duvidoManilha,
} from './rules.js';

export interface DuvidoPlayer {
  id: string;
  name: string;
  /** Balas que ainda sobram no pote dele (uma delas é a apimentada). */
  candies: number;
  /** Pegou a apimentada: está fora. */
  out: boolean;
  /** Rodada em que saiu (pra classificação). */
  outInRound: number | null;
}

/** Uma jogada: cartas viradas pra baixo que alguém diz serem do valor da rodada. */
export interface DuvidoPlay {
  playerId: string;
  cards: Card[];
}

/** O que aconteceu quando alguém duvidou. */
export interface DuvidoReveal {
  doubterId: string;
  /** Quem tinha jogado as cartas desviradas. */
  playerId: string;
  cards: Card[];
  /** As cartas eram mesmo do valor (ou curingas). */
  truthful: boolean;
  /** Quem leva o castigo: o mentiroso, ou quem duvidou de quem falava a verdade. */
  punishedId: string;
  /** O castigo: a bala que saiu do pote. */
  spicy: boolean;
  /** Balas que sobraram no pote do castigado (se não saiu). */
  candiesLeft: number;
}

/**
 * - `playing`: alguém precisa jogar cartas ou duvidar.
 * - `reveal`: as cartas foram desviradas e o castigo saiu; pausa pra todo mundo ver.
 * - `gameOver`: sobrou um.
 */
export type DuvidoPhase = 'playing' | 'reveal' | 'gameOver';

export interface DuvidoGameState {
  settings: DuvidoSettings;
  players: DuvidoPlayer[];
  rng: number;
  round: number;
  vira: Card;
  /** O valor que todo mundo diz estar jogando nesta rodada. */
  value: Rank;
  /** Curinga da rodada. */
  manilha: Rank;
  hands: Record<string, Card[]>;
  /** Cartas jogadas na rodada, viradas pra baixo. */
  pile: DuvidoPlay[];
  turnPlayerId: string;
  phase: DuvidoPhase;
  reveal: DuvidoReveal | null;
  /** Quem pegou cada apimentada, em ordem (pra classificação). */
  outOrder: string[];
  winnerId: string | null;
}

export type DuvidoAction =
  | { type: 'play'; playerId: string; cardIds: string[] }
  | { type: 'doubt'; playerId: string }
  | { type: 'nextRound' };

export type DuvidoError =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_PLAYER_COUNT'
  | 'INVALID_ACTION';

export type DuvidoResult = { ok: true; state: DuvidoGameState } | { ok: false; error: DuvidoError };

const ok = (state: DuvidoGameState): DuvidoResult => ({ ok: true, state });
const fail = (error: DuvidoError): DuvidoResult => ({ ok: false, error });

function seatOf(state: DuvidoGameState, id: string): number {
  return state.players.findIndex((p) => p.id === id);
}

/** O próximo jogador ainda no jogo depois de `id`. */
function nextAlive(state: DuvidoGameState, id: string): string {
  const n = state.players.length;
  let seat = seatOf(state, id);
  for (let i = 0; i < n; i++) {
    seat = (seat + 1) % n;
    if (!state.players[seat]!.out) return state.players[seat]!.id;
  }
  return id;
}

/** A última jogada da rodada (a que pode ser duvidada), se não for de quem está na vez. */
export function lastPlay(state: DuvidoGameState): DuvidoPlay | null {
  return state.pile.at(-1) ?? null;
}

/** Dá as cartas da rodada; `starterId` começa jogando. */
function deal(state: DuvidoGameState, starterId: string): DuvidoGameState {
  const shuffled = shuffle(createDeck(), state.rng);
  const deck = shuffled.items;
  const alive = state.players.filter((p) => !p.out);
  const hands: Record<string, Card[]> = {};
  alive.forEach((p, i) => {
    hands[p.id] = deck.slice(i * DUVIDO_HAND_SIZE, (i + 1) * DUVIDO_HAND_SIZE);
  });
  const vira = deck[alive.length * DUVIDO_HAND_SIZE]!;
  const manilha = duvidoManilha(vira);
  // O valor da rodada é sorteado entre os que não são a manilha.
  const choices = RANKS.filter((r) => r !== manilha);
  const pick = randomInt(shuffled.state, choices.length);
  return {
    ...state,
    rng: pick.state,
    round: state.round + 1,
    vira,
    manilha,
    value: choices[pick.value]!,
    hands,
    pile: [],
    turnPlayerId: starterId,
    phase: 'playing',
    reveal: null,
  };
}

export function createDuvidoGame(
  players: readonly { id: string; name: string }[],
  seed: number,
  settings: DuvidoSettings,
): DuvidoResult {
  if (players.length < DUVIDO_MIN_PLAYERS || players.length > DUVIDO_MAX_PLAYERS) return fail('INVALID_PLAYER_COUNT');
  const base: DuvidoGameState = {
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name, candies: DUVIDO_CANDIES, out: false, outInRound: null })),
    rng: seed | 0,
    round: 0,
    vira: { rank: '4', suit: 'D' },
    value: '5',
    manilha: '5',
    hands: {},
    pile: [],
    turnPlayerId: players[0]!.id,
    phase: 'playing',
    reveal: null,
    outOrder: [],
    winnerId: null,
  };
  return ok(deal(base, players[0]!.id));
}

function play(state: DuvidoGameState, playerId: string, cardIds: readonly string[]): DuvidoResult {
  if (state.phase !== 'playing') return fail('WRONG_PHASE');
  if (state.turnPlayerId !== playerId) return fail('NOT_YOUR_TURN');
  if (cardIds.length < 1 || cardIds.length > DUVIDO_MAX_PLAY || new Set(cardIds).size !== cardIds.length) {
    return fail('INVALID_ACTION');
  }
  const hand = state.hands[playerId] ?? [];
  const cards = cardIds.map((id) => hand.find((c) => cardId(c) === id));
  if (cards.some((c) => !c)) return fail('CARD_NOT_IN_HAND');
  const rest = hand.filter((c) => !cards.includes(c));
  return ok({
    ...state,
    hands: { ...state.hands, [playerId]: rest },
    pile: [...state.pile, { playerId, cards: cards as Card[] }],
    turnPlayerId: nextAlive(state, playerId),
  });
}

/** Tira uma bala do pote: a chance da apimentada é 1 em quantas sobraram. */
function drawCandy(state: DuvidoGameState, playerId: string): { state: DuvidoGameState; spicy: boolean; left: number } {
  const player = state.players.find((p) => p.id === playerId)!;
  const roll = nextRandom(state.rng);
  const spicy = roll.value * player.candies < 1;
  const left = spicy ? player.candies : player.candies - 1;
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, candies: left, out: spicy, outInRound: spicy ? state.round : p.outInRound } : p,
  );
  return {
    state: { ...state, rng: roll.state, players, outOrder: spicy ? [...state.outOrder, playerId] : state.outOrder },
    spicy,
    left,
  };
}

function doubt(state: DuvidoGameState, playerId: string): DuvidoResult {
  if (state.phase !== 'playing') return fail('WRONG_PHASE');
  if (state.turnPlayerId !== playerId) return fail('NOT_YOUR_TURN');
  const last = lastPlay(state);
  if (!last || last.playerId === playerId) return fail('INVALID_ACTION');

  const truthful = last.cards.every((c) => cardCounts(c, state.value, state.manilha));
  const punishedId = truthful ? playerId : last.playerId;
  const drawn = drawCandy(state, punishedId);
  const alive = drawn.state.players.filter((p) => !p.out);
  return ok({
    ...drawn.state,
    phase: alive.length <= 1 ? 'gameOver' : 'reveal',
    winnerId: alive.length <= 1 ? (alive[0]?.id ?? null) : null,
    reveal: {
      doubterId: playerId,
      playerId: last.playerId,
      cards: last.cards,
      truthful,
      punishedId,
      spicy: drawn.spicy,
      candiesLeft: drawn.left,
    },
  });
}

function nextRound(state: DuvidoGameState): DuvidoResult {
  if (state.phase !== 'reveal' || !state.reveal) return fail('WRONG_PHASE');
  // Começa quem levou o castigo; se saiu, o próximo depois dele.
  const punished = state.players.find((p) => p.id === state.reveal!.punishedId)!;
  const starter = punished.out ? nextAlive(state, punished.id) : punished.id;
  return ok(deal(state, starter));
}

export function applyDuvidoAction(state: DuvidoGameState, action: DuvidoAction): DuvidoResult {
  if (state.phase === 'gameOver') return fail('WRONG_PHASE');
  if ('playerId' in action) {
    const p = state.players.find((x) => x.id === action.playerId);
    if (!p || p.out) return fail('UNKNOWN_PLAYER');
  }
  switch (action.type) {
    case 'play':
      return play(state, action.playerId, action.cardIds);
    case 'doubt':
      return doubt(state, action.playerId);
    case 'nextRound':
      return nextRound(state);
    default:
      return fail('INVALID_ACTION');
  }
}

/**
 * Quem está na vez pode jogar? Só com cartas na mão. Sem cartas, a única saída
 * é duvidar da última jogada (sempre existe uma, porque a rodada começa com
 * todo mundo com cartas).
 */
export function canPlayCards(state: DuvidoGameState, playerId: string): boolean {
  return state.phase === 'playing' && state.turnPlayerId === playerId && (state.hands[playerId]?.length ?? 0) > 0;
}

export function canDoubt(state: DuvidoGameState, playerId: string): boolean {
  const last = lastPlay(state);
  return state.phase === 'playing' && state.turnPlayerId === playerId && !!last && last.playerId !== playerId;
}

export function duvidoActorId(state: DuvidoGameState): string | null {
  return state.phase === 'playing' ? state.turnPlayerId : null;
}
