import { DECK_SIZE } from './cards.js';

// ---------------------------------------------------------------------------
// Tunable rule constants
// ---------------------------------------------------------------------------

/** If every trick of a round is tied (nobody won any), the Pé receives a letter. */
export const DEALER_PENALTY_WHEN_ALL_TRICKS_TIED = true;

/**
 * If every remaining player would be eliminated in the same round, nobody is
 * eliminated: the round's letters are voided and a new round with the same
 * card count is played.
 */
export const REPLAY_ROUND_ON_SIMULTANEOUS_ELIMINATION = true;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Cheapest buy-in a money room may charge, in integer money. */
export const DANESE_MIN_ENTRY = 100;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type CardCountMode = 'upDown' | 'restart';

export interface GameSettings {
  /** The "lives" word. Only letters count, so "DANE-SE" = 6 lives. */
  word: string;
  maxCards: number;
  cardCountMode: CardCountMode;
  /** Buy-in per player, in integer money. Ignored in "treino" (practice) rooms. */
  entry: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  word: 'DANE-SE',
  maxCards: 6,
  cardCountMode: 'upDown',
  entry: DANESE_MIN_ENTRY,
};

// ---------------------------------------------------------------------------
// Money payouts (finishing position)
// ---------------------------------------------------------------------------

/**
 * Payout weights (as percentages of the pot) by finishing position, for a
 * given number of paying players. The pot is split with integer rounding;
 * remainders go to 1st place. Change these numbers to change the payout table.
 */
export function danesePayoutWeights(playerCount: number): number[] {
  if (playerCount <= 3) return [100];
  return [70, 30];
}

export interface RankedPlayer {
  id: string;
  eliminated: boolean;
  eliminatedInRound: number | null;
}

/**
 * Final standings for a finished game: 1st is the last survivor, 2nd is the
 * last eliminated, and so on. Players eliminated in the same round keep their
 * seat order as a deterministic tie-break (the winner's side of the table
 * ranks ahead), since the rules don't distinguish simultaneous eliminations.
 */
export function rankDanesePlayers(
  players: readonly RankedPlayer[],
  seatOrder: readonly string[],
): string[] {
  const seatIndex = (id: string) => seatOrder.indexOf(id);
  const survivors = players.filter((p) => !p.eliminated).map((p) => p.id);
  const eliminated = players
    .filter((p) => p.eliminated)
    .sort((a, b) => {
      const ra = a.eliminatedInRound ?? 0;
      const rb = b.eliminatedInRound ?? 0;
      if (rb !== ra) return rb - ra;
      return seatIndex(a.id) - seatIndex(b.id);
    })
    .map((p) => p.id);
  return [...survivors, ...eliminated];
}

export function wordLetters(word: string): string[] {
  return [...word.toUpperCase()].filter((ch) => /\p{L}/u.test(ch));
}

export function livesFor(settings: GameSettings): number {
  return wordLetters(settings.word).length;
}

// ---------------------------------------------------------------------------
// Cards per round ("sobe e desce")
// ---------------------------------------------------------------------------

/** One card is reserved for the vira, the rest must fit in every hand. */
export function maxCardsPerPlayer(alivePlayers: number, settingMax: number, deckSize = DECK_SIZE): number {
  return Math.max(1, Math.min(settingMax, Math.floor((deckSize - 1) / alivePlayers)));
}

/** Direction of the *next* step. */
export type CardDirection = 'up' | 'down';

/**
 * Next card count. Up-and-down plays each end once: 1,2,...,max,...,2,1,2,...
 * Restart mode goes 1..max then back to 1.
 */
