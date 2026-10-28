import { describe, expect, it } from 'vitest';
import { matchWinner, sideOf } from '../../src/cs/match.js';

describe('matchWinner', () => {
  it('ends 4-0 but not 4-1', () => {
    expect(matchWinner(4, 0)).toBe('A');
    expect(matchWinner(0, 4)).toBe('B');
    expect(matchWinner(4, 1)).toBeNull();
  });

  it('needs a 4 round lead while trailing', () => {
    expect(matchWinner(5, 1)).toBe('A');
    expect(matchWinner(6, 2)).toBe('A');
    expect(matchWinner(4, 3)).toBeNull();
  });

  it('caps at 7 rounds won', () => {
    expect(matchWinner(7, 3)).toBe('A');
    expect(matchWinner(7, 6)).toBe('A');
    expect(matchWinner(6, 7)).toBe('B');
  });

  it('keeps playing while level', () => {
    expect(matchWinner(6, 6)).toBeNull();
    expect(matchWinner(3, 3)).toBeNull();
  });
});

describe('sideOf', () => {
  it('swaps sides every 3 rounds', () => {
    for (const round of [0, 1, 2]) expect(sideOf('A', round)).toBe('attack');
    for (const round of [3, 4, 5]) expect(sideOf('A', round)).toBe('defense');
    expect(sideOf('A', 6)).toBe('attack');
    expect(sideOf('B', 0)).toBe('defense');
    expect(sideOf('B', 3)).toBe('attack');
  });
});
