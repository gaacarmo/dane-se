import { sideOf } from './match.js';
import { withBarrier, type MapDef } from './map.js';
import { bodyHeight, eyePos, moveBody, raycast, type Body } from './physics.js';
import type { Match, PlayerStats } from './runner.js';
import {
  inputWish,
  type BombState,
  type PlayerInput,
  type RoundEnd,
  type RoundPhase,
  type RosterEntry,
  type SimPlayer,
  type World,
  type WorldEvent,
} from './sim.js';
import type { TeamId, Vec3 } from './types.js';
import { WEAPONS, type WeaponId } from './weapons.js';

/** Um passo do motor: o cliente manda uma entrada por passo e o servidor consome uma por passo. */
export const CS_STEP_MS = 1000 / 60;
export const CS_SNAPSHOT_EVERY = 3;
/** Os outros jogadores são desenhados este tempo atrás, para sempre haver dois snapshots entre os quais interpolar. */
export const CS_INTERP_MS = 100;
export const CS_MAX_PENDING = 12;

const VISION_MEMORY_MS = 250;
const HEARD_RANGE = 22;
const HEARD_SPEED = 3.2;
const GUNSHOT_RANGE = 60;
const PITCH_LIMIT = 1.5;

export interface CsInputMsg {
  seq: number;
  input: PlayerInput;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

/** Entrada que veio da rede: nunca é confiável. Devolve null quando o formato não serve. */
export function sanitizeInput(raw: unknown): PlayerInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!finite(r.moveX) || !finite(r.moveZ) || !finite(r.yaw) || !finite(r.pitch)) return null;
  const slot = r.slot ?? 0;
  if (slot !== 0 && slot !== 1 && slot !== 2 && slot !== 3) return null;
  return {
    moveX: clamp(r.moveX, -1, 1),
    moveZ: clamp(r.moveZ, -1, 1),
    yaw: wrapAngle(r.yaw),
    pitch: clamp(r.pitch, -PITCH_LIMIT, PITCH_LIMIT),
    jump: r.jump === true,
    crouch: r.crouch === true,
    fire: r.fire === true,
    reload: r.reload === true,
    use: r.use === true,
    walk: r.walk === true,
    slot,
  };
}

export interface CsHolstered {
  weapon: WeaponId;
  ammo: number;
  reserve: number;
}

/** Um jogador como vai pela rede: o público para todos, o de equipe para colegas e o privado só para o dono. */
export interface CsPlayerSnap {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  onGround: boolean;
  alive: boolean;
  weapon: WeaponId;
  hp?: number;
  hasBomb?: boolean;
  money?: number;
  ammo?: number;
  reserve?: number;
  holstered?: CsHolstered | null;
  equipLeftMs?: number;
  reloadLeftMs?: number;
  cooldownMs?: number;
  shots?: number;
  punchPitch?: number;
  punchYaw?: number;
  burst?: number;
  sinceShotMs?: number;
}

export interface CsSnapshot {
  tick: number;
  /** Última entrada do próprio jogador que o servidor já aplicou. */
  ack: number;
  phase: RoundPhase;
  phaseLeftMs: number;
  roundIndex: number;
  score: Record<TeamId, number>;
  lossStreak: Record<TeamId, number>;
  winner: TeamId | null;
  forfeitedBy: TeamId | null;
  pauseMs: number | null;
  end: RoundEnd | null;
  bomb: BombState;
  players: CsPlayerSnap[];
  /** Posições de inimigos correndo por perto mas fora de vista: só o som chega ao cliente. */
  heard: Vec3[];
  events: WorldEvent[];
  stats: Record<string, PlayerStats>;
}

const cm = (v: number) => Math.round(v * 100) / 100;
const mrad = (v: number) => Math.round(v * 1000) / 1000;

