import { describe, expect, it } from 'vitest';
import {
  type Entry,
  type HandSeat,
  type PokerAction,
  type PokerCard,
  type PokerGameState,
  type PokerHand,
  DEFAULT_POKER_SETTINGS,
  POKER_MIN_BUY_IN,
  applyPokerAction as applyAction,
  assertConservation,
  bigBlind,
  createPokerGame,
  getPokerView,
  parsePokerCardId,
  pokerModule,
  smallBlind,
} from '../../src/index.js';

const SETTINGS = DEFAULT_POKER_SETTINGS;

function pc(id: string): PokerCard {
  const card = parsePokerCardId(id);
  if (!card) throw new Error(`Bad poker card id ${id}`);
  return card;
}

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
}

function must(state: PokerGameState, action: PokerAction): PokerGameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${action.type} failed: ${result.error}`);
  return result.state;
}

function start(n: number, seed = 1): PokerGameState {
  const result = createPokerGame(players(n), seed, SETTINGS);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Runs a whole game with the bot for every actor and the engine's auto steps. */
function playOut(state: PokerGameState, rng: number, guard = 300_000): { state: PokerGameState; rng: number } {
  for (let i = 0; i < guard; i++) {
    if (pokerModule.isFinished(state)) return { state, rng };
    const auto = pokerModule.auto(state);
    if (auto) {
      state = must(state, auto.action);
      continue;
    }
    const actor = pokerModule.actorId(state);
    if (!actor) throw new Error(`stuck: no actor and no auto at hand ${state.handNumber}`);
    const step = pokerModule.botAction(state, actor, rng);
    if (!step) throw new Error(`bot produced no action for ${actor}`);
    rng = step.rng;
    state = must(state, step.action);
  }
  throw new Error('game did not terminate within the guard');
}

function entriesOf(n: number): Entry[] {
  return players(n).map((p) => ({ playerId: p.id, amount: SETTINGS.entry }));
}

// ---------------------------------------------------------------------------
// Setup and blinds
// ---------------------------------------------------------------------------

describe('poker setup', () => {
  it('rejects fewer than 2 and more than 8 players', () => {
    expect(createPokerGame(players(1), 1, SETTINGS).ok).toBe(false);
    expect(createPokerGame(players(9), 1, SETTINGS).ok).toBe(false);
    expect(createPokerGame(players(2), 1, SETTINGS).ok).toBe(true);
    expect(createPokerGame(players(8), 1, SETTINGS).ok).toBe(true);
  });

  it('starts everyone at the buy-in', () => {
    const state = start(4);
    expect(state.players.every((p) => p.stack === SETTINGS.entry)).toBe(true);
    expect(state.handNumber).toBe(1);
    expect(state.hand?.hole).toBeDefined();
  });

  it('derives blinds from minBuyIn (1000 -> 10/20)', () => {
    expect(POKER_MIN_BUY_IN).toBe(1000);
    expect(smallBlind(1000)).toBe(10);
    expect(bigBlind(1000)).toBe(20);
  });

  it('posts the blinds and starts the action correctly heads-up', () => {
    const state = start(2);
    const hand = state.hand!;
    expect(hand.sbId).toBe(hand.buttonId); // heads-up: the button posts the small blind
    expect(hand.seats[hand.sbId]!.streetBet).toBe(10);
    expect(hand.seats[hand.bbId]!.streetBet).toBe(20);
    expect(hand.currentBet).toBe(20);
    expect(hand.actor).toBe(hand.sbId); // the button acts first preflop
  });

  it('starts the action left of the big blind with three players', () => {
    const state = start(3);
    const hand = state.hand!;
    const bbIndex = hand.order.indexOf(hand.bbId);
    const expected = hand.order[(bbIndex + 1) % hand.order.length];
    expect(hand.actor).toBe(expected);
    expect(expected).not.toBe(hand.sbId);
    expect(expected).not.toBe(hand.bbId);
  });
});

// ---------------------------------------------------------------------------
// Betting legality
// ---------------------------------------------------------------------------

describe('poker betting', () => {
  it('rejects acting out of turn and double checks', () => {
    const state = start(3);
    const hand = state.hand!;
    const other = hand.order.find((id) => id !== hand.actor)!;
    expect(applyAction(state, { type: 'fold', playerId: other })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(applyAction(state, { type: 'fold', playerId: 'ghost' })).toEqual({ ok: false, error: 'UNKNOWN_PLAYER' });
  });

  it('forbids checking while facing a bet and calling when nothing is owed', () => {
    let state = start(2);
    const hand = state.hand!;
    expect(applyAction(state, { type: 'check', playerId: hand.actor! })).toEqual({ ok: false, error: 'ILLEGAL_BET' });

    // SB calls, BB checks -> flop, where checking is free but calling is not.
    state = must(state, { type: 'call', playerId: state.hand!.actor! });
    state = must(state, { type: 'check', playerId: state.hand!.actor! });
    state = must(state, pokerModule.auto(state)!.action);
    const flopActor = state.hand!.actor!;
    expect(state.hand!.street).toBe('flop');
    expect(applyAction(state, { type: 'call', playerId: flopActor })).toEqual({ ok: false, error: 'ILLEGAL_BET' });
    expect(applyAction(state, { type: 'check', playerId: flopActor }).ok).toBe(true);
  });

  it('enforces the minimum raise but allows a shorter all-in', () => {
    let state = start(2);
    const hand = state.hand!;
    const sb = hand.actor!;
    expect(applyAction(state, { type: 'bet', playerId: sb, to: 30 })).toEqual({ ok: false, error: 'ILLEGAL_RAISE' });
    expect(applyAction(state, { type: 'bet', playerId: sb, to: 40 }).ok).toBe(true);

    state = start(2);
    // A full shove is always legal.
    expect(applyAction(state, { type: 'allIn', playerId: state.hand!.actor! }).ok).toBe(true);
  });

  it('refuses to bet more chips than the player has', () => {
    const state = start(2);
    const hand = state.hand!;
    const actor = hand.actor!;
    expect(applyAction(state, { type: 'bet', playerId: actor, to: SETTINGS.entry + 1000 })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_CHIPS',
    });
    expect(applyAction(state, { type: 'call', playerId: actor }).ok).toBe(true);
  });

  it('ends the hand by fold and awards the pot to the last player', () => {
    let state = start(2);
    const hand = state.hand!;
    const actor = hand.actor!;
    const other = hand.order.find((id) => id !== actor)!;
    state = must(state, { type: 'fold', playerId: actor });
    expect(state.hand!.phase).toBe('done');
    expect(state.lastHand).toMatchObject({ endedBy: 'fold', revealed: null });
    expect(state.lastHand!.winners).toEqual([{ playerId: other, amount: hand.total }]);
    expect(state.players.find((p) => p.id === other)!.stack).toBe(SETTINGS.entry + hand.seats[actor]!.handBet);
  });
});

// ---------------------------------------------------------------------------
// Full games
// ---------------------------------------------------------------------------

describe('full bot games', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    it(`terminates with one winner and conserves chips (${n} players)`, () => {
      const created = createPokerGame(players(n), 1234567 + n, SETTINGS);
      if (!created.ok) throw new Error(created.error);
      const { state } = playOut(created.state, 42 + n);

      expect(state.status).toBe('finished');
      const survivors = state.players.filter((p) => p.stack > 0);
      expect(survivors).toHaveLength(1);
      expect(state.winnerId).toBe(survivors[0]!.id);

      const entries = entriesOf(n);
      const payouts = pokerModule.settle(state, entries);
      expect(() => assertConservation(entries, payouts)).not.toThrow();
      expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(n * SETTINGS.entry);
    });
  }

  it('is deterministic for a seed', () => {
    const a = playOut(start(4, 99), 7);
    const b = playOut(start(4, 99), 7);
    expect(a.state.winnerId).toBe(b.state.winnerId);
    expect(a.state.players.map((p) => p.stack)).toEqual(b.state.players.map((p) => p.stack));
    expect(a.rng).toBe(b.rng);
  });

  it('never lets a player leave with more chips than the table held', () => {
    const { state } = playOut(start(5, 5), 5);
    expect(state.players.reduce((sum, p) => sum + p.stack, 0)).toBe(5 * SETTINGS.entry);
  });
});

// ---------------------------------------------------------------------------
// Hidden information
// ---------------------------------------------------------------------------

describe('poker view', () => {
  it('only exposes the viewer hole cards and no deck', () => {
    const state = start(3, 3);
    const view = getPokerView(state, 'p0');
    const opponent = state.hand!.hole['p1']!;
    expect(view.hole).toEqual(state.hand!.hole['p0']);
    expect('deck' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(opponent));
    expect(view.seats.find((s) => s.id === 'p1')!.folded).toBe(false);
  });

  it('gives spectators an empty hand', () => {
    const view = getPokerView(start(3, 3), null);
    expect(view.hole).toEqual([]);
    expect(view.isSpectator).toBe(true);
  });

  it('offers only legal actions to the player on turn', () => {
    const state = start(2);
    const view = getPokerView(state, state.hand!.actor!);
    expect(view.legal.toCall).toBe(10);
    expect(view.legal.canCheck).toBe(false);
    expect(view.legal.canCall).toBe(true);
    expect(view.legal.canRaise).toBe(true);
    expect(view.legal.minRaiseTo).toBe(40); // big blind 20 + min raise 20
  });
});

// ---------------------------------------------------------------------------
// Side pots, showdown reveals and odd chips (rigged hands)
// ---------------------------------------------------------------------------

interface SeatSpec {
  id: string;
  front: number;
  commit: number;
  folded?: boolean;
  hole: string;
}

function scenario(seats: SeatSpec[], community: string, buttonId: string): PokerGameState {
  const order = seats.map((s) => s.id);
  const seatMap: Record<string, HandSeat> = {};
  const hole: Record<string, PokerCard[]> = {};
  let total = 0;
  for (const s of seats) {
    seatMap[s.id] = {
      stack: s.front,
      streetBet: s.commit,
      handBet: s.commit,
      folded: s.folded ?? false,
      allIn: (s.folded ?? false) === false && s.front === 0,
      acted: true,
    };
    hole[s.id] = s.hole.split(' ').map(pc);
    total += s.commit;
  }
  const hand: PokerHand = {
    street: 'river',
    phase: 'dealing',
    pending: 'runout',
    seats: seatMap,
    order,
    buttonId,
    sbId: order[0]!,
    bbId: order[1] ?? order[0]!,
    hole,
    community: community.split(' ').map(pc),
    deck: [],
    deckPos: 0,
    currentBet: 0,
    minRaise: 20,
    actor: null,
    total,
  };
  return {
    settings: SETTINGS,
    players: seats.map((s) => ({ id: s.id, name: s.id, stack: s.front })),
    button: 0,
    rng: 1,
    status: 'hand',
    hand,
    handNumber: 1,
    lastHand: null,
    winnerId: null,
  };
}

describe('side pots', () => {
  it('builds a main pot and a side pot and conserves chips', () => {
    // A is short all-in for 100 with the best hand; B (300) beats C (300).
    const state = scenario(
      [
        { id: 'A', front: 0, commit: 100, hole: 'AH AD' },
        { id: 'B', front: 0, commit: 300, hole: 'KH KD' },
        { id: 'C', front: 0, commit: 300, hole: 'QH QD' },
      ],
      '2C 3D 4H 5S 9C',
      'C',
    );
    const after = must(state, { type: 'runout' });
    const stacks = Object.fromEntries(after.players.map((p) => [p.id, p.stack]));
    expect(stacks).toEqual({ A: 300, B: 400, C: 0 });
    expect(after.lastHand!.pot).toBe(700);
    expect(after.lastHand!.endedBy).toBe('showdown');
    expect(after.players.reduce((sum, p) => sum + p.stack, 0)).toBe(700);
  });

  it('gives the odd chip to the winner nearest the dealer’s left', () => {
    // A and B tie with a wheel; C loses. 15 chips split 8/7 with A (closest to
    // the button, which sits at C) taking the extra chip.
    const state = scenario(
      [
        { id: 'A', front: 5, commit: 5, hole: 'AH KC' },
        { id: 'B', front: 5, commit: 5, hole: 'AD QS' },
        { id: 'C', front: 5, commit: 5, hole: 'KD TS' },
      ],
      '2C 3D 4H 5S 9C',
      'C',
    );
    const after = must(state, { type: 'runout' });
    const stacks = Object.fromEntries(after.players.map((p) => [p.id, p.stack]));
    expect(stacks).toEqual({ A: 13, B: 12, C: 5 });
    expect(after.lastHand!.revealed).toHaveLength(3);
  });

  it('does not reveal folded hands at a fold win', () => {
    const state = scenario(
      [
        { id: 'A', front: 100, commit: 50, hole: 'AH AD' },
        { id: 'B', front: 100, commit: 50, folded: true, hole: 'KH KD' },
      ],
      '2C 3D 4H 5S 9C',
      'A',
    );
    const after = must(state, { type: 'runout' });
    expect(after.lastHand!.revealed).toHaveLength(1);
    expect(after.lastHand!.revealed![0]!.playerId).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// Module surface
// ---------------------------------------------------------------------------

describe('poker module', () => {
  it('validates settings', () => {
    expect(pokerModule.validateSettings({ minBuyIn: 500 })).toBeNull();
    expect(pokerModule.validateSettings({ minBuyIn: 1000, entry: 500 })).toBeNull();
    const ok = pokerModule.validateSettings({ minBuyIn: 1000, maxBuyIn: 5000, entry: 2500 });
    expect(ok).toEqual({ minBuyIn: 1000, maxBuyIn: 5000, entry: 2500 });
    expect(pokerModule.entryFor(SETTINGS)).toBe(1000);
  });

  it('rejects the card-play channel', () => {
    const state = start(2);
    expect(pokerModule.playAction(state, 'p0', 'AS')).toEqual({ ok: false, error: 'INVALID_ACTION' });
    const built = pokerModule.betAction(state, 'p0', 40);
    expect(built).toEqual({ ok: true, action: { type: 'bet', playerId: 'p0', to: 40 } });
    expect(pokerModule.betAction(state, 'p0', 'x')).toEqual({ ok: false, error: 'INVALID_ACTION' });
  });

  it('allows a rebuy only between hands', () => {
    let state = start(2);
    const actor = state.hand!.actor!;
    state = must(state, { type: 'fold', playerId: actor });
    expect(state.hand!.phase).toBe('done');

    const target = state.players[0]!.id;
    const before = state.players.find((p) => p.id === target)!.stack;
    const after = must(state, { type: 'rebuy', playerId: target, amount: 1000 });
    expect(after.players.find((p) => p.id === target)!.stack).toBe(before + 1000);

    // Only between hands, only for a real player, only a positive integer.
    expect(applyAction(start(2), { type: 'rebuy', playerId: 'p0', amount: 1000 })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
    expect(applyAction(state, { type: 'rebuy', playerId: 'ghost', amount: 1000 })).toEqual({
      ok: false,
      error: 'UNKNOWN_PLAYER',
    });
    expect(applyAction(state, { type: 'rebuy', playerId: target, amount: 0 })).toEqual({
      ok: false,
      error: 'INVALID_ACTION',
    });
  });

  it('exposes the catalog-style module metadata', () => {
    expect(pokerModule.id).toBe('poker');
    expect(pokerModule.minPlayers).toBe(2);
    expect(pokerModule.maxPlayers).toBe(8);
    expect(pokerModule.minEntry).toBe(1000);
    expect(pokerModule.entryOptions).toContain(1000);
  });
});