export function nextCardCount(
  current: number,
  direction: CardDirection,
  max: number,
  mode: CardCountMode,
): { cards: number; direction: CardDirection } {
  if (max <= 1) return { cards: 1, direction: 'up' };
  const c = Math.min(current, max);

  if (mode === 'restart') return { cards: c >= max ? 1 : c + 1, direction: 'up' };

  const goUp = direction === 'up' ? c < max : c <= 1;
  const cards = goUp ? c + 1 : c - 1;
  const nextDirection: CardDirection = cards >= max ? 'down' : cards <= 1 ? 'up' : goUp ? 'up' : 'down';
  return { cards, direction: nextDirection };
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------

/** The bet the Pé may not make (it would make the sum equal N), or null if none is forbidden. */
export function forbiddenDealerBet(cardsPerPlayer: number, otherBetsSum: number): number | null {
  const forbidden = cardsPerPlayer - otherBetsSum;
  return forbidden >= 0 && forbidden <= cardsPerPlayer ? forbidden : null;
}

export function isLegalBet(bet: number, cardsPerPlayer: number, isDealer: boolean, otherBetsSum: number): boolean {
  if (!Number.isInteger(bet) || bet < 0 || bet > cardsPerPlayer) return false;
  return !isDealer || bet !== forbiddenDealerBet(cardsPerPlayer, otherBetsSum);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Whole-round tie rule: if every trick was tied, the Pé gets a letter. Since a
 * player gets at most one letter per round, this only matters when the Pé hit
 * their bet. Returns the new recipient set and whether the penalty added a letter.
 */
export function applyRoundTiePenalty(
  letterRecipients: ReadonlySet<string>,
  dealerId: string,
  allTricksTied: boolean,
): { recipients: Set<string>; penaltyApplied: boolean } {
  const recipients = new Set(letterRecipients);
  if (!DEALER_PENALTY_WHEN_ALL_TRICKS_TIED || !allTricksTied || recipients.has(dealerId)) {
    return { recipients, penaltyApplied: false };
  }
  recipients.add(dealerId);
  return { recipients, penaltyApplied: true };
}

export interface ScoringPlayer {
  id: string;
  letters: number;
}

export interface PlayerRoundResult {
  playerId: string;
  bet: number;
  tricksWon: number;
  hitBet: boolean;
  gainedLetter: boolean;
  lettersAfter: number;
  eliminated: boolean;
}

export interface RoundScore {
  results: PlayerRoundResult[];
  allTricksTied: boolean;
  /** True when the Pé got a letter only because every trick was tied. */
  dealerTiePenalty: boolean;
  /** True when everyone would have been eliminated, so the round's letters were voided. */
  voided: boolean;
  eliminatedIds: string[];
}

export function scoreRound(input: {
  players: readonly ScoringPlayer[]; // alive players
  bets: Readonly<Record<string, number>>;
  tricksWon: Readonly<Record<string, number>>;
  dealerId: string;
  allTricksTied: boolean;
  lives: number;
}): RoundScore {
  const { players, bets, tricksWon, dealerId, allTricksTied, lives } = input;

  const missed = new Set(players.filter((p) => (tricksWon[p.id] ?? 0) !== bets[p.id]).map((p) => p.id));
  const { recipients, penaltyApplied } = applyRoundTiePenalty(missed, dealerId, allTricksTied);

  const wouldBeEliminated = players.filter((p) => recipients.has(p.id) && p.letters + 1 >= lives);
  const voided = REPLAY_ROUND_ON_SIMULTANEOUS_ELIMINATION && wouldBeEliminated.length === players.length;

  const results = players.map((p): PlayerRoundResult => {
    const gainedLetter = !voided && recipients.has(p.id);
    const lettersAfter = p.letters + (gainedLetter ? 1 : 0);
    return {
      playerId: p.id,
      bet: bets[p.id] ?? 0,
      tricksWon: tricksWon[p.id] ?? 0,
      hitBet: !missed.has(p.id),
      gainedLetter,
      lettersAfter,
      eliminated: lettersAfter >= lives,
    };
  });

  return {
    results,
    allTricksTied,
    dealerTiePenalty: penaltyApplied && !voided,
    voided,
    eliminatedIds: results.filter((r) => r.eliminated).map((r) => r.playerId),
  };
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

/**
 * Seats are stored in play order (counter-clockwise): seats[i + 1] sits to the
 * right of seats[i]. Returns the next alive player after `fromId`.
 */
export function nextAliveAfter(seatOrder: readonly string[], isAlive: (id: string) => boolean, fromId: string): string {
  const start = seatOrder.indexOf(fromId);
  for (let step = 1; step <= seatOrder.length; step++) {
    const id = seatOrder[(start + step) % seatOrder.length]!;
    if (isAlive(id)) return id;
  }
  throw new Error('No alive players');
}