/** Quem cada time enxergou nos últimos instantes. Um colega ver o inimigo basta para o time inteiro vê-lo. */
export class VisionTracker {
  private lastSeen = new Map<string, number>();
  private stamp = Number.NaN;

  update(match: Match, now: number): void {
    if (this.stamp === now) return;
    this.stamp = now;
    const { world } = match;
    if (world.phase === 'buy' || world.phase === 'prep') return;
    for (const enemy of world.players) {
      if (!enemy.alive) continue;
      const team: TeamId = enemy.team === 'A' ? 'B' : 'A';
      const watchers = world.players.filter((p) => p.alive && p.team === team);
      if (watchers.some((w) => canSee(world, w, enemy))) this.lastSeen.set(`${team}|${enemy.id}`, now);
    }
  }

  visible(team: TeamId, enemyId: string, now: number): boolean {
    const seen = this.lastSeen.get(`${team}|${enemyId}`);
    return seen !== undefined && now - seen <= VISION_MEMORY_MS;
  }
}

function canSee(world: World, from: SimPlayer, target: SimPlayer): boolean {
  const eye = eyePos(from.body);
  const h = bodyHeight(target.body);
  return [0.9, 0.6, 0.25].some((fraction) => {
    const point = { x: target.body.pos.x, y: target.body.pos.y + h * fraction, z: target.body.pos.z };
    const dx = point.x - eye.x;
    const dy = point.y - eye.y;
    const dz = point.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    return raycast(world.map, eye, { x: dx, y: dy, z: dz }, Math.max(0, dist - 0.1)) === null;
  });
}

function playerSnap(p: SimPlayer, self: boolean, mate: boolean): CsPlayerSnap {
  const snap: CsPlayerSnap = {
    id: p.id,
    x: cm(p.body.pos.x),
    y: cm(p.body.pos.y),
    z: cm(p.body.pos.z),
    vx: cm(p.body.vel.x),
    vy: cm(p.body.vel.y),
    vz: cm(p.body.vel.z),
    yaw: mrad(p.yaw),
    pitch: mrad(p.pitch),
    crouch: p.body.crouch,
    onGround: p.body.onGround,
    alive: p.alive,
    weapon: p.weapon,
  };
  if (mate) {
    snap.hp = p.hp;
    snap.hasBomb = p.hasBomb;
    snap.money = p.money;
  }
  if (self) {
    snap.ammo = p.ammo;
    snap.reserve = p.reserve;
    snap.holstered = p.holstered ? { ...p.holstered } : null;
    snap.equipLeftMs = p.equipLeftMs;
    snap.reloadLeftMs = p.reloadLeftMs;
    snap.cooldownMs = p.cooldownMs;
    snap.shots = p.shots;
    snap.punchPitch = p.punchPitch;
    snap.punchYaw = p.punchYaw;
    snap.burst = p.burst;
    snap.sinceShotMs = p.sinceShotMs;
  }
  return snap;
}

function filterEvents(
  events: readonly WorldEvent[],
  world: World,
  viewerId: string,
  team: TeamId,
  seenEnemies: ReadonlySet<string>,
  ear: Vec3,
): WorldEvent[] {
  const teamOf = (id: string) => world.players.find((p) => p.id === id)?.team;
  const out: WorldEvent[] = [];
  for (const e of events) {
    if (e.type === 'hit') {
      if (e.attacker === viewerId || e.victim === viewerId) out.push(e);
    } else if (e.type === 'shot') {
      if (teamOf(e.shooter) === team || seenEnemies.has(e.shooter)) {
        out.push(e);
      } else if (Math.hypot(e.from.x - ear.x, e.from.z - ear.z) <= GUNSHOT_RANGE) {
        // Tiro de quem não aparece: só o som, sem traçante nem impacto.
        out.push({ type: 'shot', shooter: e.shooter, weapon: e.weapon, from: e.from, to: e.from, hit: 'none' });
      }
    } else {
      out.push(e);
    }
  }
  return out;
}

