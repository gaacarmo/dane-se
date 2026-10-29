import { describe, expect, it } from 'vitest';
import { KILL_REWARD } from '../../src/cs/economy.js';
import { WEAPONS } from '../../src/cs/weapons.js';
import { spreadFor, stepWorld } from '../../src/cs/sim.js';
import { aimInput, aimPoint, duel, input, patchPlayer, player, run, teleport, wallArena } from './helpers.js';

const STEP = 10;

describe('shooting', () => {
  it('kills with one rifle headshot and reports it', () => {
    const world = duel();
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'head', { fire: true }) }, STEP, STEP);
    expect(player(result.world, 'b1').alive).toBe(false);
    expect(result.events).toContainEqual({ type: 'kill', killer: 'a1', victim: 'b1', headshot: true });
  });

  it('needs four rifle body shots', () => {
    const world = duel();
    const shoot = { a1: aimInput(world, 'a1', 'b1', 'body', { fire: true }) };
    const three = run(world, shoot, 250, STEP).world;
    expect(player(three, 'b1').hp).toBe(10);
    expect(player(three, 'b1').alive).toBe(true);
    const four = run(three, shoot, 100, STEP).world;
    expect(player(four, 'b1').alive).toBe(false);
  });

  it('kills with one sniper body shot', () => {
    const world = duel(undefined, 'escanteio');
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'body', { fire: true }) }, STEP, STEP);
    expect(player(result.world, 'b1').alive).toBe(false);
  });

  it('hits legs for reduced damage', () => {
    const world = duel();
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'legs', { fire: true }) }, STEP, STEP);
    expect(player(result.world, 'b1').hp).toBe(100 - 22);
  });

  it('ignores teammates: they neither block nor take damage', () => {
    let world = duel();
    world = teleport(world, 'a2', 10, 5);
    const shoot = { a1: aimInput(world, 'a1', 'b1', 'head', { fire: true }) };
    const result = run(world, shoot, STEP, STEP).world;
    expect(player(result, 'a2').hp).toBe(100);
    expect(player(result, 'b1').alive).toBe(false);
  });

  it('is stopped by a wall', () => {
    const world = duel(wallArena);
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'head', { fire: true }) }, 300, STEP).world;
    expect(player(result, 'b1').hp).toBe(100);
  });

  it('respects the fire interval', () => {
    const world = duel();
    const sky = input({ fire: true, pitch: 1.2 });
    const after = run(world, { a1: sky }, 1000, STEP).world;
    const fired = WEAPONS.tabelinha.magSize - player(after, 'a1').ammo;
    expect(fired).toBeGreaterThanOrEqual(9);
    expect(fired).toBeLessThanOrEqual(11);
  });

  it('does not shoot during the buy phase', () => {
    const world = duel();
    const buying = { ...world, phase: 'buy' as const, phaseLeftMs: 10_000 };
    const after = run(buying, { a1: aimInput(world, 'a1', 'b1', 'head', { fire: true }) }, 200, STEP).world;
    expect(player(after, 'b1').hp).toBe(100);
  });

  it('pays the killer', () => {
    const world = duel();
    const before = player(world, 'a1').money;
    const after = run(world, { a1: aimInput(world, 'a1', 'b1', 'head', { fire: true }) }, STEP, STEP).world;
    expect(player(after, 'a1').money).toBe(before + KILL_REWARD);
  });

  it('lets a player killed this tick still return fire', () => {
    let world = duel();
    world = teleport(world, 'b1', 10, 0);
    world = patchPlayer(world, 'b1', { weapon: 'tabelinha', ammo: 30, reserve: 90 });
    const inputs = {
      a1: aimInput(world, 'a1', 'b1', 'head', { fire: true }),
      b1: aimInput(world, 'b1', 'a1', 'head', { fire: true }),
    };
    const after = stepWorld(world, inputs, STEP);
    expect(player(after, 'a1').alive).toBe(false);
    expect(player(after, 'b1').alive).toBe(false);
  });
});

describe('reload', () => {
  it('reloads by itself when the magazine empties', () => {
    let world = duel();
    world = patchPlayer(world, 'a1', { ammo: 1, reserve: 60 });
    const shoot = { a1: aimInput(world, 'a1', 'b1', 'legs', { fire: true }) };
    world = run(world, shoot, STEP, STEP).world;
    expect(player(world, 'a1').ammo).toBe(0);
    expect(player(world, 'a1').reloadLeftMs).toBeGreaterThan(0);
    world = run(world, { a1: input() }, WEAPONS.tabelinha.reloadMs + 100, STEP).world;
    expect(player(world, 'a1').ammo).toBe(30);
    expect(player(world, 'a1').reserve).toBe(30);
  });

  it('reloads on demand and cannot fire meanwhile', () => {
    let world = duel();
    world = patchPlayer(world, 'a1', { ammo: 10, reserve: 60 });
    const aim = aimInput(world, 'a1', 'b1', 'head');
    world = run(world, { a1: { ...aim, reload: true } }, STEP, STEP).world;
    world = run(world, { a1: { ...aim, fire: true } }, 500, STEP).world;
    expect(player(world, 'b1').hp).toBe(100);
    world = run(world, { a1: aim }, WEAPONS.tabelinha.reloadMs, STEP).world;
    expect(player(world, 'a1').ammo).toBe(30);
    expect(player(world, 'a1').reserve).toBe(40);
  });
});

