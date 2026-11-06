import { isValidMoney, type Money } from '../../hub/money.js';
import { type Card, type Rank, RANKS, SUITS } from '../danese/cards.js';

/** Truco Paulista: 1 contra 1 ou 2 contra 2 (parceiros sentados frente a frente). */
export const TRUCO_PLAYER_COUNTS = [2, 4] as const;
export const TRUCO_MIN_PLAYERS = 2;
export const TRUCO_MAX_PLAYERS = 4;

/** A partida vai até 12 pontos. */
export const TRUCO_TARGET = 12;
/** Mão de onze: quem está com 11 decide se joga a mão (valendo 3) ou corre (o outro leva 1). */
export const TRUCO_ONZE = 11;
export const TRUCO_ONZE_VALUE = 3;

/** Escada do truco: 1 → truco (3) → seis → nove → doze. */
export const TRUCO_LADDER = [1, 3, 6, 9, 12] as const;

export const TRUCO_MIN_ENTRY: Money = 100;

export interface TrucoSettings {
  /** Entrada por jogador. A dupla vencedora divide o pote. */
  entry: Money;
}

export const DEFAULT_TRUCO_SETTINGS: TrucoSettings = { entry: TRUCO_MIN_ENTRY };

export function validateTrucoSettings(raw: unknown): TrucoSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const patch = raw as Record<string, unknown>;
  const next: TrucoSettings = { ...DEFAULT_TRUCO_SETTINGS };
  if (patch.entry !== undefined) {
    if (!isValidMoney(patch.entry) || patch.entry < TRUCO_MIN_ENTRY) return null;
    next.entry = patch.entry;
  }
  return next;
}

/** Duplas: 0 e 1. Os assentos se alternam (0, 2 contra 1, 3). */
export type TrucoTeam = 0 | 1;

export function teamOfSeat(seat: number): TrucoTeam {
  return (seat % 2) as TrucoTeam;
}

export function otherTeam(team: TrucoTeam): TrucoTeam {
  return (1 - team) as TrucoTeam;
}

/** Próximo valor da escada, ou null quando já está valendo 12. */
export function nextTrucoValue(value: number): number | null {
  const index = TRUCO_LADDER.indexOf(value as (typeof TRUCO_LADDER)[number]);
  if (index < 0 || index === TRUCO_LADDER.length - 1) return null;
  return TRUCO_LADDER[index + 1]!;
}

/** Nome do pedido que leva a esse valor. */
export function trucoCallName(value: number): string {
  switch (value) {
    case 3:
      return 'Truco';
    case 6:
      return 'Seis';
    case 9:
      return 'Nove';
    case 12:
      return 'Doze';
    default:
      return `${value}`;
  }
}

/** A manilha é a carta logo acima da vira (vira 3 → manilha 4). */
export function trucoManilha(vira: Card): Rank {
  return RANKS[(RANKS.indexOf(vira.rank) + 1) % RANKS.length]!;
}

/**
 * Força de uma carta no Truco Paulista. Fora das manilhas só o valor conta, então
 * cartas do mesmo valor empatam (a vaza "cangou"). As manilhas vêm acima de tudo,
 * por naipe: ouros (pica-fumo) < espadas < copas < paus (zap).
 */
export function trucoStrength(card: Card, manilha: Rank): number {
  if (card.rank === manilha) return 100 + SUITS.indexOf(card.suit);
  return RANKS.indexOf(card.rank);
}

/** Nome popular da manilha de cada naipe. */
export const MANILHA_NAMES: Record<Card['suit'], string> = {
  D: 'Pica-fumo',
  S: 'Espadilha',
  H: 'Copas',
  C: 'Zap',
};

/** Resultado de uma vaza: a dupla que ganhou, ou empate. */
export type TrucoRoundResult = TrucoTeam | 'tie';

/**
 * Quem leva a mão a partir das vazas jogadas, ou `undefined` enquanto não dá pra saber.
 * `null` = ninguém pontua (as três empataram).
 *
 * - Duas vazas da mesma dupla: ela leva.
 * - Empatou a primeira: quem ganhar a próxima leva.
 * - Ganhou a primeira e empatou a segunda (ou a terceira): leva quem ganhou a primeira.
 */
export function trucoHandWinner(rounds: readonly TrucoRoundResult[]): TrucoTeam | null | undefined {
  const [r1, r2, r3] = rounds;
  if (r1 === undefined || r2 === undefined) return undefined;
  if (r1 !== 'tie' && r1 === r2) return r1;
  if (r1 === 'tie' && r2 !== 'tie') return r2;
  if (r1 !== 'tie' && r2 === 'tie') return r1;
  if (r3 === undefined) return undefined;
  if (r3 !== 'tie') return r3;
  // Terceira empatada: vale a primeira; se tudo empatou, ninguém pontua.
  return r1 === 'tie' ? null : r1;
}
