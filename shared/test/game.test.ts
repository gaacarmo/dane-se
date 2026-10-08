import { describe, expect, it } from 'vitest';
import {
  type GameState,
  applyAction,
  cardId,
  createGame,
  getPlayerView,
  legalBets,
  maxCardsPerPlayer,
  randomInt,
} from '../src/index.js';
import { act, autoPlayRound, betAll, newGame, playTrick, rig } from './helpers.js';

/** Returns [first player (right of Pé), ..., Pé]. */
const order = (s: GameState) => s.roundOrder;

function withCards(state: GameState, cardsPerPlayer: number): GameState {
  return { ...state, cardsPerPlayer };
}

function withLetters(state: GameState, letters: Record<string, number>): GameState {
  return { ...state, players: state.players.map((p) => ({ ...p, letters: letters[p.id] ?? p.letters })) };
}

describe('createGame', () => {
  it('rejects fewer than 2 or more than 6 players', () => {
    expect(createGame([{ id: 'a', name: 'A' }], 1).ok).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `${i}`, name: `${i}` }));
    expect(createGame(seven, 1).ok).toBe(false);
  });

  it('deals 1 card each in round 1, with a vira nobody holds', () => {
    const s = newGame(4, 9);
    expect(s.roundNumber).toBe(1);
    expect(s.cardsPerPlayer).toBe(1);
    const dealt = Object.values(s.hands).flat().map(cardId);
    expect(dealt).toHaveLength(4);
    expect(new Set(dealt).size).toBe(4);
    expect(dealt).not.toContain(cardId(s.vira));
  });

  it('orders the round from the right of the Pé, ending with the Pé', () => {
    const s = newGame(4, 3);
    const seats = s.players.map((p) => p.id);
    const dealerSeat = seats.indexOf(s.dealerId);
    expect(order(s)).toEqual([1, 2, 3, 4].map((i) => seats[(dealerSeat + i) % 4]));
    expect(order(s).at(-1)).toBe(s.dealerId);
    expect(s.turnPlayerId).toBe(order(s)[0]);
  });

  it('is deterministic for a seed', () => {
    expect(newGame(5, 77)).toEqual(newGame(5, 77));
  });
});

