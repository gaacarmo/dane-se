import { type EngineError, type EngineResult } from '../../hub/gameModule.js';
import { randomInt, shuffle } from '../../rng.js';
import { type PokerCard, createPokerDeck } from './cards.js';
import { type BestHand, type HandValue, bestHand, compareHandValues } from './hand.js';
import {
  type PokerSettings,
  POKER_MAX_PLAYERS,
  POKER_MIN_PLAYERS,
  bigBlind,
  smallBlind,
} from './rules.js';

export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river';
export type PokerHandPhase = 'betting' | 'dealing' | 'done';
export type PokerPending = 'advance' | 'runout' | 'showdown';
export type PokerStatus = 'hand' | 'finished';

export interface PokerPlayer {
  id: string;
  name: string;
  /** Chips in front (not in the pot). Always integer. */
  stack: number;
}

/** One seat in a single hand (players with chips get dealt in). */
export interface HandSeat {
  /** Chips still in front (stack minus this hand's bets). */
  stack: number;
  /** Chips committed this street (subset of `handBet`; drives the betting lines). */
  streetBet: number;
  /** Chips committed this hand (in the pot; drives side pots). */
  handBet: number;
  folded: boolean;
  allIn: boolean;
  /** Has resolved the current bet this street (call/check/raise/fold handled). */
  acted: boolean;
}

export interface PokerHand {
  street: PokerStreet;
  phase: PokerHandPhase;
  /** What the auto step will perform while `phase === 'dealing'`. */
  pending: PokerPending | null;
  /** Seat per dealt-in player, keyed by player id. */
  seats: Record<string, HandSeat>;
  /** Players dealt in, in table order. */
  order: string[];
  buttonId: string;
  sbId: string;
  bbId: string;
  /** Hole cards, one pair per player id (server-only secret except the owner). */
  hole: Record<string, PokerCard[]>;
  community: PokerCard[];
  /** The remaining shuffled deck (server-only secret). `deckPos` is the draw pointer. */
  deck: PokerCard[];
  deckPos: number;
  /** Amount to call on this street (never decreases mid-street). */
  currentBet: number;
  /** Minimum amount the next raise must be by (never decreases mid-street). */
  minRaise: number;
  /** Player to act, or null while the engine waits for an auto step. */
  actor: string | null;
  /** Pot: sum of every seat's handBet. */
  total: number;
}

/** What happened in the hand that just ended (drives the result screen). */
export interface HandSummary {
  handNumber: number;
  pot: number;
  endedBy: 'fold' | 'showdown';
  street: PokerStreet;
  winners: { playerId: string; amount: number }[];
  /** Shows everyone's hole cards at a showdown; null when the hand ended by fold (muck). */
  revealed: { playerId: string; cards: PokerCard[] }[] | null;
  /** Each player's chip total after the hand (table order). */
  stacks: { playerId: string; chips: number }[];
}

export interface PokerGameState {
  settings: PokerSettings;
  players: PokerPlayer[];
  /** Index into `players`; rotates to the next player with chips before each hand. */
  button: number;
  rng: number;
  status: PokerStatus;
  hand: PokerHand | null;
  handNumber: number;
  lastHand: HandSummary | null;
  winnerId: string | null;
}

/**
 * Action vocabulary. `bet` is "raise to `to` this street" (the hub's money-free
 * bet channel, which the client's raise buttons target). `rebuy` is allowed
 * only between hands and gives a player fresh chips (the room charges the
 * wallet in Phase 3 wiring).
 */
export type PokerAction =
  | { type: 'fold'; playerId: string }
  | { type: 'check'; playerId: string }
  | { type: 'call'; playerId: string }
  | { type: 'bet'; playerId: string; to: number }
  | { type: 'allIn'; playerId: string }
  | { type: 'advanceStreet' }
  | { type: 'runout' }
  | { type: 'showdown' }
  | { type: 'nextHand' }
  | { type: 'rebuy'; playerId: string; amount: number };

