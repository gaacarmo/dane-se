/**
 * Seedable PRNG (mulberry32). The state is a plain 32-bit integer so it can live
 * inside the serializable game state and keep the engine deterministic.
 */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

export function randomInt(state: number, maxExclusive: number): { value: number; state: number } {
  const r = nextRandom(state);
  return { value: Math.floor(r.value * maxExclusive), state: r.state };
}

/** Fisher-Yates shuffle; returns a new array and the advanced RNG state. */
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const result = [...items];
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const r = randomInt(s, i + 1);
    s = r.state;
    const j = r.value;
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return { items: result, state: s };
}
