import type { MapDef } from '../../src/cs/map.js';
import { CANTINA } from '../../src/cs/maps/cantina.js';
import {
  BUY_MS,
  IDLE_INPUT,
  createWorld,
  stepWorld,
  type PlayerInput,
  type RosterEntry,
  type SimPlayer,
  type World,
  type WorldEvent,
} from '../../src/cs/sim.js';

export const roster2v2: RosterEntry[] = [
  { id: 'a1', name: 'A1', team: 'A', bot: false, money: 800, weapon: 'chinelo' },
  { id: 'a2', name: 'A2', team: 'A', bot: false, money: 800, weapon: 'chinelo' },
  { id: 'b1', name: 'B1', team: 'B', bot: false, money: 800, weapon: 'chinelo' },
  { id: 'b2', name: 'B2', team: 'B', bot: false, money: 800, weapon: 'chinelo' },
];

/** Rodada 0 na Cantina: o time A ataca e o time B defende. */
export function makeWorld(map: MapDef = CANTINA, roster: RosterEntry[] = roster2v2, rng = 1234): World {
  return createWorld(map, 0, roster, rng);
}

export function player(world: World, id: string): SimPlayer {
  const found = world.players.find((p) => p.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
}

export function patchPlayer(world: World, id: string, patch: Partial<SimPlayer>): World {
  return { ...world, players: world.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function teleport(world: World, id: string, x: number, z: number, y = 0): World {
  const p = player(world, id);
  return patchPlayer(world, id, { body: { ...p.body, pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, onGround: y === 0 } });
}

export function kill(world: World, id: string): World {
  return patchPlayer(world, id, { alive: false, hp: 0 });
}

export function input(patch: Partial<PlayerInput> = {}): PlayerInput {
  return { ...IDLE_INPUT, ...patch };
}

/** Avança `ms` em passos de `stepMs`, juntando todos os eventos emitidos. */
export function run(
  world: World,
  inputs: Record<string, PlayerInput>,
  ms: number,
  stepMs = 50,
): { world: World; events: WorldEvent[] } {
  let current = world;
  const events: WorldEvent[] = [];
  for (let t = 0; t < ms; t += stepMs) {
    current = stepWorld(current, inputs, stepMs);
    events.push(...current.events);
  }
  return { world: current, events };
}

export function skipBuy(world: World): World {
  return stepWorld(world, {}, BUY_MS);
}