/** O que `viewerId` pode saber agora: o time inteiro e só os inimigos que o time enxerga. */
export function buildSnapshot(
  match: Match,
  viewerId: string,
  tracker: VisionTracker,
  tick: number,
  ack: number,
  now: number,
  events: readonly WorldEvent[] = [],
): CsSnapshot {
  const { world } = match;
  const viewer = world.players.find((p) => p.id === viewerId);
  const team: TeamId = viewer?.team ?? 'A';
  tracker.update(match, now);

  const hideEnemies = world.phase === 'buy' || world.phase === 'prep';
  const ear = viewer ? eyePos(viewer.body) : { x: 0, y: 0, z: 0 };
  const players: CsPlayerSnap[] = [];
  const heard: Vec3[] = [];
  const seenEnemies = new Set<string>();

  for (const p of world.players) {
    const mate = p.team === team;
    if (!mate) {
      if (!p.alive || hideEnemies) continue;
      if (!tracker.visible(team, p.id, now)) {
        const speed = Math.hypot(p.body.vel.x, p.body.vel.z);
        const distance = Math.hypot(p.body.pos.x - ear.x, p.body.pos.z - ear.z);
        if (p.body.onGround && speed >= HEARD_SPEED && distance <= HEARD_RANGE) {
          heard.push({ x: cm(p.body.pos.x), y: cm(p.body.pos.y), z: cm(p.body.pos.z) });
        }
        continue;
      }
      seenEnemies.add(p.id);
    }
    players.push(playerSnap(p, p.id === viewerId, mate));
  }

  return {
    tick,
    ack,
    phase: world.phase,
    phaseLeftMs: Math.round(world.phaseLeftMs),
    roundIndex: match.roundIndex,
    score: match.score,
    lossStreak: match.lossStreak,
    winner: match.winner,
    forfeitedBy: match.forfeitedBy,
    pauseMs: match.pauseMs === null ? null : Math.round(match.pauseMs),
    end: world.end,
    bomb: world.bomb,
    players,
    heard,
    events: filterEvents(events, world, viewerId, team, seenEnemies, ear),
    stats: match.stats,
  };
}

function blankPlayer(entry: RosterEntry, side: SimPlayer['side']): SimPlayer {
  const weapon = WEAPONS[entry.weapon];
  return {
    id: entry.id,
    name: entry.name,
    team: entry.team,
    side,
    bot: entry.bot,
    character: entry.character,
    alive: false,
    hp: 0,
    body: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, onGround: true, crouch: false },
    yaw: 0,
    pitch: 0,
    weapon: entry.weapon,
    ammo: weapon.magSize,
    reserve: 0,
    holstered: null,
    equipLeftMs: 0,
    reloadLeftMs: 0,
    cooldownMs: 0,
    shots: 0,
    punchPitch: 0,
    punchYaw: 0,
    burst: 0,
    sinceShotMs: 0,
    money: 0,
    hasBomb: false,
  };
}

function toSimPlayer(entry: RosterEntry, snap: CsPlayerSnap | undefined, prev: SimPlayer | undefined, roundIndex: number): SimPlayer {
  const side = sideOf(entry.team, roundIndex);
  const base = { ...(prev ?? blankPlayer(entry, side)), name: entry.name, team: entry.team, side, bot: entry.bot, character: entry.character };
  // Inimigo que o snapshot não trouxe: fica escondido (e some da cena) até aparecer de novo.
  if (!snap) return { ...base, alive: false };
  return {
    ...base,
    alive: snap.alive,
    hp: snap.hp ?? (snap.alive ? 100 : 0),
    body: {
      pos: { x: snap.x, y: snap.y, z: snap.z },
      vel: { x: snap.vx, y: snap.vy, z: snap.vz },
      onGround: snap.onGround,
      crouch: snap.crouch,
    },
    yaw: snap.yaw,
    pitch: snap.pitch,
    weapon: snap.weapon,
    ammo: snap.ammo ?? 0,
    reserve: snap.reserve ?? 0,
    holstered: snap.holstered === undefined ? null : snap.holstered,
    equipLeftMs: snap.equipLeftMs ?? 0,
    reloadLeftMs: snap.reloadLeftMs ?? 0,
    cooldownMs: snap.cooldownMs ?? 0,
    shots: snap.shots ?? 0,
    punchPitch: snap.punchPitch ?? 0,
    punchYaw: snap.punchYaw ?? 0,
    burst: snap.burst ?? 0,
    sinceShotMs: snap.sinceShotMs ?? 0,
    money: snap.money ?? base.money,
    hasBomb: snap.hasBomb ?? false,
  };
}

