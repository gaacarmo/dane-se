import { nextRandom } from '../rng.js';
import type { MapDef } from './map.js';
import { bodyHeight, eyePos, raycast } from './physics.js';
import { IDLE_INPUT, LIVE_MS, aimAt, lookDirection, type PlayerInput, type SimPlayer, type World } from './sim.js';
import type { Vec3 } from './types.js';
import { WEAPONS, slotOf, type WeaponId } from './weapons.js';

const DEG = Math.PI / 180;
/** Distância máxima em que o bot começa um tiroteio, por categoria da arma na mão. */
const ENGAGE_RANGE = { pistol: 18, smg: 24, rifle: 40, sniper: 70 } as const;
/** Altura do peito, em fração do corpo: baixo o bastante para o erro de mira não cair sempre na cabeça. */
const CHEST_AIM = 0.56;
/** Quem já está de olho num alvo o segue até 75° para cada lado; além disso o perde de vista. */
const ENGAGED_HALF_FOV = 75 * DEG;
/** Tempo de ação em que os atacantes esperam no ponto de espera antes de entrar juntos. */
export const ATTACK_EXECUTE_MS = 14_000;
const ARRIVE = 1;
const WAYPOINT_REACH = 1.2;
const LOSE_TARGET_MS = 600;
const STUCK_CHECK_MS = 500;
const PATROL_RADIUS = 10;
/** Esperando no ponto de espera o bot só circula por perto, sem atravessar o portão quando ele cai. */
const STAGE_RADIUS = 3;

export type Difficulty = 'easy' | 'normal' | 'hard';

/** O que separa um bot de um humano: reação, mira, giro e controle de recuo. */
export interface BotSkill {
  /** Atraso antes do primeiro tiro num alvo recém visto, sorteado entre os dois valores. */
  reactionMs: [number, number];
  /** Erro de mira parado, em graus. */
  aimErrorDeg: number;
  /** Erro extra enquanto o próprio bot anda. */
  moveErrorDeg: number;
  /** Erro extra por metro de distância. */
  distanceErrorDeg: number;
  turnRateDegS: number;
  /** Chance de uma rajada mirar a cabeça em vez do peito. */
  headChance: number;
  /** Fração do recuo que o bot compensa (1 = perfeito). */
  recoilControl: number;
  /** Campo de visão para notar um inimigo novo. */
  fovDeg: number;
}

export const BOT_SKILLS: Record<Difficulty, BotSkill> = {
  easy: { reactionMs: [650, 950], aimErrorDeg: 4, moveErrorDeg: 8, distanceErrorDeg: 0.14, turnRateDegS: 240, headChance: 0.04, recoilControl: 0.3, fovDeg: 85 },
  normal: { reactionMs: [380, 650], aimErrorDeg: 2.3, moveErrorDeg: 5, distanceErrorDeg: 0.08, turnRateDegS: 340, headChance: 0.1, recoilControl: 0.55, fovDeg: 95 },
  hard: { reactionMs: [220, 380], aimErrorDeg: 1.3, moveErrorDeg: 3.5, distanceErrorDeg: 0.05, turnRateDegS: 520, headChance: 0.3, recoilControl: 0.8, fovDeg: 105 },
};

/** Cada bot sai um pouco melhor ou pior que a média da dificuldade (±15%), de forma semeada. */
export function varySkill(skill: BotSkill, seed: number): BotSkill {
  const f = 0.85 + nextRandom(seed | 0).value * 0.3;
  return {
    reactionMs: [skill.reactionMs[0] / f, skill.reactionMs[1] / f],
    aimErrorDeg: skill.aimErrorDeg / f,
    moveErrorDeg: skill.moveErrorDeg / f,
    distanceErrorDeg: skill.distanceErrorDeg / f,
    turnRateDegS: skill.turnRateDegS * f,
    headChance: Math.min(1, skill.headChance * f),
    recoilControl: Math.min(0.95, skill.recoilControl * f),
    fovDeg: skill.fovDeg,
  };
}

