import { describe, expect, it } from 'vitest';
import {
  type CardDirection,
  applyRoundTiePenalty,
  forbiddenDealerBet,
  isLegalBet,
  livesFor,
  maxCardsPerPlayer,
  nextAliveAfter,
  nextCardCount,
  scoreRound,
  DEFAULT_SETTINGS,
} from '../src/index.js';

describe('lives word', () => {
  it('DANE-SE gives 6 lives', () => {
    expect(DEFAULT_SETTINGS.word).toBe('DANE-SE');
    expect(livesFor(DEFAULT_SETTINGS)).toBe(6);
  });
});

describe('Pé bet restriction', () => {
  it('forbids the bet that makes the sum equal N', () => {
    expect(forbiddenDealerBet(3, 1)).toBe(2);
    expect(isLegalBet(2, 3, true, 1)).toBe(false);
    expect(isLegalBet(1, 3, true, 1)).toBe(true);
    expect(isLegalBet(3, 3, true, 1)).toBe(true);
  });

  it('only applies to the Pé', () => {
    expect(isLegalBet(2, 3, false, 1)).toBe(true);
  });

  it('has no forbidden bet when the others already bet more than N', () => {
    expect(forbiddenDealerBet(2, 3)).toBeNull();
    expect([0, 1, 2].every((b) => isLegalBet(b, 2, true, 3))).toBe(true);
  });

  it('forbids 0 when the others already sum to N', () => {
    expect(forbiddenDealerBet(4, 4)).toBe(0);
  });

  it('forbids N when everyone else bet 0', () => {
    expect(forbiddenDealerBet(1, 0)).toBe(1);
  });

  it('rejects out-of-range and non-integer bets', () => {
    expect(isLegalBet(-1, 3, false, 0)).toBe(false);
    expect(isLegalBet(4, 3, false, 0)).toBe(false);
    expect(isLegalBet(1.5, 3, false, 0)).toBe(false);
  });
});

describe('cards per round', () => {
  function sequence(steps: number, max: number, mode: 'upDown' | 'restart' = 'upDown'): number[] {
    let cards = 1;
    let direction: CardDirection = 'up';
    const seq = [cards];
    for (let i = 0; i < steps; i++) {
      ({ cards, direction } = nextCardCount(cards, direction, max, mode));
      seq.push(cards);
    }
    return seq;
  }

  it('goes up and down, playing each end once', () => {
    expect(sequence(14, 6)).toEqual([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5]);
  });

  it('restart mode goes back to 1', () => {
    expect(sequence(8, 6, 'restart')).toEqual([1, 2, 3, 4, 5, 6, 1, 2, 3]);
  });

  it('6 cards always fit for up to 6 players', () => {
    for (let n = 2; n <= 6; n++) expect(maxCardsPerPlayer(n, 6)).toBe(6);
  });

  it('caps at floor(39 / players) when 6 does not fit', () => {
    expect(maxCardsPerPlayer(8, 6)).toBe(4); // floor(39/8)
    expect(maxCardsPerPlayer(7, 6)).toBe(5); // floor(39/7)
    expect(maxCardsPerPlayer(5, 6, 20)).toBe(3); // floor(19/5), small deck
    expect(sequence(6, maxCardsPerPlayer(8, 6))).toEqual([1, 2, 3, 4, 3, 2, 1]);
  });

  it('clamps when the cap drops mid-sequence', () => {
    expect(nextCardCount(5, 'up', 4, 'upDown')).toEqual({ cards: 3, direction: 'down' });
  });

  it('stays at 1 when the max is 1', () => {
    expect(nextCardCount(1, 'up', 1, 'upDown')).toEqual({ cards: 1, direction: 'up' });
  });
});

describe('whole-round tie penalty', () => {
  it('gives the Pé a letter when every trick tied', () => {
    const { recipients, penaltyApplied } = applyRoundTiePenalty(new Set(['a']), 'pe', true);
    expect([...recipients].sort()).toEqual(['a', 'pe']);
    expect(penaltyApplied).toBe(true);
  });

  it('does not double-penalize a Pé who already missed', () => {
    const { recipients, penaltyApplied } = applyRoundTiePenalty(new Set(['pe']), 'pe', true);
    expect([...recipients]).toEqual(['pe']);
    expect(penaltyApplied).toBe(false);
  });

  it('does nothing if some trick had a winner', () => {
    expect(applyRoundTiePenalty(new Set(), 'pe', false).penaltyApplied).toBe(false);
  });
});

