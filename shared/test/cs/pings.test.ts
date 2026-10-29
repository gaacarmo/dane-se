import { describe, expect, it } from 'vitest';
import { MAX_PINGS_PER_PLAYER, PING_TTL_MS, addPing, type Ping } from '../../src/cs/pings.js';

const ping = (id: number, by: string, at: number): Ping => ({ id, kind: 'attention', x: id, z: id, by, at });

describe('addPing', () => {
  it('appends the new ping', () => {
    expect(addPing([], ping(1, 'a', 0)).map((p) => p.id)).toEqual([1]);
  });

  it('drops pings older than the TTL', () => {
    const list = addPing([ping(1, 'a', 0)], ping(2, 'a', PING_TTL_MS + 1));
    expect(list.map((p) => p.id)).toEqual([2]);
  });

  it('keeps at most 3 per player, dropping the oldest', () => {
    let list: Ping[] = [];
    for (let i = 1; i <= MAX_PINGS_PER_PLAYER + 1; i++) list = addPing(list, ping(i, 'a', i));
    expect(list.map((p) => p.id)).toEqual([2, 3, 4]);
  });

  it('does not touch another player\'s pings', () => {
    let list = addPing([], ping(1, 'b', 0));
    for (let i = 2; i <= 5; i++) list = addPing(list, ping(i, 'a', i));
    expect(list.some((p) => p.by === 'b')).toBe(true);
    expect(list.filter((p) => p.by === 'a')).toHaveLength(MAX_PINGS_PER_PLAYER);
  });
});