export interface BotMemory {
  path: number[];
  goal: Vec3 | null;
  goalKey: string;
  reactionMs: number;
  strafeMs: number;
  strafeDir: 1 | -1;
  targetId: string | null;
  lostMs: number;
  burstMs: number;
  holdMs: number;
  stuckMs: number;
  lastPos: Vec3 | null;
  unstickMs: number;
  rng: number;
  skill: BotSkill;
  /** A rajada atual mira a cabeça. */
  aimHead: boolean;
  burstIndex: number;
  /** Erro de mira sorteado, em frações do erro máximo, renovado de tempos em tempos. */
  errYaw: number;
  errPitch: number;
  aimErrMs: number;
}

export function createBotMemory(seed = 1, skill: BotSkill = BOT_SKILLS.normal): BotMemory {
  return {
    path: [],
    goal: null,
    goalKey: '',
    reactionMs: 0,
    strafeMs: 0,
    strafeDir: 1,
    targetId: null,
    lostMs: 0,
    burstMs: 0,
    holdMs: 0,
    stuckMs: 0,
    lastPos: null,
    unstickMs: 0,
    rng: seed | 0,
    skill,
    aimHead: false,
    burstIndex: -1,
    errYaw: 0,
    errPitch: 0,
    aimErrMs: 0,
  };
}

function rand(mem: BotMemory): number {
  const r = nextRandom(mem.rng);
  mem.rng = r.state;
  return r.value;
}

function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** Waypoint mais próximo que o ponto enxerga; sem nenhum à vista, o mais próximo em linha reta. */
function nearestWaypoint(map: MapDef, p: Vec3): number {
  const byDistance = map.waypoints
    .map((w, i) => ({ i, d: distanceXZ(w, p) }))
    .sort((a, b) => a.d - b.d);
  const from = { x: p.x, y: 0.9, z: p.z };
  const visible = byDistance.find(({ i, d }) => {
    const w = map.waypoints[i]!;
    return raycast(map, from, { x: w.x - p.x, y: 0, z: w.z - p.z }, d) === null;
  });
  return (visible ?? byDistance[0])?.i ?? -1;
}

/** Índices de waypoints do mais próximo de `from` ao mais próximo de `to`; vazio se não há caminho. */
export function findPath(map: MapDef, from: Vec3, to: Vec3): number[] {
  const start = nearestWaypoint(map, from);
  const goal = nearestWaypoint(map, to);
  if (start < 0 || goal < 0) return [];

  const adjacent: number[][] = map.waypoints.map(() => []);
  for (const [a, b] of map.links) {
    adjacent[a]?.push(b);
    adjacent[b]?.push(a);
  }

  const cost = map.waypoints.map(() => Infinity);
  const previous = map.waypoints.map(() => -1);
  const open = new Set<number>([start]);
  cost[start] = 0;
  while (open.size > 0) {
    let current = -1;
    for (const i of open) if (current < 0 || cost[i]! < cost[current]!) current = i;
    open.delete(current);
    if (current === goal) break;
    for (const next of adjacent[current]!) {
      const total = cost[current]! + distanceXZ(map.waypoints[current]!, map.waypoints[next]!);
      if (total < cost[next]!) {
        cost[next] = total;
        previous[next] = current;
        open.add(next);
      }
    }
  }
  if (cost[goal] === Infinity) return [];

  const path: number[] = [];
  for (let at = goal; at >= 0; at = previous[at]!) path.unshift(at);
  return path;
}

const RIFLE_ORDER: WeaponId[] = ['cartao_vermelho', 'tabelinha', 'garcom', 'tamanco', 'chinelo'];
const SNIPER_ORDER: WeaponId[] = ['escanteio', ...RIFLE_ORDER];

function prefersSniper(id: string): boolean {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return sum % 3 === 0;
}

/** Arma que o bot quer comprar nesta rodada, ou null quando já tem uma principal ou não vale trocar. */
export function botBuy(world: World, playerId: string): WeaponId | null {
  const p = world.players.find((x) => x.id === playerId)!;
  const held = [p.weapon, p.holstered?.weapon].filter((w): w is WeaponId => !!w);
  if (held.some((w) => slotOf(w) === 1)) return null;

  const pistol = held.find((w) => slotOf(w) === 2) ?? 'chinelo';
  const order = prefersSniper(p.id) ? SNIPER_ORDER : RIFLE_ORDER;
  return (
    order.find(
      (id) =>
        WEAPONS[id].price <= p.money &&
        !held.includes(id) &&
        (slotOf(id) === 1 || WEAPONS[id].price > WEAPONS[pistol].price),
    ) ?? null
  );
}

