import { type Card, type Rank, SUITS, cardId, cardStrength, isManilha } from './cards.js';
import { resolveTrick } from './trick.js';
import type { PlayerView } from './view.js';

/** Rough chance that a card wins a trick, by how strong it is. */
function winChance(card: Card, manilhaRank: Rank, opponents: number): number {
  const base = isManilha(card, manilhaRank)
    ? 0.75 + 0.08 * SUITS.indexOf(card.suit) // 0.75 (Ouros) .. 0.99 (Paus)
    : ({ '3': 0.55, '2': 0.4, A: 0.25, K: 0.12 } as Partial<Record<Rank, number>>)[card.rank] ?? 0;
  // More opponents make every card less likely to hold up.
  return Math.min(1, base * Math.pow(0.85, Math.max(0, opponents - 1)));
}

function closestLegal(target: number, legal: readonly number[]): number {
  return [...legal].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0]!;
}

/** Simple heuristic bet based on manilhas and high cards. */
export function chooseBotBet(view: PlayerView): number {
  const opponents = view.players.filter((p) => !p.eliminated && p.id !== view.viewerId).length;

  let estimate: number;
  if (view.blindRound) {
    // Can't see our own card: bet 1 only if everyone else's card looks beatable.
    const others = view.players.map((p) => p.foreheadCard).filter((c): c is Card => c !== null);
    const best = Math.max(...others.map((c) => cardStrength(c, view.manilhaRank)));
    estimate = best < cardStrength({ rank: 'K', suit: 'D' }, view.manilhaRank) ? 1 : 0;
  } else {
    estimate = Math.round(view.hand.reduce((sum, c) => sum + winChance(c, view.manilhaRank, opponents), 0));
  }
  return closestLegal(estimate, view.legalBets);
}

/** Returns the card to play, or null in the blind round (the server plays the forehead card). */
export function chooseBotCard(view: PlayerView): string | null {
  if (view.blindRound || view.hand.length === 0) return null;

  const me = view.players.find((p) => p.id === view.viewerId)!;
  const needMore = (me.bet ?? 0) > me.tricksWon;
  const byStrength = [...view.hand].sort(
    (a, b) => cardStrength(a, view.manilhaRank) - cardStrength(b, view.manilhaRank),
  );
  const wouldWin = (card: Card) =>
    resolveTrick([...view.trick.plays, { playerId: me.id, card }], view.manilhaRank).winnerId === me.id;

  const winners = byStrength.filter(wouldWin);
  const losers = byStrength.filter((c) => !wouldWin(c));

  let choice: Card;
  if (needMore) {
    if (view.trick.plays.length === 0) choice = byStrength.at(-1)!; // lead strong
    else choice = winners[0] ?? byStrength[0]!; // cheapest winner, or dump the weakest
  } else {
    choice = losers.at(-1) ?? byStrength[0]!; // shed the strongest safe card
  }
  return cardId(choice);
}
