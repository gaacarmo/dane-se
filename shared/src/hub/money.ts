/**
 * Money is always an integer number of "reais de brincadeira" (play money):
 * no floats, no decimals, anywhere. The client only ever displays what the
 * server sends; every amount is validated server-side.
 */
export type Money = number;

/** A brand-new wallet starts with this much. */
export const STARTING_BALANCE = 10_000;

/** A player below this balance may refill (they'd be locked out otherwise). */
export const REFILL_THRESHOLD = 100;
/** Refill resets the wallet to this balance (it does not add to it). */
export const REFILL_AMOUNT = 10_000;
/** How often a wallet may refill. */
export const REFILL_COOLDOWN_MS = 60 * 60 * 1000;

/** True for a non-negative safe integer. */
export function isValidMoney(value: unknown): value is Money {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** `10000` -> `10.000` (pt-BR thousands separator, no decimals). */
export function groupThousands(value: number): string {
  return Math.max(0, Math.round(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `R$ 10.000`. Pick one format and keep it consistent across the UI. */
export function formatMoney(value: number): string {
  return `R$ ${groupThousands(value)}`;
}
