import type { CharacterId } from '../characters.js';
import { nextRandom, randomInt } from '../rng.js';
import { DEFUSE_REWARD, KILL_REWARD, PLANT_REWARD, addMoney } from './economy.js';
import { sideOf } from './match.js';
import type { Box, MapDef } from './map.js';
import { bodyHeight, eyePos, moveBody, rayBoxDistance, worldRay, type Body } from './physics.js';
import type { Side, TeamId, Vec3 } from './types.js';
import { WEAPONS, damageFor, slotOf, type HitZone, type WeaponDef, type WeaponId } from './weapons.js';

export const BUY_MS = 15_000;
export const LIVE_MS = 300_000;
export const BOMB_MS = 40_000;
export const PLANT_MS = 3_200;
export const DEFUSE_MS = 7_000;
export const MAX_HP = 100;

const BOMB_REACH = 1.5;
const SHOT_RANGE = 200;
const SHOT_DECAY_MS = 150;
const DEG = Math.PI / 180;
const MAX_EFFECTIVE_PITCH = 1.55;
export const RECOIL_RECOVERY_DEG_S = 22;

/**
 * Caixas de acerto por zona, em frações da altura do corpo, com a meia-largura em metros. Seguem o desenho do
 * personagem: pernas finas, ombros largos e cabeça estreita, iguais para todos os personagens.
 */
export const HITBOX_ZONES: readonly { zone: HitZone; from: number; to: number; half: number }[] = [
  { zone: 'legs', from: 0, to: 0.45, half: 0.25 },
  { zone: 'body', from: 0.45, to: 0.82, half: 0.36 },
  { zone: 'head', from: 0.82, to: 1, half: 0.18 },
];
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
  /** Anda devagar e em silêncio. */
  walk: boolean;
  /** Troca de arma: 1 principal, 2 secundária, 3 alterna; 0 não faz nada. */
  slot: 0 | 1 | 2 | 3;
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
  walk: false,
  slot: 0,
};

/** Arma no coldre, com a munição dela. */
export interface Holstered {
  weapon: WeaponId;
  ammo: number;
  reserve: number;
}

