import { type Card, type Rank, SUITS, cardStrength } from './cards.js';

export interface Play {
  playerId: string;
  card: Card;
}

export interface TrickResult {
  /** Only null for an empty trick: equal cards are broken by suit. */
  winnerId: string | null;
  /** Always empty now; kept so the protocol and the client don't change. */
  canceledPlayerIds: string[];
}

/**
 * Resolves a trick: the strongest card wins. Cards of the same rank (not
 * manilhas) are broken by suit, weakest to strongest Ouros < Espadas < Copas <
 * Paus, so a trick always has a winner and nothing is ever canceled.
 */
export function resolveTrick(plays: readonly Play[], manilhaRank: Rank): TrickResult {
  let best: Play | null = null;
  for (const play of plays) {
    if (!best || beats(play.card, best.card, manilhaRank)) best = play;
  }
  return { winnerId: best?.playerId ?? null, canceledPlayerIds: [] };
}

function beats(a: Card, b: Card, manilhaRank: Rank): boolean {
  const diff = cardStrength(a, manilhaRank) - cardStrength(b, manilhaRank);
  return diff !== 0 ? diff > 0 : SUITS.indexOf(a.suit) > SUITS.indexOf(b.suit);
}
