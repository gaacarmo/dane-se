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
export const WALK_SPEED = 2.9;
/** Aceleração (m/s²) com tecla pressionada no chão, atrito sem tecla no chão e controle no ar. */
export const GROUND_ACCEL = 60;
export const GROUND_FRICTION = 50;
export const AIR_ACCEL = 8;

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
  walk = false,
): Body {
  const height = crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;
  const norm = Math.hypot(wish.x, wish.z);
  const scale = norm > 1 ? 1 / norm : 1;
  const speed = (crouch ? CROUCH_SPEED : walk ? WALK_SPEED : RUN_SPEED) * speedMult;
  const hasInput = norm > 1e-3;
  const rate = body.onGround ? (hasInput ? GROUND_ACCEL : GROUND_FRICTION) : hasInput ? AIR_ACCEL : 0;
  let vx = body.vel.x;
  let vz = body.vel.z;
  const dvx = wish.x * scale * speed - vx;
  const dvz = wish.z * scale * speed - vz;
  const gap = Math.hypot(dvx, dvz);
  const maxDelta = rate * dt;
  if (gap <= maxDelta) {
    vx += dvx;
    vz += dvz;
  } else {
    vx += (dvx / gap) * maxDelta;
    vz += (dvz / gap) * maxDelta;
  }

  let vy = body.vel.y;
  if (jump && body.onGround) vy = JUMP_SPEED;
  vy -= GRAVITY * dt;

  const pos = { ...body.pos };
  const b = map.bounds;

  const wantedX = pos.x + vx * dt;
  pos.x = clamp(wantedX, b.min.x + PLAYER_RADIUS, b.max.x - PLAYER_RADIUS);
  for (const solid of map.solids) {
    if (!overlaps(pos, height, solid)) continue;
    pos.x = vx > 0 ? solid.min.x - PLAYER_RADIUS - EPS : solid.max.x + PLAYER_RADIUS + EPS;
  }
  if (Math.abs(pos.x - wantedX) > 1e-9) vx = 0;

  const wantedZ = pos.z + vz * dt;
  pos.z = clamp(wantedZ, b.min.z + PLAYER_RADIUS, b.max.z - PLAYER_RADIUS);
  for (const solid of map.solids) {
    if (!overlaps(pos, height, solid)) continue;
    pos.z = vz > 0 ? solid.min.z - PLAYER_RADIUS - EPS : solid.max.z + PLAYER_RADIUS + EPS;
  }
  if (Math.abs(pos.z - wantedZ) > 1e-9) vz = 0;

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

export interface RayHit {
  dist: number;
  /** Normal da face atingida, apontando para o lado de onde o raio veio. */
  normal: Vec3;
}

function unit(dir: Vec3): Vec3 | null {
  const length = Math.hypot(dir.x, dir.y, dir.z);
  return length === 0 ? null : { x: dir.x / length, y: dir.y / length, z: dir.z / length };
}

/** Primeiro sólido atingido pelo raio (slab method), com a normal da face. */
export function raycastHit(map: MapDef, origin: Vec3, dir: Vec3, maxDist: number): RayHit | null {
  const d = unit(dir);
  if (!d) return null;
  let nearest: RayHit | null = null;
  for (const solid of map.solids) {
    const hit = rayBoxHit(origin, d, solid, maxDist);
    if (hit && (!nearest || hit.dist < nearest.dist)) nearest = hit;
  }
  return nearest;
}

/** Distância até o primeiro sólido ao longo do raio, ou null. */
export function raycast(map: MapDef, origin: Vec3, dir: Vec3, maxDist: number): number | null {
  return raycastHit(map, origin, dir, maxDist)?.dist ?? null;
}

/** Como `raycastHit`, mas também para no chão, no teto e nas paredes dos limites do mapa. */
export function worldRay(map: MapDef, origin: Vec3, dir: Vec3, maxDist: number): RayHit | null {
  const d = unit(dir);
  if (!d) return null;
  let best = raycastHit(map, origin, d, maxDist);
  const { min, max } = map.bounds;
  const consider = (t: number, normal: Vec3) => {
    if (t >= 0 && t <= maxDist && (!best || t < best.dist)) best = { dist: t, normal };
  };
  if (d.y < -1e-9) consider((min.y - origin.y) / d.y, { x: 0, y: 1, z: 0 });
  if (d.y > 1e-9) consider((max.y - origin.y) / d.y, { x: 0, y: -1, z: 0 });
  if (d.x > 1e-9) consider((max.x - origin.x) / d.x, { x: -1, y: 0, z: 0 });
  if (d.x < -1e-9) consider((min.x - origin.x) / d.x, { x: 1, y: 0, z: 0 });
  if (d.z > 1e-9) consider((max.z - origin.z) / d.z, { x: 0, y: 0, z: -1 });
  if (d.z < -1e-9) consider((min.z - origin.z) / d.z, { x: 0, y: 0, z: 1 });
  return best;
}

export function rayBoxHit(origin: Vec3, dir: Vec3, box: Box, maxDist: number): RayHit | null {
  let tMin = 0;
  let tMax = maxDist;
  let entered: 'x' | 'y' | 'z' | null = null;
  let sign = 0;
  for (const axis of ['x', 'y', 'z'] as const) {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
      continue;
    }
    const t1 = (box.min[axis] - o) / d;
    const t2 = (box.max[axis] - o) / d;
    const near = Math.min(t1, t2);
    if (near > tMin) {
      tMin = near;
      entered = axis;
      sign = d > 0 ? -1 : 1;
    }
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return null;
  }
  const normal = { x: 0, y: 0, z: 0 };
  if (entered) normal[entered] = sign;
  return { dist: tMin, normal };
}

export function rayBoxDistance(origin: Vec3, dir: Vec3, box: Box, maxDist: number): number | null {
  return rayBoxHit(origin, dir, box, maxDist)?.dist ?? null;
}
