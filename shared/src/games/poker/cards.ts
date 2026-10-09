/**
 * Standard 52-card deck for Texas Hold'em. Separate from the Dane-se deck
 * (which is a 40-card Brazilian deck with different ranks).
 */
export const POKER_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
/** Clubs < Diamonds < Hearts < Spades. This order only matters for display. */
export const POKER_SUITS = ['C', 'D', 'H', 'S'] as const;

export type PokerRank = (typeof POKER_RANKS)[number];
export type PokerSuit = (typeof POKER_SUITS)[number];

export interface PokerCard {
  rank: PokerRank;
  suit: PokerSuit;
}

export const POKER_DECK_SIZE = 52;

/** Numeric strength of a rank for hand evaluation (2=2 … A=14). */
export function rankValue(rank: PokerRank): number {
  return POKER_RANKS.indexOf(rank) + 2;
}

export function pokerCardId(card: PokerCard): string {
  return `${card.rank}${card.suit}`;
}

export function parsePokerCardId(id: string): PokerCard | null {
  const rank = id.slice(0, -1) as PokerRank;
  const suit = id.slice(-1) as PokerSuit;
  if (!POKER_RANKS.includes(rank) || !POKER_SUITS.includes(suit)) return null;
  return { rank, suit };
}

export function samePokerCard(a: PokerCard, b: PokerCard): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function createPokerDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of POKER_SUITS) for (const rank of POKER_RANKS) deck.push({ rank, suit });
  return deck;
}