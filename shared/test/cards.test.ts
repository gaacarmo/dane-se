import { describe, expect, it } from 'vitest';
import { DECK_SIZE, cardId, cardStrength, compareCards, createDeck, manilhaRankFor, nextRandom, shuffle } from '../src/index.js';
import { c } from './helpers.js';

describe('deck', () => {
  it('has 40 unique cards without 8, 9, 10', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map(cardId)).size).toBe(40);
    expect(deck.some((card) => ['8', '9', '10'].includes(card.rank))).toBe(false);
  });
});

describe('manilha', () => {
  it.each([
    ['4D', '5'],
    ['7C', 'Q'],
    ['QD', 'J'],
    ['KH', 'A'],
    ['AS', '2'],
    ['2D', '3'],
    ['3C', '4'], // wraps around
  ])('vira %s -> manilha %s', (vira, manilha) => {
    expect(manilhaRankFor(c(vira))).toBe(manilha);
  });
});

describe('card comparison', () => {
  const manilha = '5'; // vira 4

  it('ranks 4 < 6 < 7 < Q < J < K < A < 2 < 3', () => {
    const order = ['4D', '6D', '7D', 'QD', 'JD', 'KD', 'AD', '2D', '3D'].map(c);
    for (let i = 1; i < order.length; i++) {
      expect(compareCards(order[i]!, order[i - 1]!, manilha)).toBeGreaterThan(0);
    }
  });

  it('same rank, different suit ties when not manilha', () => {
    expect(compareCards(c('3C'), c('3D'), manilha)).toBe(0);
    expect(compareCards(c('KH'), c('KS'), manilha)).toBe(0);
  });

  it('weakest manilha beats a 3', () => {
    expect(compareCards(c('5D'), c('3C'), manilha)).toBeGreaterThan(0);
  });

  it('manilhas rank by suit: Ouros < Espadas < Copas < Paus', () => {
    const strengths = ['5D', '5S', '5H', '5C'].map((id) => cardStrength(c(id), manilha));
    expect([...strengths].sort((a, b) => a - b)).toEqual(strengths);
    expect(new Set(strengths).size).toBe(4);
  });

  it('a 4 is the manilha when the vira is 3', () => {
    expect(compareCards(c('4D'), c('3C'), manilhaRankFor(c('3H')))).toBeGreaterThan(0);
  });
});

describe('rng', () => {
  it('is deterministic for a seed', () => {
    expect(shuffle(createDeck(), 42).items).toEqual(shuffle(createDeck(), 42).items);
    expect(shuffle(createDeck(), 42).items).not.toEqual(shuffle(createDeck(), 43).items);
  });

  it('produces values in [0, 1)', () => {
    let state = 7;
    for (let i = 0; i < 1000; i++) {
      const r = nextRandom(state);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      state = r.state;
    }
  });
});
