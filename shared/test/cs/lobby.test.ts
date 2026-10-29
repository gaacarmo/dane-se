import { describe, expect, it } from 'vitest';
import { autoTeam, canJoinTeam, forfeitPassed, publicRoster, startError, type CsMember } from '../../src/cs/lobby.js';
import { createMatch } from '../../src/cs/runner.js';

const member = (id: string, team: 'A' | 'B'): CsMember => ({ id, name: id, team, isHost: false, connected: true, character: 'carmelo' });

describe('publicRoster', () => {
  it('keeps who plays and on which team, and hides money, weapons and equipment', () => {
    const roster = createMatch([{ id: 'h1', name: 'H1' }], 1).roster.map((r) => ({
      ...r,
      money: 4000,
      weapon: 'tabelinha' as const,
      holstered: 'tamanco' as const,
      armor: 100,
      helmet: true,
      kit: true,
    }));
    const seen = publicRoster(roster);
    expect(seen).toHaveLength(roster.length);
    roster.forEach((r, i) => {
      expect(seen[i]).toEqual({ id: r.id, name: r.name, team: r.team, bot: r.bot, character: r.character, money: 0, weapon: 'chinelo' });
    });
  });
});

describe('canJoinTeam', () => {
  it('allows up to 3 humans per team', () => {
    const members = [member('a', 'A'), member('b', 'A'), member('c', 'A'), member('d', 'B')];
    expect(canJoinTeam(members, 'd', 'A')).toBe(false);
    expect(canJoinTeam(members, 'd', 'B')).toBe(true);
    expect(canJoinTeam([member('a', 'A'), member('b', 'A')], 'x', 'A')).toBe(true);
  });

  it('lets someone already in a full team stay in it', () => {
    const members = [member('a', 'A'), member('b', 'A'), member('c', 'A')];
    expect(canJoinTeam(members, 'a', 'A')).toBe(true);
  });
});

describe('autoTeam', () => {
  it('picks the team with fewer humans, A on a tie', () => {
    expect(autoTeam([])).toBe('A');
    expect(autoTeam([member('a', 'A')])).toBe('B');
    expect(autoTeam([member('a', 'A'), member('b', 'B')])).toBe('A');
    expect(autoTeam([member('a', 'A'), member('b', 'A'), member('c', 'B')])).toBe('B');
  });
});

describe('startError', () => {
  it('needs at least one human', () => {
    expect(startError([])).toBe('NOT_ENOUGH_PLAYERS');
    expect(startError([member('a', 'A')])).toBeNull();
    expect(startError([member('a', 'B'), member('b', 'B')])).toBeNull();
  });
});

describe('forfeitPassed', () => {
  it('needs more than half of the humans of the team', () => {
    expect(forfeitPassed(new Set(['a']), ['a'])).toBe(true);
    expect(forfeitPassed(new Set(['a']), ['a', 'b'])).toBe(false);
    expect(forfeitPassed(new Set(['a', 'b']), ['a', 'b'])).toBe(true);
    expect(forfeitPassed(new Set(['a', 'b']), ['a', 'b', 'c'])).toBe(true);
    expect(forfeitPassed(new Set(['a']), ['a', 'b', 'c'])).toBe(false);
  });

  it('ignores votes from people who are not on the team and never passes an empty team', () => {
    expect(forfeitPassed(new Set(['x', 'y']), ['a', 'b'])).toBe(false);
    expect(forfeitPassed(new Set(['a']), [])).toBe(false);
  });
});
