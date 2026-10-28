import { randomInt } from '../rng.js';
import { DEFUSE_REWARD, PLANT_REWARD, addMoney } from './economy.js';
import { sideOf } from './match.js';
import type { Box, MapDef } from './map.js';
import { moveBody, type Body } from './physics.js';
import type { Side, TeamId, Vec3 } from './types.js';
import { WEAPONS, type WeaponId } from './weapons.js';

export const BUY_MS = 15_000;
export const LIVE_MS = 300_000;
export const BOMB_MS = 40_000;
export const PLANT_MS = 3_200;
export const DEFUSE_MS = 7_000;
export const MAX_HP = 100;

const BOMB_REACH = 1.5;
const STILL_INPUT = 0.05;

export type RoundPhase = 'buy' | 'live' | 'over';

/** Convenção da câmera do three: yaw 0 olha para -z; moveX vai para a direita e moveZ para a frente. */
export interface PlayerInput {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  crouch: boolean;
  fire: boolean;
  reload: boolean;
  use: boolean;
}

export const IDLE_INPUT: PlayerInput = {
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  crouch: false,
  fire: false,
  reload: false,
  use: false,
};

export interface SimPlayer {
  id: string;
  name: string;
  team: TeamId;
  side: Side;
  bot: boolean;
  alive: boolean;
  hp: number;
  body: Body;
  yaw: number;
  pitch: number;
  weapon: WeaponId;
  ammo: number;
  reserve: number;
  reloadLeftMs: number;
  cooldownMs: number;
  shots: number;
  money: number;
  hasBomb: boolean;
}

export interface BombState {
  status: 'carried' | 'planted' | 'defused' | 'exploded';
  /** Posição da bomba plantada, ou onde ela caiu quando ninguém a carrega. */
  pos: Vec3 | null;
  site: 'A' | 'B' | null;
  explodeInMs: number;
  planterId: string | null;
  progress: { who: string; ms: number } | null;
}

export type RoundEnd = { winner: TeamId; reason: 'elimination' | 'explosion' | 'defuse' | 'time' };

export type WorldEvent =
  | { type: 'kill'; killer: string; victim: string; headshot: boolean }
  | { type: 'plant'; by: string; site: 'A' | 'B' }
  | { type: 'defuse'; by: string }
  | { type: 'explode' }
  | { type: 'roundEnd'; end: RoundEnd };

export interface World {
  map: MapDef;
  roundIndex: number;
  phase: RoundPhase;
  phaseLeftMs: number;
  players: SimPlayer[];
  bomb: BombState;
  end: RoundEnd | null;
  rng: number;
  events: WorldEvent[];
}

export interface RosterEntry {
  id: string;
  name: string;
  team: TeamId;
  bot: boolean;
  money: number;
  weapon: WeaponId;
}

export const RESERVE_MAGS = 2;

