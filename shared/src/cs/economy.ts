import type { Side } from './types.js';

export const START_MONEY = 800;
export const MAX_MONEY = 9000;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const DEFUSE_REWARD = 300;

const WIN_REWARD = 3250;
const LOSS_BASE = 1400;
const LOSS_STEP = 500;
const LOSS_STREAK_CAP = 4;
const PLANTED_ATTACK_BONUS = 800;

export function roundReward(a: { won: boolean; lossStreak: number; side: Side; planted: boolean }): number {
  if (a.won) return WIN_REWARD;
  const streakBonus = LOSS_STEP * Math.min(a.lossStreak, LOSS_STREAK_CAP);
  const plantedBonus = a.side === 'attack' && a.planted ? PLANTED_ATTACK_BONUS : 0;
  return LOSS_BASE + streakBonus + plantedBonus;
}

export function nextLossStreak(prev: number, won: boolean): number {
  return won ? 0 : prev + 1;
}

export function addMoney(current: number, amount: number): number {
  return Math.min(MAX_MONEY, current + amount);
}
