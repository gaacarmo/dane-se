import { type PokerCard, rankValue } from './cards.js';
import { type PokerAction } from './game.js';
import { CATEGORIES, bestHand } from './hand.js';
import { bigBlind } from './rules.js';
import { type PokerView } from './view.js';

/**
 * Deterministic bot strategy for NLHE. Decides only from public information
 * plus its own hole cards (the view its seat is entitled to). It never draws
 * from the RNG, so `botAction` can pass the RNG state through untouched.
 *
 * Strategy is deliberately simple and safe-for-a-friendlier-table:
 *  - very strong hands (full house+ postflop, big pairs preflop) raise,
 *  - decent hands call when it is cheap relative to the pot,
 *  - everything else checks or folds.
 */
export function choosePokerAction(view: PokerView, playerId: string): PokerAction {
  const strength = handStrength(view);
  const legal = view.legal;
  const pot = view.pot;
  const bb = bigBlind(view.settings.minBuyIn);
  const toCall = legal.toCall;

  if (strength >= 7) {
    if (legal.canRaise) return { type: 'bet', playerId, to: legal.minRaiseTo };
    if (legal.canCall) return { type: 'call', playerId };
  }
  if (strength >= 4) {
    if (legal.canCheck) return { type: 'check', playerId };
    if (legal.canCall && toCall <= Math.max(2 * bb, Math.floor(pot / 3) + toCall)) return { type: 'call', playerId };
    return { type: 'fold', playerId };
  }
  if (legal.canCheck) return { type: 'check', playerId };
  // Peel the big blind cheaply when the pot is small, otherwise fold.
  if (legal.canCall && toCall <= bb && pot <= 6 * bb) return { type: 'call', playerId };
  return { type: 'fold', playerId };
}

/** 1..9 (weakest..strongest) postflop; a smaller preflop scale. */
function handStrength(view: PokerView): number {
  const hole = view.hole;
  const board = view.community;
  if (hole.length < 2) return 0;

  if (board.length === 0) return preflopStrength(hole);

  const best = bestHand([...hole, ...board]);
  if (!best) return 0;
  return CATEGORIES.indexOf(best.value.category) + 1;
}

function preflopStrength(hole: PokerCard[]): number {
  const a = hole[0]!;
  const b = hole[1]!;
  const va = rankValue(a.rank);
  const vb = rankValue(b.rank);
  if (a.rank === b.rank) return va >= 10 ? 7 : va >= 6 ? 6 : 5;
  const high = Math.max(va, vb);
  const suited = a.suit === b.suit;
  if (high >= 13 || (high >= 12 && suited) || (va >= 10 && vb >= 10)) return suited ? 5 : 4;
  if (high >= 9 && high + Math.min(va, vb) >= 18) return suited ? 4 : 3;
  return high >= 10 ? 3 : 2;
}