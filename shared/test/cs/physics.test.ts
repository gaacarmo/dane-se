import { describe, expect, it } from 'vitest';
import type { MapDef } from '../../src/cs/map.js';
import {
  AIR_ACCEL,
  CROUCH_SPEED,
  WALK_SPEED,
  PLAYER_RADIUS,
  RUN_SPEED,
  moveBody,
  raycast,
  raycastHit,
  worldRay,
  type Body,
} from '../../src/cs/physics.js';

const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => ({
  min: { x: x1, y: y1, z: z1 },
  max: { x: x2, y: y2, z: z2 },
});

/** Arena 20 × 20 com uma parede em x = 10 (de z = 0 a z = 20). */
const arena: MapDef = {
  id: 'test',
  name: 'Teste',
  bounds: box(0, 0, 0, 20, 6, 20),
  solids: [box(10, 0, 0, 11, 4, 20)],
  sites: { A: box(0, 0, 0, 1, 1, 1), B: box(0, 0, 0, 1, 1, 1) },
  spawns: { attack: [], defense: [] },
  waypoints: [],
  links: [],
};

const body = (x: number, y: number, z: number): Body => ({
  pos: { x, y, z },
  vel: { x: 0, y: 0, z: 0 },
  onGround: y === 0,
  crouch: false,
});

function run(b: Body, wish: { x: number; z: number }, seconds: number, jump = false, crouch = false): Body {
  let cur = b;
  for (let t = 0; t < seconds; t += 1 / 60) cur = moveBody(arena, cur, wish, jump, crouch, 1, 1 / 60);
  return cur;
}

describe('moveBody', () => {
  it('does not cross a wall', () => {
    const end = run(body(5, 0, 10), { x: 1, z: 0 }, 3);
    expect(end.pos.x).toBeLessThanOrEqual(10 - PLAYER_RADIUS + 1e-6);
    expect(end.pos.x).toBeGreaterThan(9);
  });

  it('slides along the wall on a diagonal', () => {
    const start = body(9, 0, 5);
    const end = run(start, { x: 1, z: 1 }, 1);
    expect(end.pos.z).toBeGreaterThan(start.pos.z + 2);
    expect(end.pos.x).toBeLessThanOrEqual(10 - PLAYER_RADIUS + 1e-6);
  });

  it('moves at run speed in open space', () => {
    const end = run(body(2, 0, 10), { x: 0, z: 1 }, 1);
    expect(end.pos.z - 10).toBeCloseTo(RUN_SPEED, 0);
  });

  it('is slower while crouching', () => {
    const end = run(body(2, 0, 10), { x: 0, z: 1 }, 1, false, true);
    expect(end.pos.z - 10).toBeCloseTo(CROUCH_SPEED, 0);
    expect(end.crouch).toBe(true);
  });

  it('falls to the ground', () => {
    const end = run(body(2, 3, 2), { x: 0, z: 0 }, 2);
    expect(end.pos.y).toBe(0);
    expect(end.onGround).toBe(true);
  });

  it('jumps only from the ground', () => {
    const grounded = moveBody(arena, body(2, 0, 2), { x: 0, z: 0 }, true, false, 1, 1 / 60);
    expect(grounded.vel.y).toBeGreaterThan(0);
    const midair = body(2, 3, 2);
    const after = moveBody(arena, midair, { x: 0, z: 0 }, true, false, 1, 1 / 60);
    expect(after.vel.y).toBeLessThanOrEqual(0);
  });

  it('never leaves the map bounds', () => {
    const end = run(body(2, 0, 2), { x: -1, z: -1 }, 3);
    expect(end.pos.x).toBeGreaterThanOrEqual(PLAYER_RADIUS - 1e-6);
    expect(end.pos.z).toBeGreaterThanOrEqual(PLAYER_RADIUS - 1e-6);
  });
});

describe('raycast', () => {
  const origin = { x: 5, y: 1.5, z: 10 };

  it('returns the distance to the first solid', () => {
    expect(raycast(arena, origin, { x: 1, y: 0, z: 0 }, 50)).toBeCloseTo(5, 2);
  });

  it('returns null when the solid is beyond maxDist', () => {
    expect(raycast(arena, origin, { x: 1, y: 0, z: 0 }, 3)).toBeNull();
  });

  it('returns null when nothing is in the way', () => {
    expect(raycast(arena, origin, { x: -1, y: 0, z: 0 }, 50)).toBeNull();
  });

  it('passes over a low solid', () => {
    const low: MapDef = { ...arena, solids: [box(10, 0, 0, 11, 1, 20)] };
    expect(raycast(low, origin, { x: 1, y: 0, z: 0 }, 50)).toBeNull();
  });
});

