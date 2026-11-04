import { describe, expect, it } from 'vitest';
import { addMoney, nextLossStreak, roundReward } from '../../src/cs/economy.js';

describe('roundReward', () => {
  it('pays 3250 for a win', () => {
    expect(roundReward({ won: true, lossStreak: 0, side: 'attack', planted: false })).toBe(3250);
    expect(roundReward({ won: true, lossStreak: 3, side: 'defense', planted: true })).toBe(3250);
  });

  it('pays a growing loss bonus capped at 4 losses', () => {
    const loss = (lossStreak: number) => roundReward({ won: false, lossStreak, side: 'defense', planted: false });
    expect(loss(0)).toBe(1400);
    expect(loss(1)).toBe(1900);
    expect(loss(4)).toBe(3400);
    expect(loss(9)).toBe(3400);
  });

  it('gives a losing attack a planted-bomb bonus, but not the defense', () => {
    expect(roundReward({ won: false, lossStreak: 0, side: 'attack', planted: true })).toBe(2200);
    expect(roundReward({ won: false, lossStreak: 0, side: 'defense', planted: true })).toBe(1400);
  });
});

describe('nextLossStreak', () => {
  it('resets on a win and grows on a loss', () => {
    expect(nextLossStreak(3, true)).toBe(0);
    expect(nextLossStreak(3, false)).toBe(4);
  });
});

describe('addMoney', () => {
  it('caps at the maximum', () => {
    expect(addMoney(8800, 500)).toBe(9000);
    expect(addMoney(100, 500)).toBe(600);
  });
});
