import { rankValue, type PokerCard } from './cards.js';

/** The nine Texas Hold'em hand categories, weakest to strongest. */
export const CATEGORIES = [
  'high',
  'pair',
  'twoPair',
  'trips',
  'straight',
  'flush',
  'fullHouse',
  'quads',
  'straightFlush',
] as const;

export type HandCategory = (typeof CATEGORIES)[number];

/** A hand's value: category + tie-break ranks (descending). */
export interface HandValue {
  category: HandCategory;
  ranks: number[];
}

/**
 * Evaluates a 5-card hand. Never called with fewer or more than 5 cards.
 * `ranks` is what breaks ties inside a category (e.g. a full house is
 * [tripsRank, pairRank]).
 */
export function evaluateFive(cards: readonly PokerCard[]): HandValue {
  const ranks = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Fewest cards of a kind first, highest rank first within a group.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const distinct = [...counts.keys()].sort((a, b) => b - a);

  const isFlush = new Set(cards.map((c) => c.suit)).size === 1;

  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0]! - distinct[4]! === 4) straightHigh = distinct[0]!;
    // Wheel: A-2-3-4-5 (Ace plays low), highest card is the 5.
    else if (distinct[0] === 14 && distinct[1] === 5 && distinct[4] === 2) straightHigh = 5;
  }
  const isStraight = straightHigh > 0;

  const [g0, g1, g2] = groups;

  if (isFlush && isStraight) return { category: 'straightFlush', ranks: [straightHigh] };
  if (g0![1] === 4) return { category: 'quads', ranks: [g0![0], g1![0]] };
  if (g0![1] === 3 && g1![1] === 2) return { category: 'fullHouse', ranks: [g0![0], g1![0]] };
  if (isFlush) return { category: 'flush', ranks: distinct.slice(0, 5) };
  if (isStraight) return { category: 'straight', ranks: [straightHigh] };
  if (g0![1] === 3) return { category: 'trips', ranks: [g0![0], ...groups.slice(1).map((g) => g[0])] };
  if (g0![1] === 2 && g1![1] === 2)
    return { category: 'twoPair', ranks: [g0![0], g1![0], ...groups.slice(2).map((g) => g[0])] };
  if (g0![1] === 2) return { category: 'pair', ranks: [g0![0], ...groups.slice(1).map((g) => g[0])] };
  return { category: 'high', ranks: distinct.slice(0, 5) };
}

const CATEGORY_ORDER = new Map(CATEGORIES.map((c, i) => [c, i]));

/** -1 if `a` loses, 0 on a tie, 1 if `a` wins. */
export function compareHandValues(a: HandValue, b: HandValue): -1 | 0 | 1 {
  const ca = CATEGORY_ORDER.get(a.category)!;
  const cb = CATEGORY_ORDER.get(b.category)!;
  if (ca !== cb) return ca < cb ? -1 : 1;
  for (let i = 0; i < Math.max(a.ranks.length, b.ranks.length); i++) {
    const ra = a.ranks[i] ?? 0;
    const rb = b.ranks[i] ?? 0;
    if (ra !== rb) return ra < rb ? -1 : 1;
  }
  return 0;
}

/** All 5-card combinations of a 7-card hand (21 of them). */
function fiveCardCombos(cards: readonly PokerCard[]): PokerCard[][] {
  const combos: PokerCard[][] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) combos.push([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
  return combos;
}

export interface BestHand {
  value: HandValue;
  /** The winning 5 cards, in a stable order (for display). */
  cards: PokerCard[];
}

/** The best 5-card hand out of 7 (two hole cards + five community cards). */
export function bestHand(cards: readonly PokerCard[]): BestHand | null {
  if (cards.length < 5) return null;
  if (cards.length === 5) return { value: evaluateFive(cards), cards: [...cards] };
  let best: BestHand | null = null;
  for (const combo of fiveCardCombos(cards)) {
    const value = evaluateFive(combo);
    if (!best || compareHandValues(value, best.value) > 0) best = { value, cards: combo };
  }
  return best;
}