function pickTarget(world: World, me: SimPlayer, eye: Vec3, memory: BotMemory): SimPlayer | null {
  let best: SimPlayer | null = null;
  let bestDist = Infinity;
  for (const enemy of world.players) {
    if (!enemy.alive || enemy.team === me.team) continue;
    const chest = { x: enemy.body.pos.x, y: enemy.body.pos.y + bodyHeight(enemy.body) * 0.6, z: enemy.body.pos.z };
    const dx = chest.x - eye.x;
    const dy = chest.y - eye.y;
    const dz = chest.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > ENGAGE_RANGE[WEAPONS[me.weapon].category] || dist < 1e-6) continue;
    const engaged = memory.targetId === enemy.id;
    const angle = Math.abs(wrapAngle(aimAt(eye, chest).yaw - me.yaw));
    if (angle > (engaged ? ENGAGED_HALF_FOV : (memory.skill.fovDeg * DEG) / 2)) continue;
    if (raycast(world.map, eye, { x: dx, y: dy, z: dz }, dist) !== null) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  return best;
}

function siteCenter(map: MapDef, key: 'A' | 'B'): Vec3 {
  const s = map.sites[key];
  return { x: (s.min.x + s.max.x) / 2, y: 0, z: (s.min.z + s.max.z) / 2 };
}

/** O time atacante escolhe um ponto por rodada, de forma semeada, em vez de sempre o mais perto. */
function attackSite(world: World): 'A' | 'B' {
  return nextRandom(world.roundIndex * 977 + 13).value < 0.5 ? 'A' : 'B';
}

/** Onde este bot quer estar: plantar, escoltar, guardar ou desarmar. */
function baseGoal(world: World, me: SimPlayer): Vec3 {
  const { map, bomb } = world;
  if (bomb.status === 'planted' && bomb.pos) return bomb.pos;
  if (me.side === 'attack') {
    const waiting = world.phase === 'prep' || LIVE_MS - world.phaseLeftMs < ATTACK_EXECUTE_MS;
    if (waiting && map.stage) return map.stage;
    const carrier = world.players.find((p) => p.hasBomb);
    if (!me.hasBomb && !carrier && bomb.pos) return bomb.pos;
    return siteCenter(map, attackSite(world));
  }
  const defenders = world.players.filter((p) => p.side === 'defense').map((p) => p.id).sort();
  return siteCenter(map, defenders.indexOf(me.id) % 2 === 0 ? 'A' : 'B');
}

function randomNear(map: MapDef, base: Vec3, mem: BotMemory, radius: number): Vec3 {
  const near = map.waypoints.filter((w) => distanceXZ(w, base) <= radius);
  if (near.length === 0) return base;
  return near[Math.floor(rand(mem) * near.length)]!;
}

