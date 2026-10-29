import type { MapDef } from '../../src/cs/map.js';
import { CANTINA } from '../../src/cs/maps/cantina.js';
import { botInput, createBotMemory, type BotMemory, type BotSkill } from '../../src/cs/bot.js';
import { WEAPONS, type WeaponId } from '../../src/cs/weapons.js';
import {
  BUY_MS,
  IDLE_INPUT,
  PLANT_MS,
  PREP_MS,
  aimAt,
  createWorld,
  stepWorld,
  type PlayerInput,
  type RosterEntry,
  type SimPlayer,
  type World,
  type WorldEvent,
} from '../../src/cs/sim.js';

export const roster2v2: RosterEntry[] = [
  { id: 'a1', name: 'A1', team: 'A', bot: false, character: 'carmelo', money: 800, weapon: 'chinelo' },
  { id: 'a2', name: 'A2', team: 'A', bot: false, character: 'martelo', money: 800, weapon: 'chinelo' },
  { id: 'b1', name: 'B1', team: 'B', bot: false, character: 'babin', money: 800, weapon: 'chinelo' },
  { id: 'b2', name: 'B2', team: 'B', bot: false, character: 'dezin', money: 800, weapon: 'chinelo' },
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

export type InputSource = PlayerInput | ((world: World) => PlayerInput);

/** Avança `ms` em passos de `stepMs`, juntando todos os eventos emitidos. */
export function run(
  world: World,
  inputs: Record<string, InputSource>,
  ms: number,
  stepMs = 50,
): { world: World; events: WorldEvent[] } {
  let current = world;
  const events: WorldEvent[] = [];
  for (let t = 0; t < ms; t += stepMs) {
    const resolved: Record<string, PlayerInput> = {};
    for (const [id, source] of Object.entries(inputs)) resolved[id] = typeof source === 'function' ? source(current) : source;
    current = stepWorld(current, resolved, stepMs);
    events.push(...current.events);
  }
  return { world: current, events };
}

/** Atravessa a compra e a preparação: devolve a rodada já ao vivo. */
export function skipBuy(world: World): World {
  return stepWorld(stepWorld(world, {}, BUY_MS), {}, PREP_MS);
}

/** Atravessa só a compra: devolve a rodada no começo da preparação. */
export function skipToPrep(world: World): World {
  return stepWorld(world, {}, BUY_MS);
}

const arenaBox = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => ({
  min: { x: x1, y: y1, z: z1 },
  max: { x: x2, y: y2, z: z2 },
});

/** Arena aberta 40 × 30 m, sem cobertura, para testes de tiro. */
export const arenaMap: MapDef = {
  id: 'arena',
  name: 'Arena',
  bounds: arenaBox(0, 0, 0, 40, 6, 30),
  solids: [],
  sites: { A: arenaBox(2, 0, 2, 6, 3, 6), B: arenaBox(34, 0, 24, 38, 3, 28) },
  spawns: {
    attack: [{ x: 3, y: 0, z: 28 }, { x: 5, y: 0, z: 28 }, { x: 7, y: 0, z: 28 }],
    defense: [{ x: 33, y: 0, z: 2 }, { x: 35, y: 0, z: 2 }, { x: 37, y: 0, z: 2 }],
  },
  waypoints: [{ x: 5, y: 0, z: 25 }, { x: 35, y: 0, z: 5 }],
  links: [[0, 1]],
};

export const wallArena: MapDef = { ...arenaMap, id: 'wall-arena', solids: [arenaBox(0, 0, 4.9, 40, 4, 5.1)] };

const ZONE_FRACTION = { head: 0.91, body: 0.64, legs: 0.22 } as const;

/** Input que mira o centro da zona do alvo, com as outras teclas em `patch`. */
export function aimInput(
  world: World,
  shooterId: string,
  targetId: string,
  zone: keyof typeof ZONE_FRACTION,
  patch: Partial<PlayerInput> = {},
): PlayerInput {
  const shooter = player(world, shooterId);
  const target = player(world, targetId);
  const eye = { x: shooter.body.pos.x, y: shooter.body.pos.y + 1.65, z: shooter.body.pos.z };
  const point = { x: target.body.pos.x, y: target.body.pos.y + 1.8 * ZONE_FRACTION[zone], z: target.body.pos.z };
  const look = aimAt(eye, point);
  return input({ yaw: look.yaw, pitch: look.pitch, ...patch });
}

/** Rodada ao vivo na arena com a1 em (10, 10) e b1 em (10, 0), olho no olho. */
export function duel(map: MapDef = arenaMap, weapon: WeaponId = 'tabelinha'): World {
  let world = skipBuy(makeWorld(map));
  world = teleport(world, 'a1', 10, 10);
  world = teleport(world, 'b1', 10, 0);
  return patchPlayer(world, 'a1', { weapon, ammo: WEAPONS[weapon].magSize, reserve: 90 });
}

/** Roda os bots indicados (e `extra` para os demais) por `ms`, em passos de `stepMs`. */
export function runBots(
  world: World,
  botIds: string[],
  ms: number,
  opts: {
    stepMs?: number;
    seed?: number;
    skill?: BotSkill;
    extra?: Record<string, PlayerInput>;
    stopWhen?: (w: World) => boolean;
  } = {},
): { world: World; events: WorldEvent[]; memories: Record<string, BotMemory>; elapsedMs: number } {
  const stepMs = opts.stepMs ?? 50;
  const memories: Record<string, BotMemory> = {};
  botIds.forEach((id, i) => (memories[id] = createBotMemory((opts.seed ?? 1) + i * 7, opts.skill)));
  let current = world;
  let elapsedMs = 0;
  const events: WorldEvent[] = [];
  for (let t = 0; t < ms; t += stepMs) {
    const inputs: Record<string, PlayerInput> = { ...(opts.extra ?? {}) };
    for (const id of botIds) {
      const out = botInput(current, id, memories[id]!, stepMs);
      inputs[id] = out.input;
      memories[id] = out.memory;
    }
    current = stepWorld(current, inputs, stepMs);
    elapsedMs += stepMs;
    events.push(...current.events);
    if (opts.stopWhen?.(current)) break;
  }
  return { world: current, events, memories, elapsedMs };
}

/** Input que mira um ponto qualquer do mundo, com as outras teclas em `patch`. */
export function aimPoint(
  world: World,
  shooterId: string,
  point: { x: number; y: number; z: number },
  patch: Partial<PlayerInput> = {},
): PlayerInput {
  const shooter = player(world, shooterId);
  const eye = { x: shooter.body.pos.x, y: shooter.body.pos.y + 1.65, z: shooter.body.pos.z };
  const look = aimAt(eye, point);
  return input({ yaw: look.yaw, pitch: look.pitch, ...patch });
}

/** Como `aimInput`, refeito a cada passo e subtraindo o recuo atual, como um jogador que controla a rajada. */
export function aimer(
  shooterId: string,
  targetId: string,
  zone: keyof typeof ZONE_FRACTION,
  patch: Partial<PlayerInput> = {},
): (world: World) => PlayerInput {
  return (world) => {
    const base = aimInput(world, shooterId, targetId, zone, patch);
    const shooter = player(world, shooterId);
    return { ...base, yaw: base.yaw - shooter.punchYaw, pitch: base.pitch - shooter.punchPitch };
  };
}

const siteA = CANTINA.sites.A;
export const siteACenter = { x: (siteA.min.x + siteA.max.x) / 2, z: (siteA.min.z + siteA.max.z) / 2 };

export function carrierId(world: World): string {
  return world.players.find((p) => p.hasBomb)!.id;
}

/** Rodada ao vivo com a bomba plantada no site A pelo portador. */
export function plantedWorld(): World {
  let world = skipBuy(makeWorld());
  const id = carrierId(world);
  world = teleport(world, id, siteACenter.x, siteACenter.z);
  world = run(world, { [id]: input({ use: true }) }, PLANT_MS + 100).world;
  if (world.bomb.status !== 'planted') throw new Error('the bomb should be planted');
  return world;
}
