import { type Card, type Rank, cardId, createDeck, manilhaRankFor } from './cards.js';
import { randomInt, shuffle } from './rng.js';
import {
  type CardDirection,
  type GameSettings,
  type RoundScore,
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  isLegalBet,
  livesFor,
  maxCardsPerPlayer,
  nextAliveAfter,
  nextCardCount,
  scoreRound,
} from './rules.js';
import { type Play, type TrickResult, resolveTrick } from './trick.js';

export type Phase = 'betting' | 'playing' | 'trickEnd' | 'roundSummary' | 'gameOver';

export interface PlayerState {
  id: string;
  name: string;
  letters: number;
  eliminated: boolean;
}

export interface Trick {
  leaderId: string;
  plays: Play[];
  /** Set once every player has played (phase "trickEnd"). */
  result: TrickResult | null;
}

export interface RoundSummary extends RoundScore {
  roundNumber: number;
  cardsPerPlayer: number;
  dealerId: string;
  vira: Card;
}

export interface GameState {
  settings: GameSettings;
  lives: number;
  /** Seat order = play order (counter-clockwise): players[i + 1] sits to the right of players[i]. */
  players: PlayerState[];
  phase: Phase;
  rng: number;
  roundNumber: number;
  dealerId: string;
  cardsPerPlayer: number;
  cardDirection: CardDirection;
  vira: Card;
  manilhaRank: Rank;
  hands: Record<string, Card[]>;
  /** Alive players for this round, starting right of the Pé and ending with the Pé. */
  roundOrder: string[];
  bets: Record<string, number>;
  tricksWon: Record<string, number>;
  trick: Trick;
  completedTricks: Trick[];
  turnPlayerId: string | null;
  lastRound: RoundSummary | null;
  winnerId: string | null;
}

export type GameAction =
  | { type: 'bet'; playerId: string; bet: number }
  | { type: 'play'; playerId: string; cardId: string }
  /** Clears a finished trick from the table (server sends it after a short pause). */
  | { type: 'collectTrick' }
  /** Starts the next round after the round summary. */
  | { type: 'nextRound' };

export type GameError =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_BET'
  | 'CARD_NOT_IN_HAND'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_PLAYER_COUNT';

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: GameError };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(
  players: readonly { id: string; name: string }[],
  seed: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): ActionResult {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) return { ok: false, error: 'INVALID_PLAYER_COUNT' };

  const firstDealer = randomInt(seed, players.length);
  const base: GameState = {
    settings,
    lives: livesFor(settings),
    players: players.map((p) => ({ id: p.id, name: p.name, letters: 0, eliminated: false })),
    phase: 'betting',
    rng: firstDealer.state,
    roundNumber: 1,
    dealerId: players[firstDealer.value]!.id,
    cardsPerPlayer: 1,
    cardDirection: 'up',
    vira: { rank: '4', suit: 'D' },
    manilhaRank: '5',
    hands: {},
    roundOrder: [],
    bets: {},
    tricksWon: {},
    trick: { leaderId: '', plays: [], result: null },
    completedTricks: [],
    turnPlayerId: null,
    lastRound: null,
    winnerId: null,
  };
  return { ok: true, state: dealRound(base) };
}

export function alivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.eliminated);
}

function seatOrder(state: GameState): string[] {
  return state.players.map((p) => p.id);
}

function isAliveIn(state: GameState) {
  return (id: string) => state.players.some((p) => p.id === id && !p.eliminated);
}

