import {
  type AutoStep,
  type BotStep,
  type EngineError,
  type EngineResult,
  type GameModule,
  type GamePlayer,
} from '../../hub/gameModule.js';
import { type Entry, type Payout } from '../../hub/payout.js';
import { isValidMoney, type Money } from '../../hub/money.js';
import { choosePokerAction } from './bot.js';
import { type PokerAction, type PokerGameState, applyPokerAction, createPokerGame } from './game.js';
import {
  DEFAULT_POKER_SETTINGS,
  POKER_MAX_PLAYERS,
  POKER_MIN_BUY_IN,
  POKER_MIN_PLAYERS,
  type PokerSettings,
  validatePokerSettings,
} from './rules.js';
import { type PokerView, getPokerView } from './view.js';

type BetBuilder = { ok: true; action: PokerAction } | { ok: false; error: EngineError };

function playAction(): BetBuilder {
  // NLHE has no "play a card" action (unlike the Dane-se trick rounds).
  return { ok: false, error: 'INVALID_ACTION' };
}

function betAction(state: PokerGameState, playerId: string, rawBet: unknown): BetBuilder {
  // For poker, `bet` means "raise to this total amount on the current street".
  if (typeof rawBet !== 'number' || !Number.isInteger(rawBet) || rawBet < 0) {
    return { ok: false, error: 'INVALID_ACTION' };
  }
  return { ok: true, action: { type: 'bet', playerId, to: rawBet } };
}

/** Named, amount-free actions. Turn/phase legality is enforced by `apply`. */
function commandAction(state: PokerGameState, playerId: string, raw: unknown): BetBuilder {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID_ACTION' };
  switch ((raw as { type?: unknown }).type) {
    case 'fold':
      return { ok: true, action: { type: 'fold', playerId } };
    case 'check':
      return { ok: true, action: { type: 'check', playerId } };
    case 'call':
      return { ok: true, action: { type: 'call', playerId } };
    case 'allIn':
      return { ok: true, action: { type: 'allIn', playerId } };
    default:
      return { ok: false, error: 'INVALID_ACTION' };
  }
}

/** A timed-out player checks when it is free, otherwise folds. */
function timeoutAction(state: PokerGameState, playerId: string): PokerAction | null {
  if (state.status !== 'hand' || !state.hand) return null;
  const hand = state.hand;
  if (hand.phase !== 'betting' || hand.actor !== playerId) return null;
  const seat = hand.seats[playerId];
  if (!seat) return null;
  return hand.currentBet === seat.streetBet ? { type: 'check', playerId } : { type: 'fold', playerId };
}

/** Rebuy amount defaults to the room's buy-in; bounded by the table limits. */
function rebuyAction(
  state: PokerGameState,
  playerId: string,
  rawAmount: unknown,
): { ok: true; action: PokerAction; cost: Money } | { ok: false; error: EngineError } {
  if (state.status !== 'hand' || !state.hand || state.hand.phase !== 'done') return { ok: false, error: 'WRONG_PHASE' };
  if (!state.players.some((p) => p.id === playerId)) return { ok: false, error: 'UNKNOWN_PLAYER' };
  const amount = rawAmount === undefined ? state.settings.entry : rawAmount;
  if (!isValidMoney(amount) || amount < state.settings.minBuyIn || amount > state.settings.maxBuyIn) {
    return { ok: false, error: 'INVALID_ACTION' };
  }
  return { ok: true, action: { type: 'rebuy', playerId, amount }, cost: amount };
}

function auto(state: PokerGameState): AutoStep<PokerAction> | null {
  if (state.status === 'finished' || !state.hand) return null;
  const hand = state.hand;
  if (hand.phase === 'dealing' && hand.pending) {
    // Short beat before the board runs out / the showdown is revealed.
    const action =
      hand.pending === 'advance'
        ? { type: 'advanceStreet' as const }
        : hand.pending === 'runout'
          ? { type: 'runout' as const }
          : { type: 'showdown' as const };
    return { delay: 'trickPause', action };
  }
  if (hand.phase === 'done') {
    // Result screen, then the next hand. Busting gives the longer "between
    // hands" window so the player has time to rebuy before the next deal.
    const justBusted = hand.order.some((id) => state.players.find((p) => p.id === id)!.stack === 0);
    return { delay: justBusted ? 'betweenHands' : 'roundSummary', action: { type: 'nextHand' } };
  }
  return null;
}

function botAction(state: PokerGameState, playerId: string, rng: number): BotStep<PokerAction> | null {
  if (state.status !== 'hand' || !state.hand) return null;
  if (state.hand.phase !== 'betting' || state.hand.actor !== playerId) return null;
  const view = getPokerView(state, playerId);
  return { action: choosePokerAction(view, playerId), rng };
}

function settle(state: PokerGameState, entries: readonly Entry[]): Payout[] {
  // In a cash-style session each player's final stack is their payout; chips
  // only move between players, so the stacks sum to the sum of the buy-ins
  // (rebuy chips must be added to `entries` by the caller, cf. Phase 3).
  const ranked = state.players
    .map((p, index) => ({ p, index }))
    .sort((a, b) => b.p.stack - a.p.stack || a.index - b.index);
  return ranked.map(({ p }, place) => ({ playerId: p.id, amount: p.stack, place: place + 1 }));
}

/** Texas Hold'em adapted to the generic hub contract. */
export const pokerModule: GameModule<PokerSettings, PokerGameState, PokerAction, PokerView> = {
  id: 'poker',
  name: 'Pôquer Texas Hold’em',
  description: 'No-limit Texas Hold’em com blinds, banca e side pots.',
  minPlayers: POKER_MIN_PLAYERS,
  maxPlayers: POKER_MAX_PLAYERS,
  minEntry: POKER_MIN_BUY_IN,
  defaultEntry: DEFAULT_POKER_SETTINGS.entry,
  entryOptions: [1000, 2500, 5000, 10000],

  validateSettings: validatePokerSettings,
  entryFor: (settings) => settings.entry,

  create(players: readonly GamePlayer[], settings: PokerSettings, seed: number): EngineResult<PokerGameState> {
    return createPokerGame(
      players.map((p) => ({ id: p.id, name: p.name })),
      seed,
      settings,
    );
  },

  apply: (state, action) => applyPokerAction(state, action),
  viewFor: (state, viewerId) => getPokerView(state, viewerId),
  botAction,
  actorId: (state) =>
    state.status === 'hand' && state.hand && state.hand.phase === 'betting' ? state.hand.actor : null,
  auto,
  playAction,
  betAction,
  commandAction,
  timeoutAction,
  rebuyAction,
  isFinished: (state) => state.status === 'finished',
  winnerId: (state) => state.winnerId,
  settle,
};