/** Rank order, weakest to strongest. */
export const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const;
/** Suit order (only used to rank manilhas), weakest to strongest: Ouros, Espadas, Copas, Paus. */
export const SUITS = ['D', 'S', 'H', 'C'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const DECK_SIZE = RANKS.length * SUITS.length; // 40

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function parseCardId(id: string): Card | null {
  const rank = id.slice(0, -1) as Rank;
  const suit = id.slice(-1) as Suit;
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) return null;
  return { rank, suit };
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

/** The manilha is the rank right above the vira, wrapping around (vira 3 -> manilha 4). */
export function manilhaRankFor(vira: Card): Rank {
  const index = RANKS.indexOf(vira.rank);
  return RANKS[(index + 1) % RANKS.length]!;
}

const MANILHA_BASE = 100;

/**
 * Numeric strength of a card for a given round. Non-manilhas rank by rank only
 * (so same-rank cards tie); manilhas are above everything and ranked by suit.
 */
export function cardStrength(card: Card, manilhaRank: Rank): number {
  if (card.rank === manilhaRank) return MANILHA_BASE + SUITS.indexOf(card.suit);
  return RANKS.indexOf(card.rank);
}

export function isManilha(card: Card, manilhaRank: Rank): boolean {
  return card.rank === manilhaRank;
}

/** Negative if a is weaker, positive if stronger, 0 if they tie (cancel). */
export function compareCards(a: Card, b: Card, manilhaRank: Rank): number {
  return cardStrength(a, manilhaRank) - cardStrength(b, manilhaRank);
}
