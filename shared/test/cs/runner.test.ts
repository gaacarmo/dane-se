import { describe, expect, it } from 'vitest';
import { START_MONEY } from '../../src/cs/economy.js';
import { MAX_ROUNDS_WON, SWAP_EVERY, matchWinner, sideOf } from '../../src/cs/match.js';
import { createMatch, forfeit, stepMatch, type Match } from '../../src/cs/runner.js';
import type { TeamId } from '../../src/cs/types.js';

const human = (id: string) => ({ id, name: id });
const teamOf = (match: Match, team: TeamId) => match.roster.filter((r) => r.team === team);

const STEP_MS = 50;
const LIMIT_MS = 40 * 60_000;

/** Joga a partida inteira com humanos parados; confere as invariantes a cada troca de rodada. */
function playOut(match: Match): { match: Match; ms: number } {
  let current = match;
  let ms = 0;
  let lastRound = current.roundIndex;
  while (!current.winner && ms < LIMIT_MS) {
    current = stepMatch(current, {}, STEP_MS);
    ms += STEP_MS;
    expect(Math.max(current.score.A, current.score.B)).toBeLessThanOrEqual(MAX_ROUNDS_WON);
    if (current.roundIndex !== lastRound) {
      lastRound = current.roundIndex;
      for (const p of current.world.players) {
        expect(p.side).toBe(sideOf(p.team, current.roundIndex));
        expect(Number.isFinite(p.body.pos.x) && Number.isFinite(p.body.pos.z)).toBe(true);
        if (current.roundIndex % SWAP_EVERY === 0) {
          expect(p.money).toBe(START_MONEY);
          expect(p.weapon).toBe('chinelo');
        }
      }
    }
  }
  return { match: current, ms };
}

describe('createMatch', () => {
  it('fills a single human with bots up to 3 per team', () => {
    const match = createMatch([human('h1')], 1);
    expect(teamOf(match, 'A').map((r) => r.bot)).toEqual([false, true, true]);
    expect(teamOf(match, 'B').map((r) => r.bot)).toEqual([true, true, true]);
  });

  it('fills two humans with one bot on their team', () => {
    const match = createMatch([human('h1'), human('h2')], 1);
    expect(teamOf(match, 'A').map((r) => r.bot)).toEqual([false, false, true]);
    expect(teamOf(match, 'B').every((r) => r.bot)).toBe(true);
  });

  it('seats six humans without bots, three per team', () => {
    const ids = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(human);
    const match = createMatch(ids, 1);
    expect(match.roster.some((r) => r.bot)).toBe(false);
    expect(teamOf(match, 'A').map((r) => r.id)).toEqual(['h1', 'h2', 'h3']);
    expect(teamOf(match, 'B').map((r) => r.id)).toEqual(['h4', 'h5', 'h6']);
  });

  it('draws a registered map and starts in the buy phase', () => {
    const match = createMatch([human('h1')], 1);
    expect(match.mapId).toBe(match.world.map.id);
    expect(match.world.phase).toBe('buy');
    expect(match.score).toEqual({ A: 0, B: 0 });
  });
});

describe('forfeit', () => {
  it('hands the win to the other team', () => {
    const result = forfeit(createMatch([human('h1')], 1), 'A');
    expect(result.winner).toBe('B');
    expect(result.forfeitedBy).toBe('A');
  });
});

describe('full matches', () => {
  it('finish within 40 virtual minutes with sane state, and neither team always wins', () => {
    const winners = new Set<TeamId>();
    for (let seed = 1; seed <= 10; seed++) {
      const { match, ms } = playOut(createMatch([], seed));
      expect(match.winner, `seed ${seed} unfinished after ${ms} ms`).not.toBeNull();
      expect(matchWinner(match.score.A, match.score.B)).toBe(match.winner);
      winners.add(match.winner!);
    }
    expect(winners.size).toBe(2);
  }, 120_000);

  it('end even when the only human never presses anything', () => {
    for (const seed of [3, 4]) {
      const { match } = playOut(createMatch([human('h1')], seed));
      expect(match.winner).not.toBeNull();
    }
  }, 60_000);
});