/** Monta um `Match` a partir do snapshot, no formato que HUD, cena e áudio já leem. */
export function applySnapshot(prev: Match | null, snap: CsSnapshot, base: { roster: RosterEntry[]; map: MapDef }): Match {
  const byId = new Map(snap.players.map((p) => [p.id, p]));
  const before = new Map(prev?.world.players.map((p) => [p.id, p]));
  const players = base.roster.map((entry) => toSimPlayer(entry, byId.get(entry.id), before.get(entry.id), snap.roundIndex));
  const gated = snap.phase === 'buy' || snap.phase === 'prep';
  return {
    world: {
      map: gated ? withBarrier(base.map) : base.map,
      baseMap: base.map,
      roundIndex: snap.roundIndex,
      phase: snap.phase,
      phaseLeftMs: snap.phaseLeftMs,
      players,
      bomb: snap.bomb,
      end: snap.end,
      rng: 0,
      events: [],
    },
    score: snap.score,
    lossStreak: snap.lossStreak,
    roundIndex: snap.roundIndex,
    winner: snap.winner,
    forfeitedBy: snap.forfeitedBy,
    memories: {},
    roster: base.roster,
    mapId: base.map.id,
    difficulty: prev?.difficulty ?? 'normal',
    stats: snap.stats,
    rng: 0,
    pauseMs: snap.pauseMs,
    botsBought: true,
  };
}

export interface PoseSnap {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Pose de cada jogador entre dois snapshots (`alpha` 0 = o antigo, 1 = o novo); o yaw toma o menor arco. */
export function interpolatePlayers(
  older: Pick<CsSnapshot, 'players'>,
  newer: Pick<CsSnapshot, 'players'>,
  alpha: number,
): Map<string, PoseSnap> {
  const t = clamp(alpha, 0, 1);
  const before = new Map(older.players.map((p) => [p.id, p]));
  const out = new Map<string, PoseSnap>();
  for (const now of newer.players) {
    const was = before.get(now.id);
    if (!was) {
      out.set(now.id, { x: now.x, y: now.y, z: now.z, yaw: now.yaw, pitch: now.pitch });
      continue;
    }
    out.set(now.id, {
      x: was.x + (now.x - was.x) * t,
      y: was.y + (now.y - was.y) * t,
      z: was.z + (now.z - was.z) * t,
      yaw: was.yaw + wrapAngle(now.yaw - was.yaw) * t,
      pitch: was.pitch + (now.pitch - was.pitch) * t,
    });
  }
  return out;
}

/** O corpo do próprio jogador agora: o do servidor mais as entradas que ele ainda não confirmou. */
export function predictBody(
  map: MapDef,
  server: Body,
  pending: readonly CsInputMsg[],
  weapon: WeaponId,
  alive: boolean,
  phase: RoundPhase,
): Body {
  if (!alive || phase === 'buy' || phase === 'over' || pending.length === 0) return server;
  let body = server;
  for (const { input } of pending) {
    body = moveBody(map, body, inputWish(input), input.jump, input.crouch, WEAPONS[weapon].moveSpeedMult, CS_STEP_MS / 1000, input.walk);
  }
  return body;
}
