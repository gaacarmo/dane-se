import { type Card, type Rank, SUITS, cardStrength } from './cards.js';

export interface Play {
  playerId: string;
  card: Card;
}

export interface TrickResult {
  /** null when every card was canceled ("embuchou tudo"). */
  winnerId: string | null;
  /** Players whose cards were canceled by a pair (or four) of the same rank. */
  canceledPlayerIds: string[];
}

/**
 * Resolves a trick, from the strongest rank down:
 * - one card of that rank: it wins;
 * - three cards of that rank: the third one played wins, whatever its suit;
 * - two (or four) cards of that rank "embucham": they cancel, and the next rank down is checked.
 * Manilhas never tie (each suit is its own strength).
 */
export function resolveTrick(plays: readonly Play[], manilhaRank: Rank): TrickResult {
  const byStrength = new Map<number, Play[]>();
  for (const play of plays) {
    const strength = cardStrength(play.card, manilhaRank);
    byStrength.set(strength, [...(byStrength.get(strength) ?? []), play]);
  }

  const canceledPlayerIds: string[] = [];
  for (const strength of [...byStrength.keys()].sort((x, y) => y - x)) {
    const group = byStrength.get(strength)!;
    if (group.length === 1) return { winnerId: group[0]!.playerId, canceledPlayerIds };
    if (group.length === SUIT_BREAKS_A_TIE_OF) {
      // O terceiro a jogar vence, seja qual for o naipe.
      return { winnerId: group[group.length - 1]!.playerId, canceledPlayerIds };
    }
    canceledPlayerIds.push(...group.map((p) => p.playerId));
  }
  return { winnerId: null, canceledPlayerIds };
}

/** Three cards of the same rank are decided by play order (the third wins); a pair (or four) cancels. */
const SUIT_BREAKS_A_TIE_OF = 3;
