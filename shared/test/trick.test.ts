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

  it('three cards of the same rank: the higher suit wins (Ouros < Espadas < Copas < Paus)', () => {
    const result = resolveTrick(plays(['a', '4D'], ['b', 'KD'], ['c', 'KS'], ['d', 'KC']), manilha);
    expect(result).toEqual({ winnerId: 'd', canceledPlayerIds: [] });
    expect(resolveTrick(plays(['a', 'KH'], ['b', 'KD'], ['c', 'KS']), manilha).winnerId).toBe('a');
  });

  it('two cards of the same rank cancel ("embucham") and the next highest wins', () => {
    const result = resolveTrick(plays(['a', '4D'], ['b', 'KD'], ['c', 'KS'], ['d', '7S']), manilha);
    expect(result.winnerId).toBe('d');
    expect(result.canceledPlayerIds.sort()).toEqual(['b', 'c']);
  });

  it('cancels again when the next rank down is also a pair', () => {
    const result = resolveTrick(plays(['a', '3D'], ['b', '3C'], ['c', 'KH'], ['d', 'KS'], ['e', '4D']), manilha);
    expect(result.winnerId).toBe('e');
    expect(result.canceledPlayerIds.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a pair cancels, then three of a lower rank are decided by suit', () => {
    const result = resolveTrick(plays(['a', '3D'], ['b', '3C'], ['c', '7D'], ['d', '7H'], ['e', '7S']), manilha);
    expect(result.winnerId).toBe('d');
  });

  it('four cards of the same rank cancel like a pair', () => {
    const result = resolveTrick(plays(['a', 'KD'], ['b', 'KS'], ['c', 'KH'], ['d', 'KC'], ['e', '6D']), manilha);
    expect(result.winnerId).toBe('e');
  });

  it('a lower pair does not affect a single highest card', () => {
    expect(resolveTrick(plays(['a', '2D'], ['b', '2C'], ['c', '3H']), manilha)).toEqual({ winnerId: 'c', canceledPlayerIds: [] });
  });

  it('nobody wins when every card is canceled', () => {
    expect(resolveTrick(plays(['a', 'KD'], ['b', 'KC']), manilha)).toEqual({ winnerId: null, canceledPlayerIds: ['a', 'b'] });
  });

  it('manilhas rank by suit', () => {
    expect(resolveTrick(plays(['a', '5D'], ['b', '5C'], ['c', '5S']), manilha).winnerId).toBe('b');
  });
});
