import { type Card, type Rank, cardId, createDeck, manilhaRankFor } from './cards.js';
import { randomInt, shuffle } from '../../rng.js';
import {
  type ArcadeAbilityId,
  type ArcadeLoadout,
  type ArcadeMatchState,
  CHARACTER_KITS,
  absorbHit,
  arcadeSeat,
  canRevive,
  createArcadeMatchState,
  eliminationThreshold,
  spendRevive,
} from '../../arcade/index.js';
import { applyArcadeAbility } from './arcade.js';
import {
  type CardDirection,
  type GameSettings,
  type PlayerRoundResult,
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
  /** Round in which the player was eliminated (for final standings). */
  eliminatedInRound: number | null;
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

/** An opponent card shown privately to one player (Radar/Visão/Xereta). */
export interface ArcadeReveal {
  targetId: string;
  card: Card;
}

export interface GameState {
  settings: GameSettings;
  /** Arcade abilities (passives/specials). Disabled = normal match. */
  arcade: ArcadeMatchState;
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
  /** Cartas que sobraram do baralho (o Curinga compra daqui). Nunca vai pro cliente. */
  deck: Card[];
  /** Cartas de oponentes reveladas a cada jogador. Segredo por assento. */
  arcadePrivate: Record<string, ArcadeReveal[]>;
  /** Letras concedidas por acusações (Pega o Gato), aplicadas no fim da rodada. */
  pendingLetters: Record<string, number>;
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
  | { type: 'nextRound' }
  /** Arcade: fire a special or a common talent. */
  | { type: 'arcade'; playerId: string; ability: ArcadeAbilityId; targetId?: string; bet?: number };

export type GameError =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_BET'
  | 'CARD_NOT_IN_HAND'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_PLAYER_COUNT'
  | 'ABILITY_UNAVAILABLE'
  | 'INVALID_TARGET';

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: GameError };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(
  players: readonly { id: string; name: string; arcade?: ArcadeLoadout }[],
  seed: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): ActionResult {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) return { ok: false, error: 'INVALID_PLAYER_COUNT' };

  const firstDealer = randomInt(seed, players.length);
  const base: GameState = {
    settings,
    arcade: createArcadeMatchState(
      players.flatMap((p) => (p.arcade ? [{ id: p.id, loadout: p.arcade }] : [])),
    ),
    lives: livesFor(settings),
    players: players.map((p) => ({ id: p.id, name: p.name, letters: 0, eliminated: false, eliminatedInRound: null })),
    phase: 'betting',
    rng: firstDealer.state,
    roundNumber: 1,
    dealerId: players[firstDealer.value]!.id,
    cardsPerPlayer: 1,
    cardDirection: 'up',
    vira: { rank: '4', suit: 'D' },
    manilhaRank: '5',
    hands: {},
    deck: [],
    arcadePrivate: {},
    pendingLetters: {},
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

  // Xereta (Martelo): a cada rodada espia 1 carta aleatória de um adversário.
  let rng = shuffled.state;
  const arcadePrivate: Record<string, ArcadeReveal[]> = {};
  for (const id of order) {
    const seat = arcadeSeat(state.arcade, id);
    if (!seat || CHARACTER_KITS[seat.character].passive.id !== 'xereta') continue;
    const opponents = order.filter((o) => o !== id);
    if (opponents.length === 0) continue;
    const who = randomInt(rng, opponents.length);
    rng = who.state;
    const target = opponents[who.value]!;
    const targetHand = hands[target] ?? [];
    if (targetHand.length === 0) continue;
    const which = randomInt(rng, targetHand.length);
    rng = which.state;
    arcadePrivate[id] = [{ targetId: target, card: { ...targetHand[which.value]! } }];
  }

  return {
    ...state,
    phase: 'betting',
    rng,
    vira,
    manilhaRank: manilhaRankFor(vira),
    hands,
    deck,
    arcadePrivate,
    pendingLetters: {},
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
    case 'arcade':
      return applyArcadeAbility(state, action);
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

  const outcome = applyArcadeLetters(state.arcade, state.lives, score.results, state.pendingLetters);
  const resultById = new Map(outcome.results.map((r) => [r.playerId, r]));
  const players = state.players.map((p) => {
    const r = resultById.get(p.id);
    if (!r) return p;
    return {
      ...p,
      letters: r.lettersAfter,
      eliminated: r.eliminated,
      eliminatedInRound: r.eliminated ? state.roundNumber : p.eliminatedInRound,
    };
  });

  const lastRound: RoundSummary = {
    ...score,
    results: outcome.results,
    eliminatedIds: outcome.eliminatedIds,
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
    arcade: outcome.arcade,
    pendingLetters: {},
    lastRound,
    phase: gameOver ? 'gameOver' : 'roundSummary',
    trick: { leaderId: '', plays: [], result: null },
    turnPlayerId: null,
    winnerId: stillAlive.length === 1 ? stillAlive[0]!.id : null,
  };
}

/**
 * Aplica o arcade por cima das letras cruas da rodada: o Escudo anula uma letra,
 * o buffer do Esquenta sobe o limiar de eliminação e o Zumbi salva da primeira
 * morte (volta com 1 letra abaixo do letal). Sem arcade ligado é pass-through.
 */
export function applyArcadeLetters(
  arcade: ArcadeMatchState,
  lives: number,
  results: readonly PlayerRoundResult[],
  extra: Readonly<Record<string, number>> = {},
): { arcade: ArcadeMatchState; results: PlayerRoundResult[]; eliminatedIds: string[] } {
  if (!arcade.enabled) {
    return {
      arcade,
      results: [...results],
      eliminatedIds: results.filter((r) => r.eliminated).map((r) => r.playerId),
    };
  }

  let next = arcade;
  const adjusted = results.map((r): PlayerRoundResult => {
    const before = r.lettersAfter - (r.gainedLetter ? 1 : 0);
    let gain = (r.gainedLetter ? 1 : 0) + (extra[r.playerId] ?? 0);
    while (gain > 0) {
      const shielded = absorbHit(next, r.playerId);
      if (!shielded.absorbed) break;
      next = shielded.state;
      gain -= 1;
    }

    const threshold = eliminationThreshold(next, r.playerId, lives);
    let lettersAfter = before + gain;
    let eliminated = false;
    if (gain > 0 && lettersAfter >= threshold) {
      if (canRevive(next, r.playerId)) {
        next = spendRevive(next, r.playerId);
        lettersAfter = threshold - 1;
      } else {
        eliminated = true;
      }
    }
    return { ...r, gainedLetter: gain > 0, lettersAfter, eliminated };
  });

  return {
    arcade: next,
    results: adjusted,
    eliminatedIds: adjusted.filter((r) => r.eliminated).map((r) => r.playerId),
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