describe('betting', () => {
  it('enforces turn order', () => {
    const s = newGame(3);
    const result = applyAction(s, { type: 'bet', playerId: order(s)[1]!, bet: 0 });
    expect(result).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('rejects the forbidden Pé bet and offers only legal bets', () => {
    let s = newGame(3);
    const [a, b, pe] = order(s) as [string, string, string];
    s = act(s, { type: 'bet', playerId: a, bet: 0 });
    s = act(s, { type: 'bet', playerId: b, bet: 0 });
    expect(legalBets(s, pe)).toEqual([0]);
    expect(applyAction(s, { type: 'bet', playerId: pe, bet: 1 })).toEqual({ ok: false, error: 'ILLEGAL_BET' });
    expect(getPlayerView(s, pe).dealerForbiddenBet).toBe(1);
    s = act(s, { type: 'bet', playerId: pe, bet: 0 });
    expect(s.phase).toBe('playing');
    expect(s.turnPlayerId).toBe(a);
  });

  it('does not accept plays during betting', () => {
    const s = newGame(2);
    const id = s.turnPlayerId!;
    expect(applyAction(s, { type: 'play', playerId: id, cardId: cardId(s.hands[id]![0]!) })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
  });
});

describe('playing', () => {
  it('only accepts cards from the player hand', () => {
    let s = newGame(2);
    const [a, pe] = order(s) as [string, string];
    s = rig(s, { [a]: ['3D'], [pe]: ['KH'] }, '7C');
    s = betAll(s, { [a]: 1, [pe]: 1 });
    expect(applyAction(s, { type: 'play', playerId: a, cardId: 'KH' })).toEqual({
      ok: false,
      error: 'CARD_NOT_IN_HAND',
    });
  });

  it('plays a full blind round, scores it and rotates the Pé', () => {
    let s = newGame(3);
    const [a, b, pe] = order(s) as [string, string, string];
    s = rig(s, { [a]: ['3D'], [b]: ['7C'], [pe]: ['KH'] }, '4D');
    s = betAll(s, { [a]: 1, [b]: 0, [pe]: 1 });
    s = playTrick(s, { [a]: '3D', [b]: '7C', [pe]: 'KH' });

    expect(s.phase).toBe('trickEnd');
    expect(s.trick.result?.winnerId).toBe(a);

    s = act(s, { type: 'collectTrick' });
    expect(s.phase).toBe('roundSummary');
    const letters = Object.fromEntries(s.players.map((p) => [p.id, p.letters]));
    expect(letters).toEqual({ [a]: 0, [b]: 0, [pe]: 1 });
    expect(s.lastRound?.allTricksTied).toBe(false);

    s = act(s, { type: 'nextRound' });
    expect(s.roundNumber).toBe(2);
    expect(s.cardsPerPlayer).toBe(2);
    expect(s.dealerId).toBe(a); // the player to the right of the old Pé
    expect(order(s)).toEqual([b, pe, a]);
  });

  it('a fully tied trick is led again by the same player; the winner leads next', () => {
    let s = withCards(newGame(3), 2);
    const [a, b, pe] = order(s) as [string, string, string];
    s = rig(s, { [a]: ['KD', '3C'], [b]: ['KC', '6S'], [pe]: ['7H', '4S'] }, '7D'); // manilha Q
    s = betAll(s, { [a]: 1, [b]: 0, [pe]: 0 });

    // KD and KC cancel, 7H wins.
    s = act(playTrick(s, { [a]: 'KD', [b]: 'KC', [pe]: '7H' }), { type: 'collectTrick' });
    expect(s.trick.leaderId).toBe(pe);
    expect(s.turnPlayerId).toBe(pe);
    expect(s.tricksWon[pe]).toBe(1);

    // Two-player version where everything cancels.
    let t = withCards(newGame(2), 2);
    const [x, y] = order(t) as [string, string];
    t = rig(t, { [x]: ['KD', '3C'], [y]: ['KC', '4S'] }, '7D');
    t = betAll(t, { [x]: 1, [y]: 0 });
    t = act(playTrick(t, { [x]: 'KD', [y]: 'KC' }), { type: 'collectTrick' });
    expect(t.trick.leaderId).toBe(x);
    expect(t.tricksWon).toEqual({ [x]: 0, [y]: 0 });
  });

  it('whole-round tie gives the Pé exactly one letter', () => {
    let s = withCards(newGame(2), 2);
    const [a, pe] = order(s) as [string, string];
    s = rig(s, { [a]: ['KD', '7S'], [pe]: ['KC', '7H'] }, '3D'); // manilha 4
    s = betAll(s, { [a]: 0, [pe]: 0 });
    s = act(playTrick(s, { [a]: 'KD', [pe]: 'KC' }), { type: 'collectTrick' });
    s = act(playTrick(s, { [a]: '7S', [pe]: '7H' }), { type: 'collectTrick' });

    expect(s.lastRound?.allTricksTied).toBe(true);
    expect(s.lastRound?.dealerTiePenalty).toBe(true);
    const letters = Object.fromEntries(s.players.map((p) => [p.id, p.letters]));
    expect(letters).toEqual({ [a]: 0, [pe]: 1 });
  });

  it('whole-round tie with a Pé who also missed: still one letter', () => {
    let s = withCards(newGame(2), 2);
    const [a, pe] = order(s) as [string, string];
    s = rig(s, { [a]: ['KD', '7S'], [pe]: ['KC', '7H'] }, '3D');
    s = betAll(s, { [a]: 1, [pe]: 2 });
    s = act(playTrick(s, { [a]: 'KD', [pe]: 'KC' }), { type: 'collectTrick' });
    s = act(playTrick(s, { [a]: '7S', [pe]: '7H' }), { type: 'collectTrick' });
    const letters = Object.fromEntries(s.players.map((p) => [p.id, p.letters]));
    expect(letters).toEqual({ [a]: 1, [pe]: 1 });
    expect(s.lastRound?.dealerTiePenalty).toBe(false);
  });
});

describe('elimination and end of game', () => {
  it('eliminates on the 6th letter and declares the last player standing', () => {
    let s = newGame(2);
    const [a, pe] = order(s) as [string, string];
    s = withLetters(s, { [a]: 5 });
    s = rig(s, { [a]: ['3D'], [pe]: ['KH'] }, '4D');
    s = betAll(s, { [a]: 0, [pe]: 0 });
    s = act(playTrick(s, { [a]: '3D', [pe]: 'KH' }), { type: 'collectTrick' });

    expect(s.phase).toBe('gameOver');
    expect(s.players.find((p) => p.id === a)?.eliminated).toBe(true);
    expect(s.winnerId).toBe(pe);
    expect(applyAction(s, { type: 'nextRound' }).ok).toBe(false);
  });

  it('eliminated players are skipped for seating, dealing and the Pé', () => {
    let s = newGame(4);
    const [a, b, c, pe] = order(s) as [string, string, string, string];
    s = withLetters(s, { [a]: 5 });
    s = rig(s, { [a]: ['QD'], [b]: ['3C'], [c]: ['4S'], [pe]: ['5H'] }, 'KD'); // manilha A
    s = betAll(s, { [a]: 1, [b]: 1, [c]: 0, [pe]: 1 });
    s = act(playTrick(s, { [a]: 'QD', [b]: '3C', [c]: '4S', [pe]: '5H' }), { type: 'collectTrick' });

    expect(s.lastRound?.eliminatedIds).toEqual([a]);
    s = act(s, { type: 'nextRound' });
    // Next Pé would be `a`, who is out, so it goes to the next alive player.
    expect(s.dealerId).toBe(b);
    expect(order(s)).toEqual([c, pe, b]);
    expect(s.hands[a]).toBeUndefined();
  });

  it('if everyone would be eliminated, nobody is and the card count repeats', () => {
    let s = withCards(newGame(2), 2);
    const [a, pe] = order(s) as [string, string];
    s = withLetters(s, { [a]: 5, [pe]: 5 });
    s = rig(s, { [a]: ['4C', '5D'], [pe]: ['KH', '6S'] }, '7D');
    s = betAll(s, { [a]: 1, [pe]: 0 }); // pe wins both: both miss
    s = act(playTrick(s, { [a]: '4C', [pe]: 'KH' }), { type: 'collectTrick' });
    s = act(playTrick(s, { [a]: '5D', [pe]: '6S' }), { type: 'collectTrick' });

    expect(s.phase).toBe('roundSummary');
    expect(s.lastRound?.voided).toBe(true);
    expect(s.players.every((p) => p.letters === 5 && !p.eliminated)).toBe(true);

    s = act(s, { type: 'nextRound' });
    expect(s.cardsPerPlayer).toBe(2);
    expect(s.dealerId).toBe(a);
  });
});

describe('player views (hidden information)', () => {
  it('blind round: you see everyone else’s forehead card but not your own', () => {
    const s = newGame(4, 5);
    const me = s.players[0]!.id;
    const view = getPlayerView(s, me);
    expect(view.blindRound).toBe(true);
    expect(view.hand).toEqual([]);
    for (const p of view.players) {
      if (p.id === me) expect(p.foreheadCard).toBeNull();
      else expect(p.foreheadCard).toEqual(s.hands[p.id]![0]);
    }
    expect(JSON.stringify(view)).not.toContain(`"rank":"${s.hands[me]![0]!.rank}","suit":"${s.hands[me]![0]!.suit}"`);
  });

  it('normal round: you see only your own hand', () => {
    const s = act(autoPlayRound(newGame(4, 5)), { type: 'nextRound' });
    expect(s.cardsPerPlayer).toBe(2);
    const me = s.players[0]!.id;
    const view = getPlayerView(s, me);
    expect(view.hand).toEqual(s.hands[me]);
    expect(view.players.every((p) => p.foreheadCard === null)).toBe(true);

    const json = JSON.stringify(view);
    for (const p of s.players.filter((p) => p.id !== me)) {
      for (const card of s.hands[p.id]!) {
        expect(json).not.toContain(`{"rank":"${card.rank}","suit":"${card.suit}"}`);
      }
    }
  });

  it('spectators never receive hands', () => {
    let s = newGame(3, 2);
    s = { ...s, cardsPerPlayer: 2 };
    expect(getPlayerView(s, null).hand).toEqual([]);
    expect(getPlayerView(s, 'nobody').isSpectator).toBe(true);
  });
});

describe('random full games', () => {
  function playRandomGame(players: number, seed: number) {
    let rng = seed;
    const pick = <T>(items: readonly T[]): T => {
      const r = randomInt(rng, items.length);
      rng = r.state;
      return items[r.value]!;
    };

    const created = createGame(
      Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      seed,
    );
    if (!created.ok) throw new Error(created.error);
    let s = created.state;
    const counts: number[] = [];

    for (let steps = 0; steps < 100_000 && s.phase !== 'gameOver'; steps++) {
      if (s.phase === 'betting') {
        if (Object.keys(s.bets).length === 0) counts.push(s.cardsPerPlayer);
        const id = s.turnPlayerId!;
        s = act(s, { type: 'bet', playerId: id, bet: pick(legalBets(s, id)) });
        if (s.phase === 'playing') {
          const sum = Object.values(s.bets).reduce((x, y) => x + y, 0);
          expect(sum).not.toBe(s.cardsPerPlayer);
        }
      } else if (s.phase === 'playing') {
        const id = s.turnPlayerId!;
        s = act(s, { type: 'play', playerId: id, cardId: cardId(pick(s.hands[id]!)) });
      } else if (s.phase === 'trickEnd') {
        s = act(s, { type: 'collectTrick' });
      } else {
        s = act(s, { type: 'nextRound' });
      }
    }
    return { s, counts };
  }

  it.each([2, 3, 4, 5, 6])('%i players: games finish with exactly one winner', (players) => {
    for (let seed = 1; seed <= 40; seed++) {
      const { s, counts } = playRandomGame(players, seed);
      expect(s.phase).toBe('gameOver');
      expect(s.players.filter((p) => !p.eliminated)).toHaveLength(1);
      expect(s.winnerId).toBe(s.players.find((p) => !p.eliminated)!.id);
      expect(counts[0]).toBe(1);
      for (let i = 1; i < counts.length; i++) {
        expect(Math.abs(counts[i]! - counts[i - 1]!)).toBeLessThanOrEqual(1);
        expect(counts[i]).toBeLessThanOrEqual(maxCardsPerPlayer(players, 6));
      }
    }
  });
});