export function botInput(
  world: World,
  playerId: string,
  memory: BotMemory,
  dtMs: number,
): { input: PlayerInput; memory: BotMemory } {
  const me = world.players.find((p) => p.id === playerId)!;
  const mem: BotMemory = { ...memory, path: [...memory.path] };
  if (!me.alive || world.phase === 'buy' || world.phase === 'over') {
    return { input: { ...IDLE_INPUT, yaw: me.yaw, pitch: me.pitch }, memory: mem };
  }

  const dt = dtMs / 1000;
  const eye = eyePos(me.body);
  const weapon = WEAPONS[me.weapon];
  const target = world.phase === 'live' ? pickTarget(world, me, eye, mem) : null;

  if (target) {
    if (mem.targetId !== target.id) {
      mem.targetId = target.id;
      const [fastest, slowest] = mem.skill.reactionMs;
      mem.reactionMs = fastest + rand(mem) * (slowest - fastest);
      mem.burstMs = 0;
      mem.burstIndex = -1;
      mem.aimErrMs = 0;
    }
    mem.lostMs = 0;
  } else if (mem.targetId) {
    mem.lostMs += dtMs;
    if (mem.lostMs > LOSE_TARGET_MS) mem.targetId = null;
  }
  mem.reactionMs = Math.max(0, mem.reactionMs - dtMs);

  const goalBase = baseGoal(world, me);
  const stationaryTask =
    (me.hasBomb && world.bomb.status === 'carried' && inSiteXZ(world.map, me.body.pos)) ||
    (me.side === 'defense' && world.bomb.status === 'planted' && world.bomb.pos && distanceXZ(me.body.pos, world.bomb.pos) <= ARRIVE);

  let desiredYaw = me.yaw;
  let desiredPitch = 0;
  let wantFire = false;
  let engaged = false;
  /** Passo lateral (relativo ao olhar) de quem está em tiroteio; `move` é a direção de caminhada no mundo. */
  let strafe = 0;
  const move = { x: 0, z: 0 };

  if (target) {
    engaged = true;
    const skill = mem.skill;
    const feet = target.body.pos;
    const height = bodyHeight(target.body);
    const distance = Math.hypot(feet.x - eye.x, feet.z - eye.z);
    const moving = Math.hypot(me.body.vel.x, me.body.vel.z) > 1;
    const targetSpeed = Math.hypot(target.body.vel.x, target.body.vel.z);
    const errorDeg = skill.aimErrorDeg + (moving ? skill.moveErrorDeg : 0) + distance * skill.distanceErrorDeg + targetSpeed * 0.5;
    const error = errorDeg * DEG;

    mem.burstMs += dtMs;
    const on = weapon.category === 'sniper' ? Infinity : weapon.category === 'smg' ? 220 : weapon.category === 'pistol' ? 120 : 180;
    const period = on === Infinity ? Infinity : on + 260;
    const burstIndex = period === Infinity ? 0 : Math.floor(mem.burstMs / period);
    if (burstIndex !== mem.burstIndex) {
      mem.burstIndex = burstIndex;
      mem.aimHead = rand(mem) < skill.headChance;
    }
    mem.aimErrMs -= dtMs;
    if (mem.aimErrMs <= 0) {
      mem.aimErrMs = 120 + rand(mem) * 100;
      mem.errYaw = rand(mem) * 2 - 1;
      mem.errPitch = rand(mem) * 2 - 1;
    }

    const aim = aimAt(eye, { x: feet.x, y: feet.y + height * (mem.aimHead ? 0.91 : CHEST_AIM), z: feet.z });
    desiredYaw = aim.yaw - me.punchYaw * skill.recoilControl + mem.errYaw * error;
    desiredPitch = aim.pitch - me.punchPitch * skill.recoilControl + mem.errPitch * error;

    const look = lookDirection(me.yaw + me.punchYaw, me.pitch + me.punchPitch);
    const want = lookDirection(aim.yaw, aim.pitch);
    const dot = Math.min(1, Math.max(-1, look.x * want.x + look.y * want.y + look.z * want.z));
    const threshold = weapon.category === 'sniper' ? Math.max(0.8, errorDeg) : Math.max(2.5, errorDeg * 1.5);
    const aligned = (Math.acos(dot) * 180) / Math.PI < threshold;

    const inBurst = on === Infinity || mem.burstMs % period < on;
    wantFire = mem.reactionMs === 0 && aligned && inBurst;

    if (!inBurst || mem.reactionMs > 0) {
      mem.strafeMs -= dtMs;
      if (mem.strafeMs <= 0) {
        mem.strafeDir = mem.strafeDir === 1 ? -1 : 1;
        mem.strafeMs = 300 + rand(mem) * 400;
      }
      if (weapon.category === 'smg' || weapon.category === 'pistol') strafe = mem.strafeDir;
      // Quem ataca segue para o objetivo entre as rajadas, em vez de travar num tiroteio que não consegue vencer.
      if (me.side === 'attack' && !stationaryTask) {
        const walk = walkToward(world, me, goalBase, mem, dtMs);
        move.x = walk.dir.x;
        move.z = walk.dir.z;
      }
    }
  } else {
    const walk = walkToward(world, me, goalBase, mem, dtMs);
    move.x = walk.dir.x;
    move.z = walk.dir.z;
    if (walk.facing) {
      desiredYaw = walk.facing.yaw;
      desiredPitch = 0;
    }
  }

  const turnRate = mem.skill.turnRateDegS * DEG;
  const yawStep = Math.max(-turnRate * dt, Math.min(turnRate * dt, wrapAngle(desiredYaw - me.yaw)));
  const pitchStep = Math.max(-turnRate * dt, Math.min(turnRate * dt, desiredPitch - me.pitch));
  const yaw = me.yaw + yawStep;
  const pitch = me.pitch + pitchStep;

  let jump = false;
  if (!stationaryTask && (!engaged || move.x !== 0 || move.z !== 0)) {
    mem.stuckMs += dtMs;
    if (mem.stuckMs >= STUCK_CHECK_MS) {
      const moved = mem.lastPos ? distanceXZ(mem.lastPos, me.body.pos) : Infinity;
      if (moved < 0.2 && (move.x !== 0 || move.z !== 0)) {
        mem.unstickMs = 500;
        mem.goalKey = '';
        mem.strafeDir = mem.strafeDir === 1 ? -1 : 1;
      }
      mem.stuckMs = 0;
      mem.lastPos = { ...me.body.pos };
    }
  }
  let localX = 0;
  let localZ = 0;
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  localX = move.x * right.x + move.z * right.z + strafe;
  localZ = move.x * forward.x + move.z * forward.z;
  if (mem.unstickMs > 0) {
    mem.unstickMs -= dtMs;
    jump = true;
    localX = mem.strafeDir;
  }

  const use = !target && !!stationaryTask;
  if (use) {
    localX = 0;
    localZ = 0;
  }

  return {
    input: {
      moveX: localX,
      moveZ: localZ,
      yaw,
      pitch,
      jump,
      crouch: false,
      fire: wantFire,
      reload: me.ammo < weapon.magSize * 0.3 && !target,
      use,
      walk: false,
      slot: me.ammo === 0 && me.reserve === 0 && me.holstered && me.holstered.ammo > 0 ? 3 : 0,
    },
    memory: mem,
  };
}

