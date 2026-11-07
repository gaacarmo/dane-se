import {
  type AutoStep,
  type BotStep,
  type EngineError,
  type EngineResult,
  type GameModule,
  type GamePlayer,
} from '../../hub/gameModule.js';
import { type Entry, type Payout, splitByWeights } from '../../hub/payout.js';
import { type BingoAction, type BingoGameState, applyBingoAction, createBingoGame } from './game.js';
import {
  BINGO_MAX_PLAYERS,
  BINGO_MIN_ENTRY,
  BINGO_MIN_PLAYERS,
  BINGO_SHARE,
  type BingoSettings,
  DEFAULT_BINGO_SETTINGS,
  LINE_SHARE,
  validateBingoSettings,
} from './rules.js';
import { type BingoView, getBingoView } from './view.js';

type Built = { ok: true; action: BingoAction } | { ok: false; error: EngineError };

function playAction(): Built {
  return { ok: false, error: 'INVALID_ACTION' };
}

function betAction(): Built {
  return { ok: false, error: 'INVALID_ACTION' };
}

/** `{ type: 'claim', prize: 'line' | 'bingo' }`. Se vale ou não, o `apply` decide. */
function commandAction(_state: BingoGameState, playerId: string, raw: unknown): Built {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID_ACTION' };
  const { type, prize } = raw as { type?: unknown; prize?: unknown };
  if (type === 'claim' && (prize === 'line' || prize === 'bingo')) return { ok: true, action: { type: 'claim', playerId, prize } };
  return { ok: false, error: 'INVALID_ACTION' };
}

function auto(state: BingoGameState): AutoStep<BingoAction> | null {
  return state.phase === 'playing' ? { delay: 'ballDraw', action: { type: 'draw' } } : null;
}

/** Ninguém tem "vez" no bingo: os bots cantam dentro do sorteio (veja `draw`). */
function botAction(): BotStep<BingoAction> | null {
  return null;
}

/** Bingo leva 70% e Linha 30% (a mesma pessoa pode levar os dois). */
function settle(state: BingoGameState, entries: readonly Entry[]): Payout[] {
  const pot = entries.reduce((sum, e) => sum + e.amount, 0);
  const [bingoShare, lineShare] = splitByWeights(pot, [BINGO_SHARE, LINE_SHARE]);
  const amounts = new Map(state.players.map((p) => [p.id, 0]));
  if (state.bingoWinnerId) amounts.set(state.bingoWinnerId, amounts.get(state.bingoWinnerId)! + bingoShare!);
  const lineTo = state.lineWinnerId ?? state.bingoWinnerId;
  if (lineTo) amounts.set(lineTo, amounts.get(lineTo)! + lineShare!);
  const place = (id: string) => (id === state.bingoWinnerId ? 1 : id === state.lineWinnerId ? 2 : 3);
  return state.players
    .map((p) => ({ playerId: p.id, amount: amounts.get(p.id)!, place: place(p.id) }))
    .sort((a, b) => a.place - b.place);
}

/** Bingo adaptado ao contrato do hub. */
export const bingoModule: GameModule<BingoSettings, BingoGameState, BingoAction, BingoView> = {
  id: 'bingo',
  name: 'Bingo',
  description: 'Cartela de 75 bolas. Linha leva 30% do pote e cartela cheia leva 70%: cante antes dos outros.',
  minPlayers: BINGO_MIN_PLAYERS,
  maxPlayers: BINGO_MAX_PLAYERS,
  minEntry: BINGO_MIN_ENTRY,
  defaultEntry: DEFAULT_BINGO_SETTINGS.entry,
  entryOptions: [100, 250, 500, 1000],

  validateSettings: validateBingoSettings,
  entryFor: (settings) => settings.entry,

  create(players: readonly GamePlayer[], settings, seed): EngineResult<BingoGameState> {
    return createBingoGame(players, seed, settings);
  },

  apply: (state, action) => applyBingoAction(state, action),
  viewFor: (state, viewerId) => getBingoView(state, viewerId),
  botAction,
  actorId: () => null,
  auto,
  playAction,
  betAction,
  commandAction,
  isFinished: (state) => state.phase === 'gameOver',
  winnerId: (state) => state.bingoWinnerId,
  settle,
};
