import type { Money } from './money.js';

/** One player's share of a settlement. `place` is 1-based (1 = winner). */
export interface Payout {
  playerId: string;
  amount: Money;
  place: number;
}

/** What one player put into the room (escrow), used to check conservation. */
export interface Entry {
  playerId: string;
  amount: Money;
}

/**
 * Splits `total` by integer `weights`, with every rounding remainder going to
 * the first weight (1st place). The result always sums exactly to `total`.
 */
export function splitByWeights(total: Money, weights: readonly number[]): Money[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const shares = weights.map((w) => Math.floor((total * w) / sum));
  const remainder = total - shares.reduce((a, b) => a + b, 0);
  shares[0] = (shares[0] ?? 0) + remainder;
  return shares;
}

/**
 * Builds the payouts for a ranked list of player ids (index 0 = 1st place)
 * given the pot and the payout weights. Unpaid places get nothing.
 */
export function payoutsForRanking(
  ranking: readonly string[],
  pot: Money,
  weights: readonly number[],
): Payout[] {
  const shares = splitByWeights(pot, weights);
  const payouts: Payout[] = [];
  ranking.forEach((playerId, index) => {
    if (index >= weights.length) return;
    payouts.push({ playerId, amount: shares[index] ?? 0, place: index + 1 });
  });
  return payouts;
}

/**
 * Throws if the settlement does not balance: what was taken in (buy-ins) must
 * equal what goes out (payouts). This is asserted before any money moves.
 */
export function assertConservation(entries: readonly Entry[], payouts: readonly Payout[]): void {
  const taken = entries.reduce((sum, e) => sum + e.amount, 0);
  const paid = payouts.reduce((sum, p) => sum + p.amount, 0);
  if (taken !== paid) {
    throw new Error(`money not conserved: buy-ins ${taken} !== payouts ${paid}`);
  }
}