export type PokerActionResult = EngineResult<PokerGameState>;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createPokerGame(
  players: readonly { id: string; name: string }[],
  seed: number,
  settings: PokerSettings,
): PokerActionResult {
  if (players.length < POKER_MIN_PLAYERS || players.length > POKER_MAX_PLAYERS) {
    return { ok: false, error: 'INVALID_PLAYER_COUNT' };
  }

  // The first button is random; later ones rotate.
  const pick = randomInt(seed, players.length);
  const state: PokerGameState = {
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name, stack: settings.entry })),
    button: pick.value,
    rng: pick.state,
    status: 'hand',
    hand: null,
    handNumber: 0,
    lastHand: null,
    winnerId: null,
  };

  const started = startHand(state);
  if (!started) return { ok: false, error: 'INVALID_PLAYER_COUNT' };
  return { ok: true, state: { ...state, button: started.button, hand: started.hand, rng: started.rng, handNumber: 1 } };
}

// ---------------------------------------------------------------------------
// Hand lifecycle
// ---------------------------------------------------------------------------

/** Rotates the button to the next player with chips, deals, posts blinds, resolves. */
function startHand(state: PokerGameState): { hand: PokerHand; rng: number; button: number } | null {
  const n = state.players.length;
  let b = state.button;
  for (let i = 0; i < n; i++) {
    b = (b + 1) % n;
    if (state.players[b]!.stack > 0) break;
  }
  const order = state.players.filter((p) => p.stack > 0).map((p) => p.id);
  if (order.length < 2) return null;

  const buttonId = state.players[b]!.id;
  const shuffled = shuffle(createPokerDeck(), state.rng);
  const deck = shuffled.items;
  const seats: Record<string, HandSeat> = Object.fromEntries(
    order.map((id) => [
      id,
      { stack: state.players.find((p) => p.id === id)!.stack, streetBet: 0, handBet: 0, folded: false, allIn: false, acted: false },
    ]),
  );

  const hole: Record<string, PokerCard[]> = {};
  let deckPos = 0;
  for (const id of order) {
    hole[id] = [deck[deckPos]!, deck[deckPos + 1]!];
    deckPos += 2;
  }

  const hand: PokerHand = {
    street: 'preflop',
    phase: 'dealing',
    pending: null,
    seats,
    order,
    buttonId,
    sbId: '',
    bbId: '',
    hole,
    community: [],
    deck,
    deckPos,
    currentBet: 0,
    minRaise: bigBlind(state.settings.minBuyIn),
    actor: null,
    total: 0,
  };

  const btnIdx = order.indexOf(buttonId);
  if (order.length === 2) {
    // Heads-up: the button posts the small blind, the other seat the big blind.
    hand.sbId = order[btnIdx]!;
    hand.bbId = order[(btnIdx + 1) % 2]!;
  } else {
    hand.sbId = order[(btnIdx + 1) % order.length]!;
    hand.bbId = order[(btnIdx + 2) % order.length]!;
  }

  postBlind(hand, hand.sbId, smallBlind(state.settings.minBuyIn));
  postBlind(hand, hand.bbId, bigBlind(state.settings.minBuyIn));
  hand.currentBet = bigBlind(state.settings.minBuyIn);

  applyResolution(hand, resolveBetting(hand));
  return { hand, rng: shuffled.state, button: b };
}

function postBlind(hand: PokerHand, playerId: string, blind: number): void {
  const seat = hand.seats[playerId]!;
  const paid = Math.min(blind, seat.stack);
  seat.stack -= paid;
  seat.streetBet += paid;
  seat.handBet += paid;
  hand.total += paid;
  if (seat.stack === 0) seat.allIn = true;
}

/** Players still in the hand (never folded). */
function activesOf(hand: PokerHand): string[] {
  return hand.order.filter((id) => !hand.seats[id]!.folded);
}

function nextActor(hand: PokerHand, fromIndex: number): string | null {
  const len = hand.order.length;
  for (let i = 0; i < len; i++) {
    const id = hand.order[(fromIndex + i) % len]!;
    const s = hand.seats[id]!;
    if (!s.folded && !s.allIn && !(s.acted && s.streetBet === hand.currentBet)) return id;
  }
  return null;
}