function inSiteXZ(map: MapDef, p: Vec3): boolean {
  return (['A', 'B'] as const).some((key) => {
    const s = map.sites[key];
    return p.x >= s.min.x && p.x <= s.max.x && p.z >= s.min.z && p.z <= s.max.z;
  });
}

/** Direção de caminhada em coordenadas do mundo (norma 0 ou 1) e para onde olhar. */
function walkToward(
  world: World,
  me: SimPlayer,
  base: Vec3,
  mem: BotMemory,
  dtMs: number,
): { dir: { x: number; z: number }; facing: { yaw: number } | null } {
  const { map } = world;
  const radius = map.stage && base === map.stage ? STAGE_RADIUS : PATROL_RADIUS;
  if (!mem.goal || distanceXZ(mem.goal, base) > radius + 2) mem.goal = base;

  if (distanceXZ(me.body.pos, mem.goal) <= ARRIVE) {
    if (mem.holdMs <= 0) mem.holdMs = 2000 + rand(mem) * 3000;
    else {
      mem.holdMs -= dtMs;
      if (mem.holdMs <= 0) mem.goal = randomNear(map, base, mem, radius);
    }
    return { dir: { x: 0, z: 0 }, facing: null };
  }

  const key = `${mem.goal.x.toFixed(1)},${mem.goal.z.toFixed(1)}`;
  if (mem.goalKey !== key) {
    mem.goalKey = key;
    mem.path = findPath(map, me.body.pos, mem.goal);
  }
  while (mem.path.length > 0 && distanceXZ(map.waypoints[mem.path[0]!]!, me.body.pos) < WAYPOINT_REACH) mem.path.shift();
  const next = mem.path.length > 0 ? map.waypoints[mem.path[0]!]! : mem.goal;
  const dx = next.x - me.body.pos.x;
  const dz = next.z - me.body.pos.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return { dir: { x: 0, z: 0 }, facing: null };
  return { dir: { x: dx / length, z: dz / length }, facing: { yaw: Math.atan2(-dx, -dz) } };
}
