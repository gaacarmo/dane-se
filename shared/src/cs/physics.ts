import type { Box, MapDef } from './map.js';
import type { Vec3 } from './types.js';

export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.3;
export const EYE_OFFSET = 0.15;
export const RUN_SPEED = 5.5;
export const CROUCH_SPEED = 2.5;
export const GRAVITY = 20;
export const JUMP_SPEED = 6.5;

const EPS = 1e-4;

export interface Body {
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
  crouch: boolean;
}

export function bodyHeight(body: Pick<Body, 'crouch'>): number {
  return body.crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;
}

export function eyePos(body: Body): Vec3 {
  return { x: body.pos.x, y: body.pos.y + bodyHeight(body) - EYE_OFFSET, z: body.pos.z };
}

function overlaps(pos: Vec3, height: number, solid: Box): boolean {
  return (
    pos.x + PLAYER_RADIUS > solid.min.x && pos.x - PLAYER_RADIUS < solid.max.x &&
    pos.z + PLAYER_RADIUS > solid.min.z && pos.z - PLAYER_RADIUS < solid.max.z &&
    pos.y + height > solid.min.y && pos.y < solid.max.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function moveBody(
  map: MapDef,
  body: Body,
  wish: { x: number; z: number },
  jump: boolean,
  crouch: boolean,
  speedMult: number,
  dt: number,
): Body {
  const height = crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;
  const norm = Math.hypot(wish.x, wish.z);
  const scale = norm > 1 ? 1 / norm : 1;
  const speed = (crouch ? CROUCH_SPEED : RUN_SPEED) * speedMult;
  const vx = wish.x * scale * speed;
  const vz = wish.z * scale * speed;

  let vy = body.vel.y;
  if (jump && body.onGround) vy = JUMP_SPEED;
  vy -= GRAVITY * dt;

  const pos = { ...body.pos };
  const b = map.bounds;

  pos.x = clamp(pos.x + vx * dt, b.min.x + PLAYER_RADIUS, b.max.x - PLAYER_RADIUS);
  for (const solid of map.solids) {
    if (!overlaps(pos, height, solid)) continue;
    pos.x = vx > 0 ? solid.min.x - PLAYER_RADIUS - EPS : solid.max.x + PLAYER_RADIUS + EPS;
  }

  pos.z = clamp(pos.z + vz * dt, b.min.z + PLAYER_RADIUS, b.max.z - PLAYER_RADIUS);
  for (const solid of map.solids) {
    if (!overlaps(pos, height, solid)) continue;
    pos.z = vz > 0 ? solid.min.z - PLAYER_RADIUS - EPS : solid.max.z + PLAYER_RADIUS + EPS;
  }

  const previousY = pos.y;
  pos.y += vy * dt;
  let onGround = false;
  if (pos.y <= b.min.y) {
    pos.y = b.min.y;
    vy = 0;
    onGround = true;
  }
  for (const solid of map.solids) {
    if (!overlaps(pos, height, solid)) continue;
    if (vy <= 0 && previousY >= solid.max.y - EPS) {
      pos.y = solid.max.y;
      vy = 0;
      onGround = true;
    } else if (vy > 0) {
      pos.y = solid.min.y - height - EPS;
      vy = 0;
    }
  }
  pos.y = Math.min(pos.y, b.max.y - height);

  return { pos, vel: { x: vx, y: vy, z: vz }, onGround, crouch };
}

/** Distância até o primeiro sólido ao longo do raio (slab method), ou null. */
export function raycast(map: MapDef, origin: Vec3, dir: Vec3, maxDist: number): number | null {
  const length = Math.hypot(dir.x, dir.y, dir.z);
  if (length === 0) return null;
  const d = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
  let nearest: number | null = null;
  for (const solid of map.solids) {
    const hit = rayBoxDistance(origin, d, solid, maxDist);
    if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
  }
  return nearest;
}

export function rayBoxDistance(origin: Vec3, dir: Vec3, box: Box, maxDist: number): number | null {
  let tMin = 0;
  let tMax = maxDist;
  for (const axis of ['x', 'y', 'z'] as const) {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
      continue;
    }
    let t1 = (box.min[axis] - o) / d;
    let t2 = (box.max[axis] - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}
