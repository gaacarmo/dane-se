import { isValidMoney, type Money } from '../../hub/money.js';
import { type Card, type Rank, RANKS } from '../danese/cards.js';

/** Duvido: jogo de blefe, cada um por si. */
export const DUVIDO_MIN_PLAYERS = 2;
export const DUVIDO_MAX_PLAYERS = 6;

/** Cartas que cada um recebe a cada rodada. */
export const DUVIDO_HAND_SIZE = 5;
/** Quantas cartas dá pra jogar de uma vez. */
export const DUVIDO_MAX_PLAY = 3;
/** Balas no pote de cada um no começo: uma delas é a apimentada. */
export const DUVIDO_CANDIES = 6;

export const DUVIDO_MIN_ENTRY: Money = 100;

export interface DuvidoSettings {
  /** Entrada por jogador. */
  entry: Money;
}

export const DEFAULT_DUVIDO_SETTINGS: DuvidoSettings = { entry: DUVIDO_MIN_ENTRY };

export function validateDuvidoSettings(raw: unknown): DuvidoSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const patch = raw as Record<string, unknown>;
  const next: DuvidoSettings = { ...DEFAULT_DUVIDO_SETTINGS };
  if (patch.entry !== undefined) {
    if (!isValidMoney(patch.entry) || patch.entry < DUVIDO_MIN_ENTRY) return null;
    next.entry = patch.entry;
  }
  return next;
}

/** A manilha (curinga da rodada) é a carta logo acima da vira. */
export function duvidoManilha(vira: Card): Rank {
  return RANKS[(RANKS.indexOf(vira.rank) + 1) % RANKS.length]!;
}

/** Uma carta "vale" na rodada se for do valor pedido ou se for manilha (curinga). */
export function cardCounts(card: Card, value: Rank, manilha: Rank): boolean {
  return card.rank === value || card.rank === manilha;
}

/** Nome do valor no plural, como se fala na mesa ("Reis", "Setes"). */
export const RANK_PLURAL_PT: Record<Rank, string> = {
  '4': 'Quatros',
  '5': 'Cincos',
  '6': 'Seis',
  '7': 'Setes',
  Q: 'Damas',
  J: 'Valetes',
  K: 'Reis',
  A: 'Ases',
  '2': 'Dois',
  '3': 'Três',
};

export const RANK_SINGULAR_PT: Record<Rank, string> = {
  '4': 'Quatro',
  '5': 'Cinco',
  '6': 'Seis',
  '7': 'Sete',
  Q: 'Dama',
  J: 'Valete',
  K: 'Rei',
  A: 'Ás',
  '2': 'Dois',
  '3': 'Três',
};

/** "2 Reis", "1 Rei". */
export function claimLabel(count: number, value: Rank): string {
  return `${count} ${count === 1 ? RANK_SINGULAR_PT[value] : RANK_PLURAL_PT[value]}`;
}
