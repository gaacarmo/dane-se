import type { Side, TeamId } from './types.js';

export const SWAP_EVERY = 3;
export const MAX_ROUNDS_WON = 7;
export const LEAD_TO_WIN = 4;

/** O time A ataca nas primeiras rodadas e os lados trocam a cada SWAP_EVERY. */
export function sideOf(team: TeamId, roundIndex: number): Side {
  const aAttacks = Math.floor(roundIndex / SWAP_EVERY) % 2 === 0;
  return aAttacks === (team === 'A') ? 'attack' : 'defense';
}

export function matchWinner(a: number, b: number): TeamId | null {
  if (a >= MAX_ROUNDS_WON || a - b >= LEAD_TO_WIN) return 'A';
  if (b >= MAX_ROUNDS_WON || b - a >= LEAD_TO_WIN) return 'B';
  return null;
}

/** A primeira rodada depois de cada troca de lados (3, 6, 9...). */
export function isSideSwapRound(roundIndex: number): boolean {
  return roundIndex > 0 && roundIndex % SWAP_EVERY === 0;
}
