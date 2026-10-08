import { describe, expect, it } from 'vitest';
import { resolveTrick } from '../src/index.js';
import { c } from './helpers.js';

const plays = (...entries: [string, string][]) => entries.map(([playerId, card]) => ({ playerId, card: c(card) }));
const manilha = '5'; // vira 4

describe('resolveTrick', () => {
  it('highest card wins', () => {
    expect(resolveTrick(plays(['a', '7D'], ['b', 'KS'], ['c', 'QH']), manilha)).toEqual({
      winnerId: 'b',
      canceledPlayerIds: [],
    });
  });

  it('manilha beats a 3', () => {
    expect(resolveTrick(plays(['a', '3C'], ['b', '5D']), manilha).winnerId).toBe('b');
  });

  it('same rank: the higher suit wins (Ouros < Espadas < Copas < Paus)', () => {
    const result = resolveTrick(plays(['a', '3D'], ['b', '3C'], ['c', '7H']), manilha);
    expect(result).toEqual({ winnerId: 'b', canceledPlayerIds: [] });
    expect(resolveTrick(plays(['a', 'KS'], ['b', 'KH']), manilha).winnerId).toBe('b');
    expect(resolveTrick(plays(['a', 'KD'], ['b', 'KS']), manilha).winnerId).toBe('b');
    expect(resolveTrick(plays(['a', 'KC'], ['b', 'KH']), manilha).winnerId).toBe('a');
  });

  it('a higher rank still beats a higher suit of a lower rank', () => {
    expect(resolveTrick(plays(['a', '3D'], ['b', '2C']), manilha).winnerId).toBe('a');
  });

  it('with several equal ranks, the best suit among the top rank wins', () => {
    const result = resolveTrick(plays(['a', 'KD'], ['b', 'KC'], ['c', '7D'], ['d', '7S'], ['e', 'KH']), manilha);
    expect(result.winnerId).toBe('b');
  });

  it('nobody is ever canceled', () => {
    const result = resolveTrick(plays(['a', 'KD'], ['b', 'KC']), manilha);
    expect(result.canceledPlayerIds).toEqual([]);
    expect(result.winnerId).not.toBeNull();
  });

  it('manilhas rank by suit', () => {
    expect(resolveTrick(plays(['a', '5D'], ['b', '5C'], ['c', '5S']), manilha).winnerId).toBe('b');
  });
});