/** Yaw e pitch para olhar de `from` até `to`. */
export function aimAt(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

export function lookDirection(yaw: number, pitch: number): Vec3 {
  const horizontal = Math.cos(pitch);
  return { x: -Math.sin(yaw) * horizontal, y: Math.sin(pitch), z: -Math.cos(yaw) * horizontal };
}

export function createWorld(map: MapDef, roundIndex: number, roster: RosterEntry[], rng: number): World {
  const center = {
    x: (map.bounds.min.x + map.bounds.max.x) / 2,
    y: 1.6,
    z: (map.bounds.min.z + map.bounds.max.z) / 2,
  };
  const used: Record<Side, number> = { attack: 0, defense: 0 };
  const players: SimPlayer[] = roster.map((entry) => {
    const side = sideOf(entry.team, roundIndex);
    const spawns = map.spawns[side];
    const spawn = spawns[used[side]++ % spawns.length]!;
    const weapon = WEAPONS[entry.weapon];
    const look = aimAt({ ...spawn, y: 1.6 }, center);
    return {
      id: entry.id,
      name: entry.name,
      team: entry.team,
      side,
      bot: entry.bot,
      alive: true,
      hp: MAX_HP,
      body: { pos: { ...spawn }, vel: { x: 0, y: 0, z: 0 }, onGround: true, crouch: false },
      yaw: look.yaw,
      pitch: 0,
      weapon: entry.weapon,
      ammo: weapon.magSize,
      reserve: weapon.magSize * RESERVE_MAGS,
      reloadLeftMs: 0,
      cooldownMs: 0,
      shots: 0,
      money: entry.money,
      hasBomb: false,
    };
  });

  const attackers = players.filter((p) => p.side === 'attack');
  let nextRng = rng;
  if (attackers.length > 0) {
    const pick = randomInt(nextRng, attackers.length);
    nextRng = pick.state;
    attackers[pick.value]!.hasBomb = true;
  }

  return {
    map,
    roundIndex,
    phase: 'buy',
    phaseLeftMs: BUY_MS,
    players,
    bomb: { status: 'carried', pos: null, site: null, explodeInMs: 0, planterId: null, progress: null },
    end: null,
    rng: nextRng,
    events: [],
  };
}

function inSite(box: Box, pos: Vec3): boolean {
  return pos.x >= box.min.x && pos.x <= box.max.x && pos.z >= box.min.z && pos.z <= box.max.z;
}

function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function teamOfSide(world: World, side: Side): TeamId {
  return world.players.find((p) => p.side === side)!.team;
}

function finish(world: World, winnerSide: Side, reason: RoundEnd['reason']): void {
  const end: RoundEnd = { winner: teamOfSide(world, winnerSide), reason };
  world.end = end;
  world.phase = 'over';
  world.events.push({ type: 'roundEnd', end });
}

function isStill(input: PlayerInput): boolean {
  return Math.abs(input.moveX) < STILL_INPUT && Math.abs(input.moveZ) < STILL_INPUT;
}

export function stepWorld(world: World, inputs: Record<string, PlayerInput>, dtMs: number): World {
  if (world.phase === 'over') return { ...world, events: [] };

  const next: World = {
    ...world,
    players: world.players.map((p) => ({ ...p })),
    bomb: { ...world.bomb, progress: world.bomb.progress ? { ...world.bomb.progress } : null },
    events: [],
  };
  const dt = dtMs / 1000;
  const live = next.phase === 'live';

  for (const p of next.players) {
    if (!p.alive) continue;
    const input = inputs[p.id] ?? IDLE_INPUT;
    p.yaw = input.yaw;
    p.pitch = Math.max(-1.5, Math.min(1.5, input.pitch));
    if (!live) continue;
    const forward = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    const wish = {
      x: right.x * input.moveX + forward.x * input.moveZ,
      z: right.z * input.moveX + forward.z * input.moveZ,
    };
    p.body = moveBody(next.map, p.body, wish, input.jump, input.crouch, WEAPONS[p.weapon].moveSpeedMult, dt);
  }

  if (next.phase === 'buy') {
    next.phaseLeftMs -= dtMs;
    if (next.phaseLeftMs <= 0) {
      next.phase = 'live';
      next.phaseLeftMs = LIVE_MS;
    }
    return next;
  }

  next.phaseLeftMs -= dtMs;
  stepBomb(next, inputs, dtMs);
  if (next.phase === 'over') return next;
  checkRoundEnd(next);
  return next;
}

function stepBomb(world: World, inputs: Record<string, PlayerInput>, dtMs: number): void {
  const bomb = world.bomb;
  const input = (id: string) => inputs[id] ?? IDLE_INPUT;

  if (bomb.status === 'carried') {
    const carrier = world.players.find((p) => p.hasBomb);
    if (carrier && !carrier.alive) {
      carrier.hasBomb = false;
      bomb.pos = { ...carrier.body.pos };
      bomb.progress = null;
    }
    if (!world.players.some((p) => p.hasBomb) && bomb.pos) {
      const finder = world.players.find((p) => p.alive && p.side === 'attack' && distanceXZ(p.body.pos, bomb.pos!) <= BOMB_REACH);
      if (finder) {
        finder.hasBomb = true;
        bomb.pos = null;
      }
    }

    const planter = world.players.find((p) => p.hasBomb && p.alive);
    const site = planter ? (['A', 'B'] as const).find((key) => inSite(world.map.sites[key], planter.body.pos)) : undefined;
    const planting = planter && site && planter.body.onGround && input(planter.id).use && isStill(input(planter.id));
    if (!planter || !planting) {
      bomb.progress = null;
      return;
    }
    const ms = (bomb.progress?.who === planter.id ? bomb.progress.ms : 0) + dtMs;
    if (ms >= PLANT_MS) {
      bomb.status = 'planted';
      bomb.pos = { ...planter.body.pos };
      bomb.site = site;
      bomb.explodeInMs = BOMB_MS;
      bomb.planterId = planter.id;
      bomb.progress = null;
      planter.hasBomb = false;
      planter.money = addMoney(planter.money, PLANT_REWARD);
      world.events.push({ type: 'plant', by: planter.id, site });
    } else {
      bomb.progress = { who: planter.id, ms };
    }
    return;
  }

  if (bomb.status !== 'planted' || !bomb.pos) return;

  const defuser = world.players.find(
    (p) =>
      p.alive &&
      p.side === 'defense' &&
      input(p.id).use &&
      isStill(input(p.id)) &&
      distanceXZ(p.body.pos, bomb.pos!) <= BOMB_REACH,
  );
  const progressMs = defuser ? (bomb.progress?.who === defuser.id ? bomb.progress.ms : 0) + dtMs : 0;
  bomb.progress = defuser ? { who: defuser.id, ms: progressMs } : null;
  const remaining = bomb.explodeInMs - dtMs;

  if (defuser && progressMs >= DEFUSE_MS && remaining > 0) {
    bomb.status = 'defused';
    bomb.progress = null;
    defuser.money = addMoney(defuser.money, DEFUSE_REWARD);
    world.events.push({ type: 'defuse', by: defuser.id });
    finish(world, 'defense', 'defuse');
    return;
  }

  bomb.explodeInMs = Math.max(0, remaining);
  if (remaining <= 0) {
    bomb.status = 'exploded';
    bomb.progress = null;
    world.events.push({ type: 'explode' });
    finish(world, 'attack', 'explosion');
  }
}

function checkRoundEnd(world: World): void {
  const planted = world.bomb.status === 'planted';
  const attackersAlive = world.players.some((p) => p.side === 'attack' && p.alive);
  const defendersAlive = world.players.some((p) => p.side === 'defense' && p.alive);

  if (!defendersAlive && planted) return finish(world, 'attack', 'elimination');
  if (planted) return;
  if (!attackersAlive) return finish(world, 'defense', 'elimination');
  if (!defendersAlive) return finish(world, 'attack', 'elimination');
  if (world.phaseLeftMs <= 0) finish(world, 'defense', 'time');
}
