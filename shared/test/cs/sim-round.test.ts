import { describe, expect, it } from 'vitest';
import { sideOf } from '../../src/cs/match.js';
import { CANTINA } from '../../src/cs/maps/cantina.js';
import { BOMB_MS, BUY_MS, DEFUSE_MS, LIVE_MS, PLANT_MS, PREP_MS, stepWorld, type World } from '../../src/cs/sim.js';
import { aimInput, input, kill, makeWorld, patchPlayer, player, run, skipBuy, skipToPrep, teleport } from './helpers.js';

const siteA = CANTINA.sites.A;
const siteACenter = { x: (siteA.min.x + siteA.max.x) / 2, z: (siteA.min.z + siteA.max.z) / 2 };

function carrierId(world: World): string {
  return world.players.find((p) => p.hasBomb)!.id;
}

/** Rodada ao vivo com a bomba plantada no site A pelo portador. */
function plantedWorld(): World {
  let world = skipBuy(makeWorld());
  const id = carrierId(world);
  world = teleport(world, id, siteACenter.x, siteACenter.z);
  world = run(world, { [id]: input({ use: true }) }, PLANT_MS + 100).world;
  expect(world.bomb.status).toBe('planted');
  return world;
}

describe('createWorld', () => {
  it('places each player on a spawn of their side, alive with full hp', () => {
    const world = makeWorld();
    for (const p of world.players) {
      expect(p.side).toBe(sideOf(p.team, 0));
      expect(p.alive).toBe(true);
      expect(p.hp).toBe(100);
      const spawns = CANTINA.spawns[p.side];
      expect(spawns.some((s) => s.x === p.body.pos.x && s.z === p.body.pos.z)).toBe(true);
    }
  });

  it('gives the bomb to exactly one attacker', () => {
    const carriers = makeWorld().players.filter((p) => p.hasBomb);
    expect(carriers).toHaveLength(1);
    expect(carriers[0]!.side).toBe('attack');
  });
});

describe('phases', () => {
  it('freezes players during the buy phase, then opens the preparation, then goes live', () => {
    let world = makeWorld();
    const before = player(world, 'b1').body.pos;
    world = run(world, { b1: input({ moveZ: 1 }) }, 1000).world;
    expect(player(world, 'b1').body.pos).toEqual(before);
    expect(world.phase).toBe('buy');
    world = stepWorld(world, {}, BUY_MS);
    expect(world.phase).toBe('prep');
    expect(world.phaseLeftMs).toBe(PREP_MS);
    world = stepWorld(world, {}, PREP_MS);
    expect(world.phase).toBe('live');
    expect(world.phaseLeftMs).toBe(LIVE_MS);
  });
});

describe('preparation gate', () => {
  const barrier = CANTINA.barrier!;

  it('stands between the teams during the buy and preparation phases, and falls when the round goes live', () => {
    const world = makeWorld();
    expect(world.map.solids).toContain(barrier);
    expect(world.baseMap.solids).not.toContain(barrier);
    expect(skipToPrep(world).map.solids).toContain(barrier);
    expect(skipBuy(world).map.solids).not.toContain(barrier);
  });

  it('lets players move on their own side but not cross to the other', () => {
    let world = skipToPrep(makeWorld());
    world = teleport(world, 'a1', barrier.min.x - 2, 3);
    const east = { moveZ: 1, yaw: -Math.PI / 2 };
    const moved = run(world, { a1: input(east) }, 1000).world;
    expect(player(moved, 'a1').body.pos.x).toBeGreaterThan(barrier.min.x - 2.2);
    const pushed = run(world, { a1: input(east) }, 20_000).world;
    expect(player(pushed, 'a1').body.pos.x).toBeLessThanOrEqual(barrier.min.x);
  });

  it('lets players cross once the round is live', () => {
    let world = skipBuy(makeWorld());
    world = teleport(world, 'a1', barrier.min.x - 2, 3);
    const crossed = run(world, { a1: input({ moveZ: 1, yaw: -Math.PI / 2 }) }, 3000).world;
    expect(player(crossed, 'a1').body.pos.x).toBeGreaterThan(barrier.max.x);
  });

  it('does not let anyone shoot during the preparation', () => {
    const world = skipToPrep(makeWorld());
    const shooter = patchPlayer(world, 'a1', { weapon: 'tabelinha', ammo: 30, reserve: 90 });
    const after = run(shooter, { a1: aimInput(shooter, 'a1', 'b1', 'body', { fire: true }) }, 500).world;
    expect(player(after, 'a1').ammo).toBe(30);
    expect(player(after, 'b1').hp).toBe(100);
  });

  it('does not let the carrier plant during the preparation', () => {
    let world = skipToPrep(makeWorld());
    const id = carrierId(world);
    world = teleport(world, id, siteACenter.x, siteACenter.z);
    expect(run(world, { [id]: input({ use: true }) }, PLANT_MS + 500).world.bomb.status).toBe('carried');
  });

  it('never ends the round during the preparation', () => {
    let world = skipToPrep(makeWorld());
    world = kill(kill(world, 'b1'), 'b2');
    expect(stepWorld(world, {}, 50).end).toBeNull();
  });
});

