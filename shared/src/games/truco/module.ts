import {
  type AutoStep,
  type BotStep,
  type EngineError,
  type EngineResult,
  type GameModule,
  type GamePlayer,
} from '../../hub/gameModule.js';
import { type Entry, type Payout, splitByWeights } from '../../hub/payout.js';
import { chooseTrucoAction } from './bot.js';
import { type TrucoAction, type TrucoGameState, applyTrucoAction, createTrucoGame, trucoActorId } from './game.js';
import {
  DEFAULT_TRUCO_SETTINGS,
  TRUCO_MAX_PLAYERS,
  TRUCO_MIN_ENTRY,
  TRUCO_MIN_PLAYERS,
  type TrucoSettings,
  validateTrucoSettings,
} from './rules.js';
import { type TrucoView, getTrucoView } from './view.js';

type Built = { ok: true; action: TrucoAction } | { ok: false; error: EngineError };

function playAction(_state: TrucoGameState, playerId: string, rawCardId: unknown): Built {
  if (typeof rawCardId !== 'string' || rawCardId.length === 0 || rawCardId.length > 4) {
    return { ok: false, error: 'INVALID_ACTION' };
  }
  return { ok: true, action: { type: 'play', playerId, cardId: rawCardId } };
}

function betAction(): Built {
  // No truco não há palpite: os pedidos vão por `game:action`.
  return { ok: false, error: 'INVALID_ACTION' };
}

/** `{ type: 'truco' | 'accept' | 'run' }`. Vez e fase são checadas no `apply`. */
function commandAction(_state: TrucoGameState, playerId: string, raw: unknown): Built {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID_ACTION' };
  const type = (raw as { type?: unknown }).type;
  if (type === 'truco' || type === 'accept' || type === 'run') return { ok: true, action: { type, playerId } };
  return { ok: false, error: 'INVALID_ACTION' };
}

function auto(state: TrucoGameState): AutoStep<TrucoAction> | null {
  if (state.phase === 'roundEnd') return { delay: 'trickPause', action: { type: 'collectRound' } };
  if (state.phase === 'handEnd') return { delay: 'roundSummary', action: { type: 'nextHand' } };
  return null;
}

function botAction(state: TrucoGameState, playerId: string, rng: number): BotStep<TrucoAction> | null {
  if (trucoActorId(state) !== playerId) return null;
  return chooseTrucoAction(getTrucoView(state, playerId), playerId, rng);
}

/** A dupla vencedora divide o pote em partes iguais; a outra não recebe nada. */
function settle(state: TrucoGameState, entries: readonly Entry[]): Payout[] {
  const pot = entries.reduce((sum, e) => sum + e.amount, 0);
  const winners = state.players.filter((p) => p.team === state.winnerTeam);
  const losers = state.players.filter((p) => p.team !== state.winnerTeam);
  if (winners.length === 0) return [];
  const shares = splitByWeights(pot, winners.map(() => 1));
  return [
    ...winners.map((p, i) => ({ playerId: p.id, amount: shares[i]!, place: 1 })),
    ...losers.map((p) => ({ playerId: p.id, amount: 0, place: 2 })),
  ];
}

/** Truco Paulista adaptado ao contrato do hub. */
export const trucoModule: GameModule<TrucoSettings, TrucoGameState, TrucoAction, TrucoView> = {
  id: 'truco',
  name: 'Truco Paulista',
  description: 'Com vira e manilha. Peça truco, blefe e leve a dupla até 12 pontos.',
  minPlayers: TRUCO_MIN_PLAYERS,
  maxPlayers: TRUCO_MAX_PLAYERS,
  minEntry: TRUCO_MIN_ENTRY,
  defaultEntry: DEFAULT_TRUCO_SETTINGS.entry,
  entryOptions: [100, 250, 500, 1000],

  validateSettings: validateTrucoSettings,
  entryFor: (settings) => settings.entry,

  create(players: readonly GamePlayer[], settings, seed): EngineResult<TrucoGameState> {
    return createTrucoGame(players, seed, settings);
  },

  apply: (state, action) => applyTrucoAction(state, action),
  viewFor: (state, viewerId) => getTrucoView(state, viewerId),
  botAction,
  actorId: trucoActorId,
  auto,
  playAction,
  betAction,
  commandAction,
  isFinished: (state) => state.phase === 'gameOver',
  winnerId: (state) => state.players.find((p) => p.team === state.winnerTeam)?.id ?? null,
  settle,
};