describe('scoreRound', () => {
  const players = [
    { id: 'a', letters: 0 },
    { id: 'b', letters: 2 },
    { id: 'pe', letters: 0 },
  ];

  it('gives a letter for missing over or under, none for hitting', () => {
    const score = scoreRound({
      players,
      bets: { a: 1, b: 0, pe: 1 },
      tricksWon: { a: 2, b: 0, pe: 0 },
      dealerId: 'pe',
      allTricksTied: false,
      lives: 6,
    });
    expect(score.results.map((r) => [r.playerId, r.gainedLetter, r.lettersAfter])).toEqual([
      ['a', true, 1],
      ['b', false, 2],
      ['pe', true, 1],
    ]);
    expect(score.dealerTiePenalty).toBe(false);
  });

  it('all tricks tied: Pé who hit 0 still gets exactly one letter, others scored normally', () => {
    const score = scoreRound({
      players,
      bets: { a: 1, b: 0, pe: 0 },
      tricksWon: { a: 0, b: 0, pe: 0 },
      dealerId: 'pe',
      allTricksTied: true,
      lives: 6,
    });
    const byId = Object.fromEntries(score.results.map((r) => [r.playerId, r]));
    expect(byId.pe!.hitBet).toBe(true);
    expect(byId.pe!.lettersAfter).toBe(1);
    expect(byId.a!.lettersAfter).toBe(1);
    expect(byId.b!.lettersAfter).toBe(2);
    expect(score.dealerTiePenalty).toBe(true);
  });

  it('all tricks tied and Pé missed: only one letter', () => {
    const score = scoreRound({
      players,
      bets: { a: 0, b: 0, pe: 1 },
      tricksWon: { a: 0, b: 0, pe: 0 },
      dealerId: 'pe',
      allTricksTied: true,
      lives: 6,
    });
    expect(score.results.find((r) => r.playerId === 'pe')!.lettersAfter).toBe(1);
    expect(score.dealerTiePenalty).toBe(false);
  });

  it('eliminates a player on the last letter', () => {
    const score = scoreRound({
      players: [
        { id: 'a', letters: 5 },
        { id: 'b', letters: 5 },
        { id: 'pe', letters: 0 },
      ],
      bets: { a: 1, b: 0, pe: 1 },
      tricksWon: { a: 0, b: 1, pe: 0 },
      dealerId: 'pe',
      allTricksTied: false,
      lives: 6,
    });
    expect(score.eliminatedIds.sort()).toEqual(['a', 'b']);
    expect(score.voided).toBe(false);
  });

  it('voids the round when everyone would be eliminated', () => {
    const score = scoreRound({
      players: [
        { id: 'a', letters: 5 },
        { id: 'pe', letters: 5 },
      ],
      bets: { a: 1, pe: 1 },
      tricksWon: { a: 0, pe: 0 },
      dealerId: 'pe',
      allTricksTied: true,
      lives: 6,
    });
    expect(score.voided).toBe(true);
    expect(score.eliminatedIds).toEqual([]);
    expect(score.results.every((r) => r.lettersAfter === 5 && !r.gainedLetter)).toBe(true);
    expect(score.dealerTiePenalty).toBe(false);
  });

  it('does not void when at least one player survives', () => {
    const score = scoreRound({
      players: [
        { id: 'a', letters: 5 },
        { id: 'pe', letters: 5 },
      ],
      bets: { a: 1, pe: 0 },
      tricksWon: { a: 0, pe: 0 },
      dealerId: 'pe',
      allTricksTied: false,
      lives: 6,
    });
    expect(score.voided).toBe(false);
    expect(score.eliminatedIds).toEqual(['a']);
  });
});

describe('nextAliveAfter', () => {
  const seats = ['a', 'b', 'c', 'd'];
  it('moves to the right and skips eliminated players', () => {
    expect(nextAliveAfter(seats, () => true, 'a')).toBe('b');
    expect(nextAliveAfter(seats, () => true, 'd')).toBe('a');
    expect(nextAliveAfter(seats, (id) => id !== 'b' && id !== 'c', 'a')).toBe('d');
  });
  it('works when the starting player is eliminated', () => {
    expect(nextAliveAfter(seats, (id) => id !== 'b', 'b')).toBe('c');
  });
});
