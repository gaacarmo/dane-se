import { describe, expect, it } from 'vitest';
import {
  DANESE_MIN_ENTRY,
  assertConservation,
  daneseModule,
  danesePayoutWeights,
  formatMoney,
  groupThousands,
  payoutsForRanking,
  rankDanesePlayers,
  splitByWeights,
} from '../src/index.js';

describe('money formatting', () => {
  it('groups thousands the pt-BR way, with no decimals', () => {
    expect(groupThousands(0)).toBe('0');
    expect(groupThousands(100)).toBe('100');
    expect(groupThousands(10_000)).toBe('10.000');
    expect(groupThousands(1_234_567)).toBe('1.234.567');
    expect(formatMoney(10_000)).toBe('R$ 10.000');
  });
});

describe('splitByWeights', () => {
  it('splits exactly and always sums to the total', () => {
    expect(splitByWeights(200, [100])).toEqual([200]);
    expect(splitByWeights(100, [70, 30])).toEqual([70, 30]);
    expect(splitByWeights(101, [70, 30])).toEqual([71, 30]);
    expect(splitByWeights(1, [70, 30])).toEqual([1, 0]);
  });

  it('sums to the total whatever the remainder', () => {
    for (let pot = 0; pot < 500; pot++) {
      const shares = splitByWeights(pot, [70, 30]);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(pot);
    }
  });
});

describe('payouts', () => {
  it('pays the top weights to the ranking and conserves the pot', () => {
    const entries = [
      { playerId: 'a', amount: 100 },
      { playerId: 'b', amount: 100 },
      { playerId: 'c', amount: 100 },
      { playerId: 'd', amount: 100 },
    ];
    const payouts = payoutsForRanking(['c', 'a', 'b', 'd'], 400, danesePayoutWeights(4));
    expect(payouts).toEqual([
      { playerId: 'c', amount: 280, place: 1 },
      { playerId: 'a', amount: 120, place: 2 },
    ]);
    expect(() => assertConservation(entries, payouts)).not.toThrow();
  });

  it('throws when money is not conserved', () => {
    expect(() =>
      assertConservation([{ playerId: 'a', amount: 100 }], [{ playerId: 'a', amount: 90, place: 1 }]),
    ).toThrow();
  });

  it('pays the whole pot to the winner with 2 or 3 players', () => {
    expect(danesePayoutWeights(2)).toEqual([100]);
    expect(danesePayoutWeights(3)).toEqual([100]);
    expect(danesePayoutWeights(6)).toEqual([70, 30]);
  });
});

describe('rankDanesePlayers', () => {
  const players = [
    { id: 'a', eliminated: false, eliminatedInRound: null },
    { id: 'b', eliminated: true, eliminatedInRound: 2 },
    { id: 'c', eliminated: true, eliminatedInRound: 3 },
    { id: 'd', eliminated: true, eliminatedInRound: 3 },
  ];

  it('puts the survivor first, then the last eliminated', () => {
    expect(rankDanesePlayers(players, ['a', 'b', 'c', 'd'])).toEqual(['a', 'c', 'd', 'b']);
  });

  it('breaks simultaneous eliminations by seat order', () => {
    expect(rankDanesePlayers(players, ['a', 'd', 'c', 'b'])).toEqual(['a', 'd', 'c', 'b']);
  });
});

describe('daneseModule.validateSettings', () => {
  it('fills defaults and accepts valid patches', () => {
    expect(daneseModule.validateSettings({})).toMatchObject({ word: 'DANE-SE', entry: DANESE_MIN_ENTRY });
    expect(daneseModule.validateSettings({ word: 'pato', entry: 250 })).toMatchObject({ word: 'PATO', entry: 250 });
  });

  it('rejects an entry below the minimum and invalid settings', () => {
    expect(daneseModule.validateSettings({ entry: DANESE_MIN_ENTRY - 1 })).toBeNull();
    expect(daneseModule.validateSettings({ entry: 100.5 })).toBeNull();
    expect(daneseModule.validateSettings({ maxCards: 9 })).toBeNull();
    expect(daneseModule.validateSettings({ word: '---' })).toBeNull();
    expect(daneseModule.validateSettings({ cardCountMode: 'chaos' })).toBeNull();
  });
});