/** Shuffles, deals `cardsPerPlayer` to every alive player and flips the vira. */
function dealRound(state: GameState): GameState {
  const order: string[] = [];
  let id = state.dealerId;
  do {
    id = nextAliveAfter(seatOrder(state), isAliveIn(state), id);
    order.push(id);
  } while (id !== state.dealerId);

  const shuffled = shuffle(createDeck(), state.rng);
  const deck = shuffled.items;
  const hands: Record<string, Card[]> = Object.fromEntries(order.map((p) => [p, []]));
  for (let i = 0; i < state.cardsPerPlayer; i++) {
    for (const p of order) hands[p]!.push(deck.pop()!);
  }
  const vira = deck.pop()!;

  return {
    ...state,
    phase: 'betting',
    rng: shuffled.state,
    vira,
    manilhaRank: manilhaRankFor(vira),
    hands,
    roundOrder: order,
    bets: {},
    tricksWon: Object.fromEntries(order.map((p) => [p, 0])),
    trick: { leaderId: order[0]!, plays: [], result: null },
    completedTricks: [],
    turnPlayerId: order[0]!,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isBlindRound(state: GameState): boolean {
  return state.cardsPerPlayer === 1;
}

export function otherBetsSum(state: GameState, playerId: string): number {
  return Object.entries(state.bets).reduce((sum, [id, bet]) => (id === playerId ? sum : sum + bet), 0);
}

export function legalBets(state: GameState, playerId: string): number[] {
  if (state.phase !== 'betting' || state.turnPlayerId !== playerId) return [];
  const others = otherBetsSum(state, playerId);
  const isDealer = playerId === state.dealerId;
  const bets: number[] = [];
  for (let b = 0; b <= state.cardsPerPlayer; b++) {
    if (isLegalBet(b, state.cardsPerPlayer, isDealer, others)) bets.push(b);
  }
  return bets;
}

/** Order for a trick: the leader, then everyone to their right, around the table. */
function trickOrder(state: GameState, leaderId: string): string[] {
  const start = state.roundOrder.indexOf(leaderId);
  return [...state.roundOrder.slice(start), ...state.roundOrder.slice(0, start)];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: GameAction): ActionResult {
  switch (action.type) {
    case 'bet':
      return placeBet(state, action.playerId, action.bet);
    case 'play':
      return playCard(state, action.playerId, action.cardId);
    case 'collectTrick':
      return collectTrick(state);
    case 'nextRound':
      return startNextRound(state);
  }
}

function placeBet(state: GameState, playerId: string, bet: number): ActionResult {
  if (state.phase !== 'betting') return { ok: false, error: 'WRONG_PHASE' };
  if (!state.roundOrder.includes(playerId)) return { ok: false, error: 'UNKNOWN_PLAYER' };
  if (state.turnPlayerId !== playerId) return { ok: false, error: 'NOT_YOUR_TURN' };
  if (!isLegalBet(bet, state.cardsPerPlayer, playerId === state.dealerId, otherBetsSum(state, playerId))) {
    return { ok: false, error: 'ILLEGAL_BET' };
  }

  const bets = { ...state.bets, [playerId]: bet };
  const betCount = Object.keys(bets).length;
  if (betCount < state.roundOrder.length) {
    return { ok: true, state: { ...state, bets, turnPlayerId: state.roundOrder[betCount]! } };
  }
  return { ok: true, state: { ...state, bets, phase: 'playing', turnPlayerId: state.trick.leaderId } };
}

function playCard(state: GameState, playerId: string, id: string): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'WRONG_PHASE' };
  if (!state.roundOrder.includes(playerId)) return { ok: false, error: 'UNKNOWN_PLAYER' };
  if (state.turnPlayerId !== playerId) return { ok: false, error: 'NOT_YOUR_TURN' };

  const hand = state.hands[playerId] ?? [];
  const card = hand.find((c) => cardId(c) === id);
  if (!card) return { ok: false, error: 'CARD_NOT_IN_HAND' };

  const hands = { ...state.hands, [playerId]: hand.filter((c) => c !== card) };
  const plays = [...state.trick.plays, { playerId, card }];
  const order = trickOrder(state, state.trick.leaderId);

  if (plays.length < order.length) {
    return {
      ok: true,
      state: { ...state, hands, trick: { ...state.trick, plays }, turnPlayerId: order[plays.length]! },
    };
  }

  const result = resolveTrick(plays, state.manilhaRank);
  const tricksWon = result.winnerId
    ? { ...state.tricksWon, [result.winnerId]: (state.tricksWon[result.winnerId] ?? 0) + 1 }
    : state.tricksWon;
  return {
    ok: true,
    state: { ...state, hands, tricksWon, phase: 'trickEnd', trick: { ...state.trick, plays, result }, turnPlayerId: null },
  };
}

function collectTrick(state: GameState): ActionResult {
  if (state.phase !== 'trickEnd' || !state.trick.result) return { ok: false, error: 'WRONG_PHASE' };

  const completedTricks = [...state.completedTricks, state.trick];
  // A fully tied trick is led again by the same player.
  const leaderId = state.trick.result.winnerId ?? state.trick.leaderId;

  if (completedTricks.length < state.cardsPerPlayer) {
    return {
      ok: true,
      state: {
        ...state,
        phase: 'playing',
        completedTricks,
        trick: { leaderId, plays: [], result: null },
        turnPlayerId: leaderId,
      },
    };
  }
  return { ok: true, state: finishRound({ ...state, completedTricks }) };
}

function finishRound(state: GameState): GameState {
  const alive = alivePlayers(state);
  const score = scoreRound({
    players: alive,
    bets: state.bets,
    tricksWon: state.tricksWon,
    dealerId: state.dealerId,
    allTricksTied: state.completedTricks.every((t) => t.result?.winnerId === null),
    lives: state.lives,
  });

  const resultById = new Map(score.results.map((r) => [r.playerId, r]));
  const players = state.players.map((p) => {
    const r = resultById.get(p.id);
    return r ? { ...p, letters: r.lettersAfter, eliminated: r.eliminated } : p;
  });

  const lastRound: RoundSummary = {
    ...score,
    roundNumber: state.roundNumber,
    cardsPerPlayer: state.cardsPerPlayer,
    dealerId: state.dealerId,
    vira: state.vira,
  };

  const stillAlive = players.filter((p) => !p.eliminated);
  const gameOver = stillAlive.length <= 1;
  return {
    ...state,
    players,
    lastRound,
    phase: gameOver ? 'gameOver' : 'roundSummary',
    trick: { leaderId: '', plays: [], result: null },
    turnPlayerId: null,
    winnerId: stillAlive.length === 1 ? stillAlive[0]!.id : null,
  };
}

function startNextRound(state: GameState): ActionResult {
  if (state.phase !== 'roundSummary') return { ok: false, error: 'WRONG_PHASE' };

  const aliveCount = alivePlayers(state).length;
  const max = maxCardsPerPlayer(aliveCount, state.settings.maxCards);
  const next = state.lastRound?.voided
    ? { cards: Math.min(state.cardsPerPlayer, max), direction: state.cardDirection }
    : nextCardCount(state.cardsPerPlayer, state.cardDirection, max, state.settings.cardCountMode);

  const dealerId = nextAliveAfter(seatOrder(state), isAliveIn(state), state.dealerId);
  return {
    ok: true,
    state: dealRound({
      ...state,
      roundNumber: state.roundNumber + 1,
      dealerId,
      cardsPerPlayer: next.cards,
      cardDirection: next.direction,
    }),
  };
}
