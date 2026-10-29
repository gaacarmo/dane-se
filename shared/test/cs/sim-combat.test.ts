import { describe, expect, it } from 'vitest';
import { KILL_REWARD } from '../../src/cs/economy.js';
import { WEAPONS } from '../../src/cs/weapons.js';
import { spreadFor, stepWorld } from '../../src/cs/sim.js';
import { aimInput, aimPoint, aimer, duel, input, patchPlayer, player, run, teleport, wallArena } from './helpers.js';

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
    const shoot = { a1: aimer('a1', 'b1', 'body', { fire: true }) };
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

describe('shot and hit events', () => {
  const fireOnce = (world: ReturnType<typeof duel>, aim: ReturnType<typeof aimInput>) => run(world, { a1: { ...aim, fire: true } }, STEP, STEP).events;

  it('reports a body hit with the entry point and the damage', () => {
    const world = duel();
    const result = run(world, { a1: { ...aimInput(world, 'a1', 'b1', 'body'), fire: true } }, STEP, STEP);
    const events = result.events;
    const shot = events.find((e) => e.type === 'shot')!;
    expect(shot).toMatchObject({ type: 'shot', shooter: 'a1', weapon: 'tabelinha', hit: 'player' });
    if (shot.type !== 'shot') throw new Error('unreachable');
    const bodyHalf = 0.36;
    expect(Math.abs(shot.to.z - (player(result.world, 'b1').body.pos.z + bodyHalf))).toBeLessThan(0.05);
    expect(events.find((e) => e.type === 'hit')).toEqual({
      type: 'hit',
      attacker: 'a1',
      victim: 'b1',
      zone: 'body',
      damage: 30,
      killed: false,
    });
  });

  it('marks the killing blow', () => {
    const world = duel();
    const events = fireOnce(world, aimInput(world, 'a1', 'b1', 'head'));
    expect(events.find((e) => e.type === 'hit')).toMatchObject({ zone: 'head', killed: true });
    expect(events.some((e) => e.type === 'kill')).toBe(true);
  });

  it('reports a wall hit with the face normal and no hit event', () => {
    const world = duel(wallArena);
    const events = fireOnce(world, aimInput(world, 'a1', 'b1', 'body'));
    const shot = events.find((e) => e.type === 'shot')!;
    expect(shot).toMatchObject({ hit: 'wall', normal: { x: 0, y: 0, z: 1 } });
    if (shot.type !== 'shot') throw new Error('unreachable');
    expect(Math.abs(shot.to.z - 5.1)).toBeLessThan(0.05);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('ends a shot at the floor', () => {
    const world = duel();
    const events = fireOnce(world, aimPoint(world, 'a1', { x: 10, y: 0, z: 6 }));
    const shot = events.find((e) => e.type === 'shot')!;
    expect(shot).toMatchObject({ hit: 'wall', normal: { x: 0, y: 1, z: 0 } });
    if (shot.type !== 'shot') throw new Error('unreachable');
    expect(shot.to.y).toBeCloseTo(0, 1);
  });

  it('ends a shot into the open sky at the ceiling with a tracer end point but no impact', () => {
    const world = duel();
    const events = fireOnce(world, input({ pitch: 1.2 }));
    const shot = events.find((e) => e.type === 'shot')!;
    expect(shot).toMatchObject({ hit: 'none' });
    if (shot.type !== 'shot') throw new Error('unreachable');
    expect(shot.normal).toBeUndefined();
    expect(shot.to.y).toBeCloseTo(6, 1);
  });

  it('leaves no impact where the map has only an invisible edge', () => {
    const world = duel();
    const events = fireOnce(world, aimPoint(world, 'a1', { x: 40, y: 1.5, z: 10 }));
    const shot = events.find((e) => e.type === 'shot')!;
    expect(shot).toMatchObject({ hit: 'none' });
    if (shot.type !== 'shot') throw new Error('unreachable');
    expect(shot.to.x).toBeCloseTo(40, 1);
  });
});

describe('recoil', () => {
  const DEG = Math.PI / 180;
  const sprayer = (compensate: boolean) => {
    let world = duel();
    world = patchPlayer(world, 'b1', { hp: 100_000 });
    const source = compensate ? aimer('a1', 'b1', 'body', { fire: true }) : aimInput(world, 'a1', 'b1', 'body', { fire: true });
    return run(world, { a1: source }, 900, STEP);
  };
  const elevations = (events: ReturnType<typeof sprayer>['events']) =>
    events
      .filter((e) => e.type === 'shot')
      .map((e) => (e.type === 'shot' ? Math.atan2(e.to.y - e.from.y, Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z)) : 0));
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  it('lets the spray climb when the player does not pull down', () => {
    const shots = elevations(sprayer(false).events);
    expect(shots.length).toBeGreaterThanOrEqual(8);
    expect(mean(shots.slice(4, 8)) - shots[0]!).toBeGreaterThan(3 * DEG);
  });

  it('keeps the spray on target when the player compensates', () => {
    const fixed = elevations(sprayer(false).events);
    const held = elevations(sprayer(true).events);
    expect(mean(fixed.slice(4, 8)) - mean(held.slice(4, 8))).toBeGreaterThan(3 * DEG);
    expect(Math.abs(mean(held.slice(4, 8)) - held[0]!)).toBeLessThan(1.5 * DEG);
  });

  it('caps the climb at the weapon limit', () => {
    const after = player(run(patchPlayer(duel(), 'b1', { hp: 100_000 }), { a1: input({ fire: true, pitch: 0 }) }, 2600, STEP).world, 'a1');
    expect(after.punchPitch).toBeCloseTo(WEAPONS.tabelinha.recoilMax * DEG, 3);
  });

  it('goes back to zero after the trigger is released', () => {
    const fired = run(duel(), { a1: input({ fire: true, pitch: 1.2 }) }, 600, STEP).world;
    expect(player(fired, 'a1').punchPitch).toBeGreaterThan(0);
    const rested = run(fired, { a1: input() }, 1200, STEP).world;
    expect(player(rested, 'a1').punchPitch).toBe(0);
    expect(player(rested, 'a1').punchYaw).toBe(0);
    expect(player(rested, 'a1').burst).toBe(0);
  });

  it('adds one kick step per shot, after the shot has left', () => {
    const first = player(run(duel(), { a1: input({ fire: true, pitch: 1.2 }) }, STEP, STEP).world, 'a1');
    expect(first.burst).toBe(1);
    expect(first.punchPitch).toBeCloseTo(WEAPONS.tabelinha.recoilPitch * DEG, 5);
  });
});
