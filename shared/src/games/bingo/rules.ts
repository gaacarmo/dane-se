import { isValidMoney, type Money } from '../../hub/money.js';
import { shuffle } from '../../rng.js';

export const BINGO_MIN_PLAYERS = 2;
export const BINGO_MAX_PLAYERS = 8;
export const BINGO_MIN_ENTRY: Money = 100;
/** 75 bolas: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75. */
export const BINGO_BALLS = 75;
export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;
/** Divisão do pote: Bingo (cartela cheia) leva 70%, Linha leva 30%. */
export const BINGO_SHARE = 70;
export const LINE_SHARE = 30;
/** O meio da cartela é livre (vem marcado). */
export const FREE = 0;
export const CENTER = 12;

export interface BingoSettings {
  entry: Money;
}

export const DEFAULT_BINGO_SETTINGS: BingoSettings = { entry: BINGO_MIN_ENTRY };

export function validateBingoSettings(raw: unknown): BingoSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const patch = raw as Record<string, unknown>;
  const next: BingoSettings = { ...DEFAULT_BINGO_SETTINGS };
  if (patch.entry !== undefined) {
    if (!isValidMoney(patch.entry) || patch.entry < BINGO_MIN_ENTRY) return null;
    next.entry = patch.entry;
  }
  return next;
}

/** "N 42". */
export function ballLabel(n: number): string {
  return `${BINGO_LETTERS[Math.floor((n - 1) / 15)]} ${n}`;
}

/**
 * Uma cartela 5×5, linha a linha (índice = linha × 5 + coluna). A coluna B tem
 * 5 números de 1 a 15, a I de 16 a 30 e assim por diante; o centro é livre (0).
 */
export function makeCard(rng: number): { card: number[]; rng: number } {
  const columns: number[][] = [];
  let s = rng;
  for (let col = 0; col < 5; col++) {
    const range = Array.from({ length: 15 }, (_, i) => col * 15 + i + 1);
    const shuffled = shuffle(range, s);
    s = shuffled.state;
    columns.push(shuffled.items.slice(0, 5).sort((a, b) => a - b));
  }
  const card: number[] = [];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) card.push(columns[col]![row]!);
  card[CENTER] = FREE;
  return { card, rng: s };
}

/** As 12 linhas que valem: 5 linhas, 5 colunas e as 2 diagonais (índices da cartela). */
export const LINES: readonly (readonly number[])[] = [
  ...Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => r * 5 + c)),
  ...Array.from({ length: 5 }, (_, c) => Array.from({ length: 5 }, (_, r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

export function isMarked(n: number, drawn: ReadonlySet<number>): boolean {
  return n === FREE || drawn.has(n);
}

/** As linhas completas da cartela (cada uma como lista de índices). */
export function completedLines(card: readonly number[], drawn: ReadonlySet<number>): number[][] {
  return LINES.filter((line) => line.every((i) => isMarked(card[i]!, drawn))).map((l) => [...l]);
}

export function hasLine(card: readonly number[], drawn: ReadonlySet<number>): boolean {
  return completedLines(card, drawn).length > 0;
}

export function isFull(card: readonly number[], drawn: ReadonlySet<number>): boolean {
  return card.every((n) => isMarked(n, drawn));
}

/** Quantos números ainda faltam pra cartela cheia. */
export function missingCount(card: readonly number[], drawn: ReadonlySet<number>): number {
  return card.filter((n) => !isMarked(n, drawn)).length;
}