type BettingResolution =
  | { kind: 'acting'; actor: string }
  | { kind: 'dealing'; pending: PokerPending }
  | { kind: 'foldEnd' };

/**
 * Decides what happens next after a bet/street change: another player acts,
 * the board advances, everyone all-in runs out the board, or the hand ends by
 * fold. Action always proceeds from the left of the big blind (preflop) or the
 * left of the button (postflop); the `acted`/matched flags make the walk wrap
 * correctly around raises.
 */
function resolveBetting(hand: PokerHand): BettingResolution {
  const active = activesOf(hand);
  if (active.length <= 1) return { kind: 'foldEnd' };

  const pivot = hand.street === 'preflop' ? hand.bbId : hand.buttonId;
  const from = hand.order.indexOf(pivot) + 1;
  const actor = nextActor(hand, from);
  if (actor) return { kind: 'acting', actor };
  if (active.every((id) => hand.seats[id]!.allIn)) return { kind: 'dealing', pending: 'runout' };
  return { kind: 'dealing', pending: hand.street === 'river' ? 'showdown' : 'advance' };
}

/** Writes the resolution into the hand (mutates a working copy). */
function applyResolution(hand: PokerHand, resolution: BettingResolution): void {
  if (resolution.kind === 'acting') {
    hand.phase = 'betting';
    hand.actor = resolution.actor;
    return;
  }
  if (resolution.kind === 'dealing') {
    hand.phase = 'dealing';
    hand.pending = resolution.pending;
    hand.actor = null;
    return;
  }
  // foldEnd is turned into a settlement by `afterPlayerAction`; callers that
  // reach this path with no live players simply park the hand.
  hand.phase = 'done';
  hand.actor = null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function applyPokerAction(state: PokerGameState, action: PokerAction): PokerActionResult {
  switch (action.type) {
    case 'fold':
      return doFold(state, action.playerId);
    case 'check':
      return doCheck(state, action.playerId);
    case 'call':
      return doCall(state, action.playerId);
    case 'bet':
      return doBet(state, action.playerId, action.to);
    case 'allIn':
      return doAllIn(state, action.playerId);
    case 'advanceStreet':
      return doAdvanceStreet(state);
    case 'runout':
      return doRunout(state);
    case 'showdown':
      return doShowdown(state);
    case 'nextHand':
      return doNextHand(state);
    case 'rebuy':
      return doRebuy(state, action.playerId, action.amount);
  }
}

type Guarded = { ok: true; hand: PokerHand } | { ok: false; error: EngineError };

function bettingGuards(state: PokerGameState): Guarded {
  if (!state.hand || state.status !== 'hand') return { ok: false, error: 'WRONG_PHASE' };
  if (state.hand.phase !== 'betting') return { ok: false, error: 'WRONG_PHASE' };
  return { ok: true, hand: state.hand };
}

function playerGuards(hand: PokerHand, playerId: string): Guarded {
  if (!hand.seats[playerId]) return { ok: false, error: 'UNKNOWN_PLAYER' };
  return { ok: true, hand };
}

function turnGuards(hand: PokerHand, playerId: string): Guarded {
  if (hand.actor !== playerId) return { ok: false, error: 'NOT_YOUR_TURN' };
  return { ok: true, hand };
}

/** Phase + membership + turn, in that order (so unknown ids read correctly). */
function actionGuards(state: PokerGameState, playerId: string): Guarded {
  const g = bettingGuards(state);
  if (!g.ok) return g;
  const p = playerGuards(g.hand, playerId);
  if (!p.ok) return p;
  return turnGuards(g.hand, playerId);
}

/** Deep-enough copy of a hand so engines never mutate state they received. */
function cloneHand(hand: PokerHand): PokerHand {
  const seats: Record<string, HandSeat> = {};
  for (const [id, s] of Object.entries(hand.seats)) seats[id] = { ...s };
  const hole: Record<string, PokerCard[]> = {};
  for (const [id, cards] of Object.entries(hand.hole)) hole[id] = [...cards];
  return { ...hand, seats, hole, community: [...hand.community], deck: [...hand.deck] };
}

/** Applies the betting resolution to the working hand and builds the new state. */
function afterPlayerAction(state: PokerGameState, hand: PokerHand): PokerActionResult {
  const resolution = resolveBetting(hand);
  if (resolution.kind === 'foldEnd') return { ok: true, state: endHand(state, hand, 'fold') };
  applyResolution(hand, resolution);
  return { ok: true, state: { ...state, hand } };
}

function doFold(state: PokerGameState, playerId: string): PokerActionResult {
  const g = actionGuards(state, playerId);
  if (!g.ok) return g;
  const hand = cloneHand(g.hand);
  const seat = hand.seats[playerId]!;
  if (seat.folded || seat.allIn) return { ok: false, error: 'INVALID_ACTION' };
  seat.folded = true;
  seat.acted = true;
  return afterPlayerAction(state, hand);
}

function doCheck(state: PokerGameState, playerId: string): PokerActionResult {
  const g = actionGuards(state, playerId);
  if (!g.ok) return g;
  const hand = cloneHand(g.hand);
  const seat = hand.seats[playerId]!;
  if (seat.folded || seat.allIn) return { ok: false, error: 'INVALID_ACTION' };
  if (hand.currentBet !== seat.streetBet) return { ok: false, error: 'ILLEGAL_BET' };
  seat.acted = true;
  return afterPlayerAction(state, hand);
}

function doCall(state: PokerGameState, playerId: string): PokerActionResult {
  const g = actionGuards(state, playerId);
  if (!g.ok) return g;
  const hand = cloneHand(g.hand);
  const seat = hand.seats[playerId]!;
  if (seat.folded || seat.allIn) return { ok: false, error: 'INVALID_ACTION' };
  const toPay = hand.currentBet - seat.streetBet;
  if (toPay <= 0) return { ok: false, error: 'ILLEGAL_BET' };
  if (toPay > seat.stack) return { ok: false, error: 'NOT_ENOUGH_CHIPS' };
  seat.stack -= toPay;
  seat.streetBet += toPay;
  seat.handBet += toPay;
  hand.total += toPay;
  seat.acted = true;
  if (seat.stack === 0) seat.allIn = true;
  return afterPlayerAction(state, hand);
}

/**
 * Commits `to` chips this street (raise-to). Returns ILLEGAL_RAISE when a
 * non-all-in raise undershoots the minimum increment. Special cases, per
 * standard no-limit "all-in" rules simplified for a friendly table:
 *  - `currentBet` never decreases (a short all-in raise leaves it as-is only
 *    when it is below the minimum raise; the currentBet is always raised to
 *    `to` otherwise),
 *  - a short all-in raise does not re-open action for players who already
 *    acted (documented simplification).
 */
function commitBet(hand: PokerHand, playerId: string, to: number): { ok: true } | { ok: false; error: EngineError } {
  const seat = hand.seats[playerId]!;
  const amount = to - seat.streetBet;
  if (amount <= 0) return { ok: false, error: 'ILLEGAL_BET' };
  const prevCurrent = hand.currentBet;
  const isRaise = to > prevCurrent;
  const isShortAllIn = isRaise && amount === seat.stack && to - prevCurrent < hand.minRaise;
  if (isRaise && !isShortAllIn && to - prevCurrent < hand.minRaise) return { ok: false, error: 'ILLEGAL_RAISE' };

  seat.stack -= amount;
  seat.streetBet = to;
  seat.handBet += amount;
  hand.total += amount;
  if (isRaise) {
    hand.currentBet = to;
    if (!isShortAllIn) {
      hand.minRaise = Math.max(1, to - prevCurrent);
      for (const oid of hand.order) if (oid !== playerId) hand.seats[oid]!.acted = false;
    }
  }
  seat.acted = true;
  if (seat.stack === 0) seat.allIn = true;
  return { ok: true };
}

function doBet(state: PokerGameState, playerId: string, to: number): PokerActionResult {
  const g = actionGuards(state, playerId);
  if (!g.ok) return g;
  if (typeof to !== 'number' || !Number.isInteger(to) || to < 0) return { ok: false, error: 'INVALID_ACTION' };
  const hand = cloneHand(g.hand);
  const seat = hand.seats[playerId]!;
  if (seat.folded || seat.allIn) return { ok: false, error: 'INVALID_ACTION' };
  if (to <= hand.currentBet) return { ok: false, error: 'ILLEGAL_BET' };
  if (to - seat.streetBet > seat.stack) return { ok: false, error: 'NOT_ENOUGH_CHIPS' };
  const committed = commitBet(hand, playerId, to);
  return committed.ok ? afterPlayerAction(state, hand) : committed;
}

function doAllIn(state: PokerGameState, playerId: string): PokerActionResult {
  const g = actionGuards(state, playerId);
  if (!g.ok) return g;
  const hand = cloneHand(g.hand);
  const seat = hand.seats[playerId]!;
  if (seat.folded) return { ok: false, error: 'INVALID_ACTION' };
  if (seat.stack === 0) return { ok: false, error: 'INVALID_ACTION' };
  const committed = commitBet(hand, playerId, seat.streetBet + seat.stack);
  return committed.ok ? afterPlayerAction(state, hand) : committed;
}

function doAdvanceStreet(state: PokerGameState): PokerActionResult {
  if (!state.hand || state.hand.phase !== 'dealing' || state.hand.pending !== 'advance') {
    return { ok: false, error: 'WRONG_PHASE' };
  }
  const hand = cloneHand(state.hand);
  const count = hand.street === 'preflop' ? 3 : 1;
  hand.community.push(...hand.deck.slice(hand.deckPos, hand.deckPos + count));
  hand.deckPos += count;
  hand.street = hand.street === 'preflop' ? 'flop' : hand.street === 'flop' ? 'turn' : 'river';
  for (const id of hand.order) {
    const s = hand.seats[id]!;
    s.streetBet = 0;
    s.acted = false;
  }
  hand.currentBet = 0;
  hand.minRaise = bigBlind(state.settings.minBuyIn);
  applyResolution(hand, resolveBetting(hand));
  return { ok: true, state: { ...state, hand } };
}

function doRunout(state: PokerGameState): PokerActionResult {
  if (!state.hand || state.hand.phase !== 'dealing' || state.hand.pending !== 'runout') {
    return { ok: false, error: 'WRONG_PHASE' };
  }
  const hand = cloneHand(state.hand);
  while (hand.community.length < 5) {
    hand.community.push(hand.deck[hand.deckPos]!);
    hand.deckPos++;
  }
  return { ok: true, state: endHand(state, hand, 'showdown') };
}

function doShowdown(state: PokerGameState): PokerActionResult {
  if (!state.hand || state.hand.phase !== 'dealing' || state.hand.pending !== 'showdown') {
    return { ok: false, error: 'WRONG_PHASE' };
  }
  return { ok: true, state: endHand(state, cloneHand(state.hand), 'showdown') };
}

function doNextHand(state: PokerGameState): PokerActionResult {
  if (!state.hand || state.hand.phase !== 'done') return { ok: false, error: 'WRONG_PHASE' };
  const withChips = state.players.filter((p) => p.stack > 0);
  if (withChips.length < 2) {
    return {
      ok: true,
      state: { ...state, status: 'finished', winnerId: withChips.length === 1 ? withChips[0]!.id : null },
    };
  }
  const started = startHand(state);
  if (!started) return { ok: true, state: { ...state, status: 'finished', winnerId: null } };
  return {
    ok: true,
    state: { ...state, button: started.button, hand: started.hand, rng: started.rng, handNumber: state.handNumber + 1 },
  };
}

function doRebuy(state: PokerGameState, playerId: string, amount: number): PokerActionResult {
  if (!state.hand || state.status !== 'hand') return { ok: false, error: 'WRONG_PHASE' };
  if (state.hand.phase !== 'done') return { ok: false, error: 'WRONG_PHASE' };
  if (!state.players.some((p) => p.id === playerId)) return { ok: false, error: 'UNKNOWN_PLAYER' };
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'INVALID_ACTION' };
  return {
    ok: true,
    state: {
      ...state,
      players: state.players.map((p) => (p.id === playerId ? { ...p, stack: p.stack + amount } : p)),
    },
  };
}

