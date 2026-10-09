import { isValidMoney, type Money } from '../../hub/money.js';

export const POKER_MIN_PLAYERS = 2;
export const POKER_MAX_PLAYERS = 8;

/** Cheapest buy-in (and thus the smallest blinds): R$ 1.000. */
export const POKER_MIN_BUY_IN = 1_000;

/** Default cap on the buy-in: this many times `minBuyIn`. */
export const POKER_MAX_BUY_IN_MULTIPLE = 10;

export interface PokerSettings {
  /** Smallest buy-in; also drives the blind sizes (field below). */
  minBuyIn: Money;
  /** Largest buy-in a player may sit with. */
  maxBuyIn: Money;
  /** Buy-in charged per player for this match. */
  entry: Money;
}

export const DEFAULT_POKER_SETTINGS: PokerSettings = {
  minBuyIn: POKER_MIN_BUY_IN,
  maxBuyIn: POKER_MIN_BUY_IN * POKER_MAX_BUY_IN_MULTIPLE,
  entry: POKER_MIN_BUY_IN,
};

/**
 * Blinds are a fixed fraction of `minBuyIn` (not of the actual buy-in), so a
 * room always knows its blinds from the settings alone. minBuyIn 1.000 →
 * SB 10, BB 20.
 */
export function smallBlind(minBuyIn: Money): Money {
  return Math.max(1, Math.floor(minBuyIn / 100));
}

export function bigBlind(minBuyIn: Money): Money {
  return Math.max(smallBlind(minBuyIn), Math.floor(minBuyIn / 50));
}

/** Validates untrusted settings; null when invalid. */
export function validatePokerSettings(raw: unknown): PokerSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const patch = raw as Record<string, unknown>;
  const next: PokerSettings = { ...DEFAULT_POKER_SETTINGS };

  if (patch.minBuyIn !== undefined) {
    if (!isValidMoney(patch.minBuyIn) || patch.minBuyIn < POKER_MIN_BUY_IN) return null;
    next.minBuyIn = patch.minBuyIn;
  }
  const defaultMax = next.minBuyIn * POKER_MAX_BUY_IN_MULTIPLE;
  if (patch.maxBuyIn !== undefined) {
    if (!isValidMoney(patch.maxBuyIn) || patch.maxBuyIn < next.minBuyIn) return null;
    next.maxBuyIn = patch.maxBuyIn;
  } else {
    next.maxBuyIn = defaultMax;
  }
  if (patch.entry !== undefined) {
    if (!isValidMoney(patch.entry) || patch.entry < next.minBuyIn || patch.entry > next.maxBuyIn) return null;
    next.entry = patch.entry;
  } else {
    next.entry = next.minBuyIn;
  }
  return next;
}

/** The absolute minimum chips a raise must put in, as a function of minBuyIn. */
export function minRaiseSize(minBuyIn: Money): Money {
  return bigBlind(minBuyIn);
}