describe('plant', () => {
  it('plants after holding use for PLANT_MS inside a site', () => {
    let world = skipBuy(makeWorld());
    const id = carrierId(world);
    world = teleport(world, id, siteACenter.x, siteACenter.z);
    const result = run(world, { [id]: input({ use: true }) }, PLANT_MS + 100);
    expect(result.world.bomb.status).toBe('planted');
    expect(result.world.bomb.site).toBe('A');
    expect(result.events).toContainEqual({ type: 'plant', by: id, site: 'A' });
  });

  it('does not plant outside a site', () => {
    let world = skipBuy(makeWorld());
    const id = carrierId(world);
    world = teleport(world, id, 5, 24);
    expect(run(world, { [id]: input({ use: true }) }, PLANT_MS + 500).world.bomb.status).toBe('carried');
  });

  it('resets progress when use is released early', () => {
    let world = skipBuy(makeWorld());
    const id = carrierId(world);
    world = teleport(world, id, siteACenter.x, siteACenter.z);
    world = run(world, { [id]: input({ use: true }) }, PLANT_MS - 500).world;
    world = run(world, { [id]: input() }, 100).world;
    world = run(world, { [id]: input({ use: true }) }, PLANT_MS - 500).world;
    expect(world.bomb.status).toBe('carried');
  });
});

describe('defuse and explosion', () => {
  it('defuses after DEFUSE_MS and the defense wins', () => {
    let world = plantedWorld();
    world = teleport(world, 'b1', world.bomb.pos!.x + 0.5, world.bomb.pos!.z);
    const result = run(world, { b1: input({ use: true }) }, DEFUSE_MS + 100);
    expect(result.world.bomb.status).toBe('defused');
    expect(result.world.end).toEqual({ winner: 'B', reason: 'defuse' });
  });

  it('explodes after BOMB_MS and the attack wins', () => {
    const result = run(plantedWorld(), {}, BOMB_MS + 100);
    expect(result.world.bomb.status).toBe('exploded');
    expect(result.world.end).toEqual({ winner: 'A', reason: 'explosion' });
  });

  it('explosion wins when the defuse would finish after it', () => {
    let world = plantedWorld();
    world = { ...world, bomb: { ...world.bomb, explodeInMs: 2000 } };
    world = teleport(world, 'b1', world.bomb.pos!.x + 0.5, world.bomb.pos!.z);
    const result = run(world, { b1: input({ use: true }) }, 3000);
    expect(result.world.end).toEqual({ winner: 'A', reason: 'explosion' });
  });

  it('defuse wins when it completes before the explosion tick', () => {
    let world = plantedWorld();
    world = { ...world, bomb: { ...world.bomb, explodeInMs: 150 } };
    world = teleport(world, 'b1', world.bomb.pos!.x + 0.5, world.bomb.pos!.z);
    world = { ...world, bomb: { ...world.bomb, progress: { who: 'b1', ms: DEFUSE_MS - 60 } } };
    const result = run(world, { b1: input({ use: true }) }, 100);
    expect(result.world.end).toEqual({ winner: 'B', reason: 'defuse' });
  });
});

describe('round end', () => {
  it('attack wins at once when every defender dies after the plant', () => {
    let world = plantedWorld();
    world = kill(kill(world, 'b1'), 'b2');
    const next = stepWorld(world, {}, 50);
    expect(next.end).toEqual({ winner: 'A', reason: 'elimination' });
  });

  it('keeps playing when every attacker dies after the plant', () => {
    let world = plantedWorld();
    world = kill(kill(world, 'a1'), 'a2');
    expect(stepWorld(world, {}, 50).end).toBeNull();
  });

  it('defense wins when every attacker dies before the plant', () => {
    let world = skipBuy(makeWorld());
    world = kill(kill(world, 'a1'), 'a2');
    expect(stepWorld(world, {}, 50).end).toEqual({ winner: 'B', reason: 'elimination' });
  });

  it('defense wins on time when nobody plants', () => {
    const result = run(skipBuy(makeWorld()), {}, LIVE_MS + 100, 500);
    expect(result.world.end).toEqual({ winner: 'B', reason: 'time' });
  });

  it('emits roundEnd exactly once', () => {
    let world = skipBuy(makeWorld());
    world = kill(kill(world, 'a1'), 'a2');
    const result = run(world, {}, 1000);
    expect(result.events.filter((e) => e.type === 'roundEnd')).toHaveLength(1);
    expect(patchPlayer(result.world, 'a1', {}).phase).toBe('over');
  });
});
