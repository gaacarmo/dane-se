import { describe, expect, it } from 'vitest';
import { botBuy, createBotMemory, findPath, botInput } from '../../src/cs/bot.js';
import type { MapDef } from '../../src/cs/map.js';
import { CANTINA } from '../../src/cs/maps/cantina.js';
import { aimAt } from '../../src/cs/sim.js';
import { WEAPONS } from '../../src/cs/weapons.js';
import { arenaMap, duel, makeWorld, patchPlayer, player, runBots, skipBuy, teleport } from './helpers.js';

describe('findPath', () => {
  it('links two connected waypoints through the graph', () => {
    const from = CANTINA.waypoints[0]!;
    const to = CANTINA.waypoints[9]!;
    const path = findPath(CANTINA, from, to);
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toBe(0);
    expect(path[path.length - 1]).toBe(9);
  });

  it('returns an empty path for an unreachable destination', () => {
    const island: MapDef = {
      ...CANTINA,
      waypoints: [...CANTINA.waypoints, { x: 38, y: 0, z: 28 }],
    };
    expect(findPath(island, CANTINA.waypoints[0]!, { x: 38, y: 0, z: 28 })).toEqual([]);
  });
});

describe('botBuy', () => {
  it('never buys above its money', () => {
    let world = makeWorld();
    world = patchPlayer(world, 'a1', { money: 800 });
    const pick = botBuy(world, 'a1');
    expect(WEAPONS[pick].price).toBeLessThanOrEqual(800);
  });

  it('buys a rifle or sniper when rich', () => {
    let world = makeWorld();
    world = patchPlayer(world, 'a1', { money: 9000 });
    expect(['rifle', 'sniper']).toContain(WEAPONS[botBuy(world, 'a1')].category);
  });

  it('keeps a rifle it already owns', () => {
    let world = makeWorld();
    world = patchPlayer(world, 'a1', { money: 9000, weapon: 'tabelinha' });
    expect(botBuy(world, 'a1')).toBe('tabelinha');
  });
});

describe('botInput', () => {
  it('has the bomb carrier plant within 60 virtual seconds', () => {
    let world = skipBuy(makeWorld());
    world = patchPlayer(patchPlayer(world, 'b1', { hp: 100_000 }), 'b2', { hp: 100_000 });
    const result = runBots(world, ['a1', 'a2'], 60_000, { stopWhen: (w) => w.bomb.status === 'planted' });
    expect(result.world.bomb.status).toBe('planted');
  });

  it('has a defender hit a visible attacker within 2 s in at least 7 of 10 seeds', () => {
    let hits = 0;
    for (let seed = 1; seed <= 10; seed++) {
      let world = duel(arenaMap, 'tabelinha');
      const b1 = player(world, 'b1');
      const look = aimAt({ ...b1.body.pos, y: 1.65 }, { x: 10, y: 1.1, z: 10 });
      world = patchPlayer(world, 'b1', { weapon: 'tabelinha', ammo: 30, reserve: 90, yaw: look.yaw, pitch: look.pitch });
      const result = runBots(world, ['b1'], 2000, { seed, stepMs: 20 });
      if (player(result.world, 'a1').hp < 100) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(7);
  });

  it('never outputs NaN', () => {
    let world = skipBuy(makeWorld());
    world = teleport(world, 'b1', 12, 10);
    const ids = world.players.map((p) => p.id);
    let memories = Object.fromEntries(ids.map((id, i) => [id, createBotMemory(i + 1)]));
    for (let i = 0; i < 400; i++) {
      for (const id of ids) {
        const out = botInput(world, id, memories[id]!, 50);
        memories[id] = out.memory;
        for (const key of ['moveX', 'moveZ', 'yaw', 'pitch'] as const) expect(Number.isNaN(out.input[key])).toBe(false);
      }
    }
  });
});
