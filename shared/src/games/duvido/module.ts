import {
  type AutoStep,
  type BotStep,
  type EngineError,
  type EngineResult,
  type GameModule,
  type GamePlayer,
} from '../../hub/gameModule.js';
import { type Entry, type Payout, payoutsForRanking } from '../../hub/payout.js';
import { danesePayoutWeights } from '../danese/rules.js';
import { chooseDuvidoAction } from './bot.js';
import { type DuvidoAction, type DuvidoGameState, applyDuvidoAction, createDuvidoGame, duvidoActorId } from './game.js';
import {
  DEFAULT_DUVIDO_SETTINGS,
  DUVIDO_MAX_PLAY,
  DUVIDO_MAX_PLAYERS,
  DUVIDO_MIN_ENTRY,
  DUVIDO_MIN_PLAYERS,
  type DuvidoSettings,
  validateDuvidoSettings,
} from './rules.js';
import { type DuvidoView, getDuvidoView } from './view.js';

type Built = { ok: true; action: DuvidoAction } | { ok: false; error: EngineError };

/** `game:play` com uma carta só (o cliente manda várias por `game:action`). */
function playAction(_state: DuvidoGameState, playerId: string, rawCardId: unknown): Built {
  if (typeof rawCardId !== 'string' || rawCardId.length === 0 || rawCardId.length > 3) return { ok: false, error: 'INVALID_ACTION' };
  return { ok: true, action: { type: 'play', playerId, cardIds: [rawCardId] } };
}

function betAction(): Built {
  return { ok: false, error: 'INVALID_ACTION' };
}

/** `{ type: 'doubt' }` ou `{ type: 'playCards', cardIds: [...] }`. Vez e fase ficam no `apply`. */
function commandAction(_state: DuvidoGameState, playerId: string, raw: unknown): Built {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID_ACTION' };
  const { type, cardIds } = raw as { type?: unknown; cardIds?: unknown };
  if (type === 'doubt') return { ok: true, action: { type: 'doubt', playerId } };
  if (type === 'playCards') {
    if (
      !Array.isArray(cardIds) ||
      cardIds.length < 1 ||
      cardIds.length > DUVIDO_MAX_PLAY ||
      !cardIds.every((c) => typeof c === 'string' && c.length > 0 && c.length <= 3)
    ) {
      return { ok: false, error: 'INVALID_ACTION' };
    }
    return { ok: true, action: { type: 'play', playerId, cardIds: cardIds as string[] } };
  }
  return { ok: false, error: 'INVALID_ACTION' };
}

function auto(state: DuvidoGameState): AutoStep<DuvidoAction> | null {
  // Pausa longa: as cartas desviram e o pote de balas é sorteado na frente de todo mundo.
  if (state.phase === 'reveal') return { delay: 'roundSummary', action: { type: 'nextRound' } };
  return null;
}

function botAction(state: DuvidoGameState, playerId: string, rng: number): BotStep<DuvidoAction> | null {
  if (duvidoActorId(state) !== playerId) return null;
  return chooseDuvidoAction(getDuvidoView(state, playerId), playerId, rng);
}

/** Último que sobrou em 1º; depois quem saiu por último. O pote divide como no Dane-se. */
function settle(state: DuvidoGameState, entries: readonly Entry[]): Payout[] {
  const pot = entries.reduce((sum, e) => sum + e.amount, 0);
  const alive = state.players.filter((p) => !p.out).map((p) => p.id);
  const ranking = [...alive, ...[...state.outOrder].reverse()];
  return payoutsForRanking(ranking, pot, danesePayoutWeights(state.players.length));
}

/** Duvido adaptado ao contrato do hub. */
export const duvidoModule: GameModule<DuvidoSettings, DuvidoGameState, DuvidoAction, DuvidoView> = {
  id: 'duvido',
  name: 'Duvido',
  description: 'Jogue cartas viradas dizendo que são do valor da mesa. Quem é pego mentindo tira uma bala do pote: uma é apimentada.',
  minPlayers: DUVIDO_MIN_PLAYERS,
  maxPlayers: DUVIDO_MAX_PLAYERS,
  minEntry: DUVIDO_MIN_ENTRY,
  defaultEntry: DEFAULT_DUVIDO_SETTINGS.entry,
  entryOptions: [100, 250, 500, 1000],

  validateSettings: validateDuvidoSettings,
  entryFor: (settings) => settings.entry,

  create(players: readonly GamePlayer[], settings, seed): EngineResult<DuvidoGameState> {
    return createDuvidoGame(players, seed, settings);
  },

  apply: (state, action) => applyDuvidoAction(state, action),
  viewFor: (state, viewerId) => getDuvidoView(state, viewerId),
  botAction,
  actorId: duvidoActorId,
  auto,
  playAction,
  betAction,
  commandAction,
  isFinished: (state) => state.phase === 'gameOver',
  winnerId: (state) => state.winnerId,
  settle,
};
