import { randomInt } from '../rng.js';
import { raycast } from './physics.js';
import { CANTINA } from './maps/cantina.js';
import type { Side, Vec3 } from './types.js';

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface MapDef {
  id: string;
  name: string;
  bounds: Box;
  solids: Box[];
  sites: Record<'A' | 'B', Box>;
  spawns: Record<Side, Vec3[]>;
  waypoints: Vec3[];
  links: [number, number][];
  /** Portão que separa os times durante a compra e a preparação; cai quando a rodada vai ao vivo. */
  barrier?: Box;
  /** Onde os atacantes esperam antes de entrar. */
  stage?: Vec3;
}

export const MAPS: readonly MapDef[] = [CANTINA];

const withBarrierCache = new WeakMap<MapDef, MapDef>();

/** O mapa como ele é enquanto o portão de preparação está de pé: o portão vira mais um sólido. */
export function withBarrier(map: MapDef): MapDef {
  if (!map.barrier) return map;
  let effective = withBarrierCache.get(map);
  if (!effective) {
    effective = { ...map, solids: [...map.solids, map.barrier] };
    withBarrierCache.set(map, effective);
  }
  return effective;
}

const MIN_SPAWNS = 3;
const WAYPOINT_REACH = 3;
/** Folga lateral que um trajeto entre waypoints precisa ter dos sólidos (o raio do corpo). */
const LINK_CLEARANCE = 0.35;

export function pointInBox(p: Vec3, box: Box): boolean {
  return (
    p.x >= box.min.x && p.x <= box.max.x &&
    p.y >= box.min.y && p.y <= box.max.y &&
    p.z >= box.min.z && p.z <= box.max.z
  );
}

function boxCenter(box: Box): Vec3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}

function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** O trajeto reto entre dois pontos passa livre, com folga do tamanho do corpo dos dois lados. */
function linkIsClear(map: MapDef, from: Vec3, to: Vec3): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const side = { x: (-dz / length) * LINK_CLEARANCE, z: (dx / length) * LINK_CLEARANCE };
  return [-1, 0, 1].every((k) => {
    const origin = { x: from.x + side.x * k, y: 0.5, z: from.z + side.z * k };
    return raycast(map, origin, { x: dx, y: 0, z: dz }, length) === null;
  });
}

/** Lista de problemas do mapa; vazia quando ele está válido. */
export function validateMap(map: MapDef): string[] {
  const problems: string[] = [];
  const waist = (p: Vec3): Vec3 => ({ x: p.x, y: p.y + 0.5, z: p.z });

  for (const side of ['attack', 'defense'] as const) {
    const spawns = map.spawns[side];
    if (spawns.length < MIN_SPAWNS) problems.push(`menos de ${MIN_SPAWNS} spawns em ${side}`);
    spawns.forEach((spawn, i) => {
      if (map.solids.some((solid) => pointInBox(waist(spawn), solid))) problems.push(`spawn ${side}[${i}] dentro de sólido`);
      if (!pointInBox(waist(spawn), map.bounds)) problems.push(`spawn ${side}[${i}] fora dos limites`);
      if (map.barrier && pointInBox(waist(spawn), map.barrier)) problems.push(`spawn ${side}[${i}] dentro do portão (barrier)`);
    });
  }

  for (const key of ['A', 'B'] as const) {
    const center = boxCenter(map.sites[key]);
    if (!pointInBox(center, map.bounds)) problems.push(`site ${key} fora dos limites`);
  }

  const count = map.waypoints.length;
  const badLink = map.links.some(([a, b]) => !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= count || b >= count);
  if (badLink) problems.push('link com índice de waypoint inválido');

  if (count === 0) {
    problems.push('mapa sem waypoints');
  } else if (!badLink) {
    const adjacent: number[][] = map.waypoints.map(() => []);
    for (const [a, b] of map.links) {
      adjacent[a]!.push(b);
      adjacent[b]!.push(a);
    }
    for (const [a, b] of map.links) {
      if (!linkIsClear(map, map.waypoints[a]!, map.waypoints[b]!)) problems.push(`link ${a}-${b} atravessa um sólido`);
    }

    const seen = new Set<number>([0]);
    const queue = [0];
    for (let head = 0; head < queue.length; head++) {
      for (const next of adjacent[queue[head]!]!) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    if (seen.size !== count) problems.push('grafo de waypoints desconexo');

    const reachable = (p: Vec3) => map.waypoints.some((w) => distanceXZ(w, p) <= WAYPOINT_REACH);
    for (const side of ['attack', 'defense'] as const) {
      map.spawns[side].forEach((spawn, i) => {
        if (!reachable(spawn)) problems.push(`spawn ${side}[${i}] longe dos waypoints`);
      });
    }
    for (const key of ['A', 'B'] as const) {
      if (!reachable(boxCenter(map.sites[key]))) problems.push(`site ${key} longe dos waypoints`);
    }
    if (map.stage && !reachable(map.stage)) problems.push('ponto de espera (stage) longe dos waypoints');
  }

  return problems;
}

export function drawMap(rng: number): { map: MapDef; rng: number } {
  const pick = randomInt(rng, MAPS.length);
  return { map: MAPS[pick.value]!, rng: pick.state };
}
