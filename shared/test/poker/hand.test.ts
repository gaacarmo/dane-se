import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  HAND_CATEGORY_NAMES_PT,
  type HandCategory,
  bestHand,
  compareHandValues,
  evaluateFive,
  parsePokerCardId,
  type PokerCard,
} from '../../src/index.js';

function pc(id: string): PokerCard {
  const card = parsePokerCardId(id);
  if (!card) throw new Error(`Bad poker card id ${id}`);
  return card;
}

const hand = (ids: string) => ids.split(' ').map(pc);

describe('evaluateFive', () => {
  it.each<[string, HandCategory, number[]]>([
    ['AS KS QS JS TS', 'straightFlush', [14]],
    ['9H 8H 7H 6H 5H', 'straightFlush', [9]],
    ['AH 2H 3H 4H 5H', 'straightFlush', [5]],
    ['QC QD QH QS 3C', 'quads', [12, 3]],
    ['7C 7D 7H 2S 2C', 'fullHouse', [7, 2]],
    ['AH KH QH 9H 3H', 'flush', [14, 13, 12, 9, 3]],
    ['9C 8D 7H 6S 5C', 'straight', [9]],
    ['5C 4D 3H 2S AC', 'straight', [5]],
    ['4C 4D 4H KS 2C', 'trips', [4, 13, 2]],
    ['JC JD 4S 4H 9C', 'twoPair', [11, 4, 9]],
    ['8C 8D AS QH 3C', 'pair', [8, 14, 12, 3]],
    ['AC KD 9H 5S 2C', 'high', [14, 13, 9, 5, 2]],
  ])('%s is a %s %j', (cards, category, ranks) => {
    expect(evaluateFive(hand(cards))).toEqual({ category, ranks });
  });

  it('ranks a wheel as a five-high straight', () => {
    expect(evaluateFive(hand('AC 2D 3H 4S 5C')).ranks).toEqual([5]);
  });

  it('does not call A-K-Q-J-10 a wheel or A-2-3-4-6 a straight', () => {
    expect(evaluateFive(hand('AC 2D 3H 4S 6C')).category).toBe('high');
    expect(evaluateFive(hand('AC KD QH JS TC')).category).toBe('straight');
  });
});

describe('bestHand', () => {
  it('returns null with fewer than five cards', () => {
    expect(bestHand(hand('AS KS QS JS'))).toBeNull();
  });

  it('picks the straight flush out of seven cards', () => {
    const best = bestHand(hand('AS KS QS JS TS 2H 3D'))!;
    expect(best.value).toEqual({ category: 'straightFlush', ranks: [14] });
  });

  it('plays the best five of seven (boat over trips)', () => {
    const best = bestHand(hand('7C 7D 7H 2S 2C KD AH'))!;
    expect(best.value).toEqual({ category: 'fullHouse', ranks: [7, 2] });
  });

  it('prefers a higher two pair', () => {
    const best = bestHand(hand('AC AD 4S 4H 9C 9D 2S'))!;
    expect(best.value).toEqual({ category: 'twoPair', ranks: [14, 9, 4] });
  });
});

describe('compareHandValues', () => {
  it('orders the categories weakest to strongest', () => {
    const representative: Record<HandCategory, string> = {
      high: 'AS KD 9H 5S 2C',
      pair: 'AS AD 9H 5S 2C',
      twoPair: 'AS AD 9H 9S 2C',
      trips: 'AS AD AH 5S 2C',
      straight: '9S 8D 7H 6S 5C',
      flush: 'AS KS 9S 5S 2S',
      fullHouse: 'AS AD AH 5S 5C',
      quads: 'AS AD AH AC 2S',
      straightFlush: '9S 8S 7S 6S 5S',
    };
    const categories = Object.keys(representative) as HandCategory[];
    const values = categories.map((c) => evaluateFive(hand(representative[c])));
    for (let i = 1; i < values.length; i++) {
      expect(compareHandValues(values[i]!, values[i - 1]!)).toBe(1);
      expect(compareHandValues(values[i - 1]!, values[i]!)).toBe(-1);
    }
  });

  it('gives every category a pt-BR name', () => {
    expect(Object.keys(HAND_CATEGORY_NAMES_PT).sort()).toEqual([...CATEGORIES].sort());
    for (const name of Object.values(HAND_CATEGORY_NAMES_PT)) {
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('breaks pairs by kickers, then by the lower kicker', () => {
    const acesKickerKing = evaluateFive(hand('AC AD KH 9S 2C'));
    const acesKickerQueen = evaluateFive(hand('AH AS QD 9C 2D'));
    const acesKickerKingLow3 = evaluateFive(hand('AD AC KH 9D 3C'));
    expect(compareHandValues(acesKickerKing, acesKickerQueen)).toBe(1);
    expect(compareHandValues(acesKickerQueen, acesKickerKing)).toBe(-1);
    // Same pair and top kickers; the fifth-card kicker decides (3 over 2).
    expect(compareHandValues(acesKickerKingLow3, acesKickerKing)).toBe(1);
  });

  it('treats a true tie as 0', () => {
    expect(compareHandValues(evaluateFive(hand('AC KD QH JS 9C')), evaluateFive(hand('AD KC QS JH 9D')))).toBe(0);
  });
});