describe('spreadFor', () => {
  it('is tighter standing than running', () => {
    const world = duel();
    const standing = player(world, 'a1');
    const running = { ...standing, body: { ...standing.body, vel: { x: 5.5, y: 0, z: 0 } } };
    const weapon = WEAPONS.tabelinha;
    expect(spreadFor(standing, weapon)).toBeLessThan(spreadFor(running, weapon));
  });

  it('grows with consecutive shots up to the cap', () => {
    const world = duel();
    const base = player(world, 'a1');
    const weapon = WEAPONS.tabelinha;
    expect(spreadFor({ ...base, shots: 3 }, weapon)).toBeGreaterThan(spreadFor({ ...base, shots: 0 }, weapon));
    expect(spreadFor({ ...base, shots: 99 }, weapon)).toBe(weapon.spreadMax);
  });
});

describe('hitbox', () => {
  const shootAt = (x: number, y: number) => {
    const world = duel();
    const shot = { a1: aimPoint(world, 'a1', { x: 10 + x, y, z: 0 }, { fire: true }) };
    return player(run(world, shot, STEP, STEP).world, 'b1');
  };

  it('is narrower at the head than the drawn shoulders', () => {
    expect(shootAt(0.12, 1.64).alive).toBe(false);
    expect(shootAt(0.25, 1.64).hp).toBe(100);
    expect(shootAt(0.25, 1.15).hp).toBe(70);
  });

  it('is narrower at the legs than the torso', () => {
    expect(shootAt(0.15, 0.4).hp).toBe(78);
    expect(shootAt(0.32, 0.4).hp).toBe(100);
  });

  it('shrinks with the crouch', () => {
    let world = duel();
    world = patchPlayer(world, 'b1', { body: { ...player(world, 'b1').body, crouch: true } });
    const shot = {
      a1: aimPoint(world, 'a1', { x: 10, y: 1.6, z: 0 }, { fire: true }),
      b1: input({ crouch: true }),
    };
    expect(player(run(world, shot, STEP, STEP).world, 'b1').hp).toBe(100);
  });
});

describe('weapon slots', () => {
  const armed = () =>
    patchPlayer(duel(), 'a1', {
      weapon: 'tabelinha',
      ammo: 20,
      reserve: 60,
      holstered: { weapon: 'chinelo', ammo: 5, reserve: 24 },
    });

  it('switches to the holstered weapon keeping both magazines', () => {
    const after = player(stepWorld(armed(), { a1: input({ slot: 2 }) }, STEP), 'a1');
    expect(after.weapon).toBe('chinelo');
    expect(after.ammo).toBe(5);
    expect(after.reserve).toBe(24);
    expect(after.holstered).toEqual({ weapon: 'tabelinha', ammo: 20, reserve: 60 });
  });

  it('toggles with slot 3 and does nothing for the slot already in hand', () => {
    const world = armed();
    expect(player(stepWorld(world, { a1: input({ slot: 1 }) }, STEP), 'a1').weapon).toBe('tabelinha');
    const toggled = stepWorld(world, { a1: input({ slot: 3 }) }, STEP);
    expect(player(toggled, 'a1').weapon).toBe('chinelo');
    expect(player(stepWorld(toggled, { a1: input({ slot: 3 }) }, STEP), 'a1').weapon).toBe('tabelinha');
  });

  it('ignores a switch when nothing is holstered', () => {
    const world = duel();
    expect(player(stepWorld(world, { a1: input({ slot: 2 }) }, STEP), 'a1').weapon).toBe('tabelinha');
    expect(player(stepWorld(world, { a1: input({ slot: 3 }) }, STEP), 'a1').holstered).toBeNull();
  });

  it('cannot fire until the equip time passes', () => {
    const world = armed();
    const shoot = { a1: aimInput(world, 'a1', 'b1', 'body', { fire: true, slot: 2 }) };
    const early = run(world, shoot, WEAPONS.chinelo.equipMs - 60, STEP).world;
    expect(player(early, 'a1').ammo).toBe(5);
    expect(player(early, 'b1').hp).toBe(100);
    const later = run(early, shoot, 200, STEP).world;
    expect(player(later, 'a1').ammo).toBeLessThan(5);
  });

  it('cancels a reload by switching', () => {
    const world = patchPlayer(armed(), 'a1', { reloadLeftMs: 1500, ammo: 10 });
    const after = player(stepWorld(world, { a1: input({ slot: 2 }) }, STEP), 'a1');
    expect(after.reloadLeftMs).toBe(0);
    expect(after.holstered).toEqual({ weapon: 'tabelinha', ammo: 10, reserve: 60 });
  });
});