// ---------------------------------------------------------------------------
// Settlement of a hand (awards + side pots)
// ---------------------------------------------------------------------------

/** Position used to hand the odd chip to the winner closest to the dealer's left. */
function tieOrder(hand: PokerHand, playerId: string): number {
  const idx = hand.order.indexOf(playerId);
  const btn = hand.order.indexOf(hand.buttonId);
  return (idx - btn - 1 + hand.order.length) % hand.order.length;
}

function bestAmong(ids: string[], hands: Map<string, BestHand>): string[] {
  let best: HandValue | null = null;
  let winners: string[] = [];
  for (const id of ids) {
    const value = hands.get(id)!.value;
    const cmp = best ? compareHandValues(value, best) : 1;
    if (cmp > 0) {
      best = value;
      winners = [id];
    } else if (cmp === 0) {
      winners.push(id);
    }
  }
  return winners;
}

/**
 * Splits the pot into side pots (one per distinct active contribution level),
 * awards each to the best active hand among its contributors, and hands any
 * rounding remainder one chip at a time to the winner closest to the left of
 * the button. The sum of all awards always equals `hand.total`.
 */
function computeAwards(hand: PokerHand): { seat: string; amount: number }[] {
  const active = activesOf(hand);
  if (active.length === 1) return [{ seat: active[0]!, amount: hand.total }];

  const hands = new Map<string, BestHand>(
    active.map((id) => [id, bestHand([...hand.hole[id]!, ...hand.community])!]),
  );
  const levels = [...new Set(active.map((id) => hand.seats[id]!.handBet))].sort((a, b) => a - b);
  const winnings = new Map<string, number>();
  let prev = 0;

  for (const level of levels) {
    let amount = 0;
    for (const id of hand.order) {
      const bet = hand.seats[id]!.handBet;
      amount += Math.max(0, Math.min(bet, level) - prev);
    }
    const eligible = active.filter((id) => hand.seats[id]!.handBet >= level);
    const winners = bestAmong(eligible, hands);
    const share = Math.floor(amount / winners.length);
    const remainder = amount - share * winners.length;
    [...winners]
      .sort((a, b) => tieOrder(hand, a) - tieOrder(hand, b))
      .forEach((id, i) => {
        winnings.set(id, (winnings.get(id) ?? 0) + share + (i < remainder ? 1 : 0));
      });
    prev = level;
  }

  return [...winnings.entries()].map(([seat, amount]) => ({ seat, amount }));
}

function endHand(state: PokerGameState, hand: PokerHand, endedBy: HandSummary['endedBy']): PokerGameState {
  const awards = computeAwards(hand);
  const winMap = new Map(awards.map((a) => [a.seat, a.amount]));
  const players = state.players.map((p) => {
    const seat = hand.seats[p.id];
    if (!seat) return p;
    return { ...p, stack: seat.stack + (winMap.get(p.id) ?? 0) };
  });

  const summary: HandSummary = {
    handNumber: state.handNumber,
    pot: hand.total,
    endedBy,
    street: hand.street,
    winners: awards.filter((a) => a.amount > 0).map((a) => ({ playerId: a.seat, amount: a.amount })),
    revealed: endedBy === 'showdown' ? activesOf(hand).map((id) => ({ playerId: id, cards: [...hand.hole[id]!] })) : null,
    stacks: players.map((p) => ({ playerId: p.id, chips: p.stack })),
  };

  return { ...state, players, lastHand: summary, hand: { ...hand, phase: 'done', actor: null } };
}

/** Chip total before this hand started (used by conservation checks in tests). */
export function chipTotal(state: PokerGameState): number {
  return state.players.reduce((sum, p) => sum + p.stack, 0);
}