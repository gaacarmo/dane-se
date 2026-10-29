import { describe, expect, it } from 'vitest';
import { BOT_SKILLS, botBuy, botInput, createBotMemory, findPath, varySkill, type Difficulty } from '../../src/cs/bot.js';
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
    expect(pick === null || WEAPONS[pick].price <= 800).toBe(true);
  });

  it('buys a rifle or sniper when rich', () => {
    let world = makeWorld();
    world = patchPlayer(world, 'a1', { money: 9000 });
    expect(['rifle', 'sniper']).toContain(WEAPONS[botBuy(world, 'a1')!].category);
  });

  it('buys nothing when it already holds a primary, in hand or holstered', () => {
    let world = makeWorld();
    world = patchPlayer(world, 'a1', { money: 9000, weapon: 'tabelinha' });
    expect(botBuy(world, 'a1')).toBeNull();
    world = patchPlayer(world, 'a1', { weapon: 'chinelo', holstered: { weapon: 'tabelinha', ammo: 30, reserve: 60 } });
    expect(botBuy(world, 'a1')).toBeNull();
  });

  it('never downgrades its pistol', () => {
    let world = makeWorld();
    world = patchPlayer(world, 'a1', { money: 600, weapon: 'tamanco' });
    expect(botBuy(world, 'a1')).toBeNull();
  });

  it('switches to the holstered weapon when the current one is empty', () => {
    let world = skipBuy(makeWorld());
    world = patchPlayer(world, 'a1', { ammo: 0, reserve: 0, holstered: { weapon: 'chinelo', ammo: 6, reserve: 12 }, weapon: 'tabelinha' });
    expect(botInput(world, 'a1', createBotMemory(1), 50).input.slot).toBe(3);
  });
});

describe('botInput', () => {
  it('has the bomb carrier plant within 60 virtual seconds', () => {
    let world = skipBuy(makeWorld());
    world = patchPlayer(patchPlayer(world, 'b1', { hp: 100_000 }), 'b2', { hp: 100_000 });
    const result = runBots(world, ['a1', 'a2'], 60_000, { stopWhen: (w) => w.bomb.status === 'planted' });
    expect(result.world.bomb.status).toBe('planted');
  });

  it('has a normal defender hit a visible attacker within 3 s in at least 6 of 10 seeds', () => {
    let hits = 0;
    for (let seed = 1; seed <= 10; seed++) {
      let world = duel(arenaMap, 'tabelinha');
      const b1 = player(world, 'b1');
      const look = aimAt({ ...b1.body.pos, y: 1.65 }, { x: 10, y: 1.1, z: 10 });
      world = patchPlayer(world, 'b1', { weapon: 'tabelinha', ammo: 30, reserve: 90, yaw: look.yaw, pitch: look.pitch });
      const result = runBots(world, ['b1'], 3000, { seed, stepMs: 20 });
      if (player(result.world, 'a1').hp < 100) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(6);
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


/** Bot b1 atira com um fuzil num alvo parado a ~10 m; devolve o tempo até o abate e se foi headshot. */
function duelKill(difficulty: Difficulty, seed: number): { ms: number; headshot: boolean } {
  let world = duel(arenaMap, 'tabelinha');
  const b1 = player(world, 'b1');
  const look = aimAt({ ...b1.body.pos, y: 1.65 }, { x: 10, y: 1.1, z: 10 });
  world = patchPlayer(world, 'b1', { weapon: 'tabelinha', ammo: 30, reserve: 90, yaw: look.yaw, pitch: look.pitch });
  const skill = varySkill(BOT_SKILLS[difficulty], seed);
  const result = runBots(world, ['b1'], 12_000, { seed, skill, stepMs: 20, stopWhen: (w) => !player(w, 'a1').alive });
  const killing = result.events.find((e) => e.type === 'hit' && e.killed);
  return { ms: player(result.world, 'a1').alive ? Infinity : result.elapsedMs, headshot: killing?.type === 'hit' && killing.zone === 'head' };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('bot skill', () => {
  it('uses the normal skill by default', () => {
    expect(createBotMemory(1).skill).toEqual(BOT_SKILLS.normal);
  });

  it('varies each bot by at most 15%, deterministically per seed', () => {
    const a = varySkill(BOT_SKILLS.normal, 3);
    expect(varySkill(BOT_SKILLS.normal, 3)).toEqual(a);
    expect(a.aimErrorDeg).toBeGreaterThanOrEqual(BOT_SKILLS.normal.aimErrorDeg / 1.15 - 1e-9);
    expect(a.aimErrorDeg).toBeLessThanOrEqual(BOT_SKILLS.normal.aimErrorDeg / 0.85 + 1e-9);
    expect(a.fovDeg).toBe(BOT_SKILLS.normal.fovDeg);
  });

  it('takes a normal bot between 1 and 3.5 s (median) to kill a standing target at 10 m', () => {
    const times = seeds(20).map((seed) => duelKill('normal', seed).ms);
    expect(median(times)).toBeGreaterThanOrEqual(1000);
    expect(median(times)).toBeLessThanOrEqual(3500);
  });

  it('orders the difficulties: easy is slower than normal, normal slower than hard', () => {
    const med = (d: Difficulty) => median(seeds(20).map((seed) => duelKill(d, seed).ms));
    expect(med('easy')).toBeGreaterThan(med('normal'));
    expect(med('normal')).toBeGreaterThan(med('hard'));
  });

  it('makes headshots a minority of the normal bot kills', () => {
    const kills = seeds(30).map((seed) => duelKill('normal', seed)).filter((k) => Number.isFinite(k.ms));
    expect(kills.length).toBeGreaterThan(15);
    expect(kills.filter((k) => k.headshot).length / kills.length).toBeLessThanOrEqual(0.4);
  });

  it('does not shoot an enemy behind it', () => {
    let world = duel(arenaMap, 'tabelinha');
    const b1 = player(world, 'b1');
    const away = aimAt({ ...b1.body.pos, y: 1.65 }, { x: 10, y: 1.65, z: -20 });
    world = patchPlayer(world, 'b1', { weapon: 'tabelinha', ammo: 30, reserve: 90, yaw: away.yaw, pitch: 0 });
    const result = runBots(world, ['b1'], 250, { stepMs: 10 });
    expect(result.events.some((e) => e.type === 'shot')).toBe(false);
  });
});
