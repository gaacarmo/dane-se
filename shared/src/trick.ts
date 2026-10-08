import { type Card, type Rank, cardStrength } from './cards.js';

export interface Play {
  playerId: string;
  card: Card;
}

export interface TrickResult {
  /** null when every card was canceled ("empatada"). */
  winnerId: string | null;
  /** Players whose cards were canceled by a tie. */
  canceledPlayerIds: string[];
}

/**
 * Resolves a trick. Cards of equal strength cancel each other: if the top
 * strength is tied, those cards are removed and the next strength is checked,
 * repeatedly. Manilhas never tie (suits break them).
 */
export function resolveTrick(plays: readonly Play[], manilhaRank: Rank): TrickResult {
  const byStrength = new Map<number, string[]>();
  for (const play of plays) {
    const strength = cardStrength(play.card, manilhaRank);
    const group = byStrength.get(strength) ?? [];
    group.push(play.playerId);
    byStrength.set(strength, group);
  }

  const canceledPlayerIds: string[] = [];
  const strengths = [...byStrength.keys()].sort((a, b) => b - a);
  for (const strength of strengths) {
    const group = byStrength.get(strength)!;
    if (group.length === 1) return { winnerId: group[0]!, canceledPlayerIds };
    canceledPlayerIds.push(...group);
  }
  return { winnerId: null, canceledPlayerIds };
}