export interface SimPlayer {
  id: string;
  name: string;
  team: TeamId;
  side: Side;
  bot: boolean;
  character: CharacterId;
  alive: boolean;
  hp: number;
  body: Body;
  yaw: number;
  pitch: number;
  weapon: WeaponId;
  ammo: number;
  reserve: number;
  holstered: Holstered | null;
  equipLeftMs: number;
  reloadLeftMs: number;
  cooldownMs: number;
  shots: number;
  /** Recuo atual da mira, somado ao olhar na hora do tiro e na câmera. */
  punchPitch: number;
  punchYaw: number;
  /** Tiros seguidos da rajada atual e tempo desde o último. */
  burst: number;
  sinceShotMs: number;
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
  | {
      type: 'shot';
      shooter: string;
      weapon: WeaponId;
      /** Olho de quem atirou; o cliente desenha o traçante a partir do cano. */
      from: Vec3;
      to: Vec3;
      hit: 'none' | 'wall' | 'player';
      /** Normal da superfície, nos tiros que acertam parede, chão ou teto. */
      normal?: Vec3;
    }
  | { type: 'hit'; attacker: string; victim: string; zone: HitZone; damage: number; killed: boolean }
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
  character: CharacterId;
  money: number;
  weapon: WeaponId;
  /** Segunda arma que o jogador leva consigo (a pistola, quando a principal está na mão). */
  holstered?: WeaponId;
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
      character: entry.character,
      alive: true,
      hp: MAX_HP,
      body: { pos: { ...spawn }, vel: { x: 0, y: 0, z: 0 }, onGround: true, crouch: false },
      yaw: look.yaw,
      pitch: 0,
      weapon: entry.weapon,
      ammo: weapon.magSize,
      reserve: weapon.magSize * RESERVE_MAGS,
      holstered: entry.holstered
        ? { weapon: entry.holstered, ammo: WEAPONS[entry.holstered].magSize, reserve: WEAPONS[entry.holstered].magSize * RESERVE_MAGS }
        : null,
      equipLeftMs: 0,
      reloadLeftMs: 0,
      cooldownMs: 0,
      shots: 0,
      punchPitch: 0,
      punchYaw: 0,
      burst: 0,
      sinceShotMs: 0,
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
  const firers = new Set(next.players.filter((p) => p.alive).map((p) => p.id));

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
    p.body = moveBody(next.map, p.body, wish, input.jump, input.crouch, WEAPONS[p.weapon].moveSpeedMult, dt, input.walk);
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
  stepCombat(next, inputs, dtMs, firers);
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

/** Saca a arma do coldre; a que estava na mão vai para o coldre. Devolve se trocou. */
export function switchWeapon(p: SimPlayer, slot: 1 | 2 | 3): boolean {
  const held = p.holstered;
  if (!held || (slot !== 3 && slotOf(held.weapon) !== slot)) return false;
  p.holstered = { weapon: p.weapon, ammo: p.ammo, reserve: p.reserve };
  p.weapon = held.weapon;
  p.ammo = held.ammo;
  p.reserve = held.reserve;
  p.reloadLeftMs = 0;
  p.shots = 0;
  p.equipLeftMs = WEAPONS[p.weapon].equipMs;
  return true;
}

function recoverRecoil(p: SimPlayer, weapon: WeaponDef, dtMs: number): void {
  const hold = Math.min(400, Math.max(180, weapon.fireIntervalMs * 2));
  if (p.sinceShotMs <= hold) return;
  p.burst = 0;
  const step = RECOIL_RECOVERY_DEG_S * DEG * (dtMs / 1000);
  p.punchPitch = Math.max(0, p.punchPitch - step);
  p.punchYaw = p.punchYaw > 0 ? Math.max(0, p.punchYaw - step) : Math.min(0, p.punchYaw + step);
}

function addRecoil(p: SimPlayer, weapon: WeaponDef): void {
  const cap = weapon.recoilMax * DEG;
  p.punchPitch = Math.min(cap, p.punchPitch + weapon.recoilPitch * DEG);
  const sway = cap * 0.6;
  p.punchYaw = Math.max(-sway, Math.min(sway, p.punchYaw + weapon.recoilYaw * DEG * Math.sin(p.burst * 1.7)));
  p.burst += 1;
  p.sinceShotMs = 0;
}

export function spreadFor(player: SimPlayer, weapon: WeaponDef): number {
  const speed = Math.hypot(player.body.vel.x, player.body.vel.z);
  const moving = speed > 1 || !player.body.onGround;
  const spread = weapon.spreadBase + (moving ? weapon.spreadMove : 0) + player.shots * weapon.spreadPerShot;
  return Math.min(weapon.spreadMax, spread);
}

function stepCombat(world: World, inputs: Record<string, PlayerInput>, dtMs: number, firers: Set<string>): void {
  for (const p of world.players) {
    if (!firers.has(p.id)) continue;
    const input = inputs[p.id] ?? IDLE_INPUT;
    if (input.slot !== 0) switchWeapon(p, input.slot);
    const weapon = WEAPONS[p.weapon];
    p.cooldownMs = Math.max(0, p.cooldownMs - dtMs);
    p.equipLeftMs = Math.max(0, p.equipLeftMs - dtMs);
    p.sinceShotMs += dtMs;
    recoverRecoil(p, weapon, dtMs);

    if (p.reloadLeftMs > 0) {
      p.reloadLeftMs = Math.max(0, p.reloadLeftMs - dtMs);
      if (p.reloadLeftMs === 0) {
        const taken = Math.min(p.reserve, weapon.magSize - p.ammo);
        p.ammo += taken;
        p.reserve -= taken;
      }
    } else if (input.reload && p.equipLeftMs === 0 && p.ammo < weapon.magSize && p.reserve > 0) {
      p.reloadLeftMs = weapon.reloadMs;
    }

    if (input.fire && p.cooldownMs === 0 && p.equipLeftMs === 0 && p.ammo > 0 && p.reloadLeftMs === 0) {
      fireShot(world, p, weapon);
      addRecoil(p, weapon);
      p.ammo -= 1;
      p.cooldownMs = weapon.fireIntervalMs;
      p.shots += 1;
    } else if (!input.fire) {
      p.shots = Math.max(0, p.shots - dtMs / SHOT_DECAY_MS);
    }

    if (p.ammo === 0 && p.reserve > 0 && p.reloadLeftMs === 0 && p.equipLeftMs === 0) p.reloadLeftMs = weapon.reloadMs;
  }
}

function fireShot(world: World, shooter: SimPlayer, weapon: WeaponDef): void {
  const angle = nextRandom(world.rng);
  const radius = nextRandom(angle.state);
  world.rng = radius.state;

  const spread = Math.tan((spreadFor(shooter, weapon) * Math.PI) / 180) * Math.sqrt(radius.value);
  const theta = angle.value * Math.PI * 2;
  const aimYaw = shooter.yaw + shooter.punchYaw;
  const aimPitch = Math.min(MAX_EFFECTIVE_PITCH, shooter.pitch + shooter.punchPitch);
  const forward = lookDirection(aimYaw, aimPitch);
  const right = { x: Math.cos(aimYaw), y: 0, z: -Math.sin(aimYaw) };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const dx = forward.x + (right.x * Math.cos(theta) + up.x * Math.sin(theta)) * spread;
  const dy = forward.y + (right.y * Math.cos(theta) + up.y * Math.sin(theta)) * spread;
  const dz = forward.z + (right.z * Math.cos(theta) + up.z * Math.sin(theta)) * spread;
  const length = Math.hypot(dx, dy, dz);
  const dir = { x: dx / length, y: dy / length, z: dz / length };
  const origin = eyePos(shooter.body);

  const wallHit = worldRay(world.map, origin, dir, SHOT_RANGE);
  const wall = wallHit?.dist ?? Infinity;
  const at = (dist: number): Vec3 => ({ x: origin.x + dir.x * dist, y: origin.y + dir.y * dist, z: origin.z + dir.z * dist });
  let victim: SimPlayer | null = null;
  let zone: HitZone = 'body';
  let nearest = Infinity;
  for (const enemy of world.players) {
    if (!enemy.alive || enemy.team === shooter.team) continue;
    const feet = enemy.body.pos;
    const height = bodyHeight(enemy.body);
    for (const part of HITBOX_ZONES) {
      const box = {
        min: { x: feet.x - part.half, y: feet.y + height * part.from, z: feet.z - part.half },
        max: { x: feet.x + part.half, y: feet.y + height * part.to, z: feet.z + part.half },
      };
      const t = rayBoxDistance(origin, dir, box, SHOT_RANGE);
      if (t !== null && t < wall && t < nearest) {
        nearest = t;
        victim = enemy;
        zone = part.zone;
      }
    }
  }
  if (!victim) {
    world.events.push({
      type: 'shot',
      shooter: shooter.id,
      weapon: weapon.id,
      from: origin,
      to: at(wallHit?.dist ?? SHOT_RANGE),
      hit: wallHit ? 'wall' : 'none',
      ...(wallHit ? { normal: wallHit.normal } : {}),
    });
    return;
  }
  world.events.push({ type: 'shot', shooter: shooter.id, weapon: weapon.id, from: origin, to: at(nearest), hit: 'player' });

  const damage = damageFor(weapon, zone);
  victim.hp = Math.max(0, victim.hp - damage);
  const killed = victim.hp <= 0;
  world.events.push({ type: 'hit', attacker: shooter.id, victim: victim.id, zone, damage, killed });
  if (!killed) return;
  victim.alive = false;
  shooter.money = addMoney(shooter.money, KILL_REWARD);
  world.events.push({ type: 'kill', killer: shooter.id, victim: victim.id, headshot: zone === 'head' });
}