describe('raycastHit', () => {
  const origin = { x: 5, y: 1.5, z: 10 };

  it('reports the face that was hit', () => {
    const hit = raycastHit(arena, origin, { x: 1, y: 0, z: 0 }, 50)!;
    expect(hit.dist).toBeCloseTo(5, 2);
    expect(hit.normal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('reports the top face when coming from above', () => {
    const low: MapDef = { ...arena, solids: [box(10, 0, 0, 11, 1, 20)] };
    const hit = raycastHit(low, { x: 10.5, y: 3, z: 10 }, { x: 0, y: -1, z: 0 }, 50)!;
    expect(hit.dist).toBeCloseTo(2, 2);
    expect(hit.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('returns null on a miss', () => {
    expect(raycastHit(arena, origin, { x: -1, y: 0, z: 0 }, 50)).toBeNull();
  });
});

describe('worldRay', () => {
  const origin = { x: 5, y: 1.5, z: 10 };

  it('hits the floor', () => {
    const hit = worldRay(arena, origin, { x: 0, y: -1, z: 0 }, 50)!;
    expect(hit.dist).toBeCloseTo(1.5, 3);
    expect(hit.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('hits the ceiling of the bounds, marked as an invisible surface', () => {
    const hit = worldRay(arena, origin, { x: 0, y: 1, z: 0 }, 50)!;
    expect(hit.dist).toBeCloseTo(4.5, 3);
    expect(hit.normal).toEqual({ x: 0, y: -1, z: 0 });
    expect(hit.bounds).toBe(true);
  });

  it('marks the floor and solids as visible surfaces', () => {
    expect(worldRay(arena, origin, { x: 0, y: -1, z: 0 }, 50)!.bounds).toBeFalsy();
    expect(worldRay(arena, origin, { x: 1, y: 0, z: 0 }, 50)!.bounds).toBeFalsy();
  });

  it('hits the side of the bounds in open space', () => {
    const hit = worldRay(arena, origin, { x: -1, y: 0, z: 0 }, 50)!;
    expect(hit.dist).toBeCloseTo(5, 3);
    expect(hit.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(hit.bounds).toBe(true);
  });

  it('prefers a solid that is closer than the bounds', () => {
    const hit = worldRay(arena, origin, { x: 1, y: 0, z: 0 }, 50)!;
    expect(hit.dist).toBeCloseTo(5, 3);
    expect(hit.normal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('returns null when nothing is within maxDist', () => {
    expect(worldRay(arena, origin, { x: -1, y: 0, z: 0 }, 3)).toBeNull();
  });
});

describe('moveBody inertia', () => {
  const TICK = 1 / 60;
  const speedOf = (b: Body) => Math.hypot(b.vel.x, b.vel.z);
  const advance = (
    b: Body,
    wish: { x: number; z: number },
    ms: number,
    opts: { jump?: boolean; crouch?: boolean; walk?: boolean } = {},
  ): Body => {
    let cur = b;
    for (let t = 0; t < ms - 1e-6; t += 1000 * TICK) {
      cur = moveBody(arena, cur, wish, opts.jump ?? false, opts.crouch ?? false, 1, TICK, opts.walk ?? false);
    }
    return cur;
  };

  it('accelerates instead of jumping to full speed', () => {
    const early = advance(body(2, 0, 10), { x: 0, z: 1 }, 50);
    expect(speedOf(early)).toBeGreaterThan(0);
    expect(speedOf(early)).toBeLessThan(RUN_SPEED * 0.8);
    expect(speedOf(advance(body(2, 0, 10), { x: 0, z: 1 }, 300))).toBeCloseTo(RUN_SPEED, 1);
  });

  it('keeps sliding for a moment after the keys are released, then stops', () => {
    const running = advance(body(2, 0, 5), { x: 0, z: 1 }, 400);
    const brief = advance(running, { x: 0, z: 0 }, 20);
    expect(speedOf(brief)).toBeGreaterThan(0.5);
    expect(speedOf(advance(running, { x: 0, z: 0 }, 250))).toBe(0);
  });

  it('keeps its momentum in the air with no key held', () => {
    const running = advance(body(2, 0, 3), { x: 0, z: 1 }, 400);
    const takeoff = advance(running, { x: 0, z: 1 }, 50, { jump: true });
    const airborne = advance(takeoff, { x: 0, z: 0 }, 150);
    expect(airborne.onGround).toBe(false);
    expect(speedOf(airborne)).toBeGreaterThan(RUN_SPEED * 0.9);
  });

  it('cannot reverse at once in the air', () => {
    const running = advance(body(2, 0, 3), { x: 0, z: 1 }, 400);
    const airborne = advance(running, { x: 0, z: 1 }, 60, { jump: true });
    const pulled = advance(airborne, { x: 0, z: -1 }, 100);
    expect(pulled.vel.z).toBeGreaterThan(RUN_SPEED - AIR_ACCEL * 0.1 - 0.5);
  });

  it('walks slower than running', () => {
    expect(speedOf(advance(body(2, 0, 10), { x: 0, z: 1 }, 500, { walk: true }))).toBeCloseTo(WALK_SPEED, 1);
    expect(WALK_SPEED).toBeLessThan(RUN_SPEED);
  });

  it('crouching is slower than walking', () => {
    expect(speedOf(advance(body(2, 0, 10), { x: 0, z: 1 }, 500, { crouch: true, walk: true }))).toBeCloseTo(CROUCH_SPEED, 1);
  });

  it('loses the velocity that points into a wall', () => {
    const end = run(body(5, 0, 10), { x: 1, z: 0 }, 2);
    expect(end.vel.x).toBe(0);
  });
});
