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

  it('tied top cards cancel and the next highest wins', () => {
    const result = resolveTrick(plays(['a', '3D'], ['b', '3C'], ['c', '7H']), manilha);
    expect(result.winnerId).toBe('c');
    expect(result.canceledPlayerIds.sort()).toEqual(['a', 'b']);
  });

  it('cancels repeatedly when the next level is also tied', () => {
    const result = resolveTrick(plays(['a', '3D'], ['b', '3C'], ['c', 'KH'], ['d', 'KS'], ['e', '4D']), manilha);
    expect(result.winnerId).toBe('e');
    expect(result.canceledPlayerIds.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a lower tie does not affect a single highest card', () => {
    const result = resolveTrick(plays(['a', '2D'], ['b', '2C'], ['c', '3H']), manilha);
    expect(result).toEqual({ winnerId: 'c', canceledPlayerIds: [] });
  });

  it('nobody wins when every card is canceled', () => {
    expect(resolveTrick(plays(['a', 'KD'], ['b', 'KC']), manilha)).toEqual({
      winnerId: null,
      canceledPlayerIds: ['a', 'b'],
    });
    expect(resolveTrick(plays(['a', 'KD'], ['b', 'KC'], ['c', '7D'], ['d', '7S']), manilha).winnerId).toBeNull();
  });

  it('manilhas never tie with each other', () => {
    expect(resolveTrick(plays(['a', '5D'], ['b', '5C'], ['c', '5S']), manilha).winnerId).toBe('b');
  });
});
