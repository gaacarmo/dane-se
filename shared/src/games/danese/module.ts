import {
  type AutoStep,
  type BotStep,
  type EngineError,
  type EngineResult,
  type GameModule,
  type GamePlayer,
} from '../../hub/gameModule.js';
import { isValidMoney } from '../../hub/money.js';
import { type Entry, type Payout, payoutsForRanking } from '../../hub/payout.js';
import { chooseBotBet, chooseBotCard } from './bot.js';
import { type GameAction, type GameState, applyAction, createGame } from './game.js';
import {
  DANESE_MIN_ENTRY,
  DEFAULT_SETTINGS,
  type GameSettings,
  MAX_PLAYERS,
  MIN_PLAYERS,
  danesePayoutWeights,
  rankDanesePlayers,
  wordLetters,
} from './rules.js';
import { type PlayerView, getPlayerView } from './view.js';

const MAX_WORD_LETTERS = 12;

function validateSettings(raw: unknown): GameSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const patch = raw as Record<string, unknown>;
  const next: GameSettings = { ...DEFAULT_SETTINGS };

  if (patch.word !== undefined) {
    if (typeof patch.word !== 'string') return null;
    const word = patch.word.trim().toUpperCase();
    const letters = wordLetters(word).length;
    if (letters < 1 || letters > MAX_WORD_LETTERS || word.length > 20) return null;
    next.word = word;
  }
  if (patch.maxCards !== undefined) {
    if (typeof patch.maxCards !== 'number' || !Number.isInteger(patch.maxCards) || patch.maxCards < 1 || patch.maxCards > 6) {
      return null;
    }
    next.maxCards = patch.maxCards;
  }
  if (patch.cardCountMode !== undefined) {
    if (patch.cardCountMode !== 'upDown' && patch.cardCountMode !== 'restart') return null;
    next.cardCountMode = patch.cardCountMode;
  }
  if (patch.entry !== undefined) {
    if (!isValidMoney(patch.entry) || patch.entry < DANESE_MIN_ENTRY) return null;
    next.entry = patch.entry;
  }
  return next;
}

function playAction(
  state: GameState,
  playerId: string,
  rawCardId: unknown,
): { ok: true; action: GameAction } | { ok: false; error: EngineError } {
  if (rawCardId !== undefined && typeof rawCardId !== 'string') return { ok: false, error: 'INVALID_ACTION' };
  // In the blind round the player can't see their card: play whatever is on their forehead.
  const blindCard = state.cardsPerPlayer === 1 ? state.hands[playerId]?.[0] : undefined;
  const chosen = blindCard ? `${blindCard.rank}${blindCard.suit}` : rawCardId;
  if (!chosen) return { ok: false, error: 'INVALID_ACTION' };
  return { ok: true, action: { type: 'play', playerId, cardId: chosen } };
}

function betAction(
  state: GameState,
  playerId: string,
  rawBet: unknown,
): { ok: true; action: GameAction } | { ok: false; error: EngineError } {
  if (typeof rawBet !== 'number' || !Number.isInteger(rawBet)) return { ok: false, error: 'INVALID_ACTION' };
  return { ok: true, action: { type: 'bet', playerId, bet: rawBet } };
}

function auto(state: GameState): AutoStep<GameAction> | null {
  if (state.phase === 'trickEnd') return { delay: 'trickPause', action: { type: 'collectTrick' } };
  if (state.phase === 'roundSummary') return { delay: 'roundSummary', action: { type: 'nextRound' } };
  return null;
}

function botAction(state: GameState, playerId: string, rng: number): BotStep<GameAction> | null {
  if (state.turnPlayerId !== playerId) return null;
  const view = getPlayerView(state, playerId);
  if (state.phase === 'betting') {
    return { action: { type: 'bet', playerId, bet: chooseBotBet(view) }, rng };
  }
  if (state.phase === 'playing') {
    const built = playAction(state, playerId, chooseBotCard(view) ?? undefined);
    return built.ok ? { action: built.action, rng } : null;
  }
  return null;
}

/** Dane-se adapted to the generic hub contract. The engine itself is untouched. */
export const daneseModule: GameModule<GameSettings, GameState, GameAction, PlayerView> = {
  id: 'danese',
  name: 'Dane-se',
  description: 'O clássico da mesa. Faça seu palpite, cumpra e não deixe a palavra completar.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  minEntry: DANESE_MIN_ENTRY,
  defaultEntry: DEFAULT_SETTINGS.entry,
  entryOptions: [100, 250, 500, 1000],

  validateSettings,
  entryFor: (settings) => settings.entry,

  create(players: readonly GamePlayer[], settings, seed): EngineResult<GameState> {
    return createGame(
      players.map((p) => ({ id: p.id, name: p.name })),
      seed,
      settings,
    );
  },

  apply: (state, action) => applyAction(state, action),
  viewFor: (state, viewerId) => getPlayerView(state, viewerId),
  botAction,
  actorId: (state) => (state.phase === 'betting' || state.phase === 'playing' ? state.turnPlayerId : null),
  auto,
  playAction,
  betAction,
  isFinished: (state) => state.phase === 'gameOver',
  winnerId: (state) => state.winnerId,

  settle(state: GameState, entries: readonly Entry[]): Payout[] {
    const pot = entries.reduce((sum, e) => sum + e.amount, 0);
    const ranking = rankDanesePlayers(state.players, state.players.map((p) => p.id));
    return payoutsForRanking(ranking, pot, danesePayoutWeights(state.players.length));
  },
};
