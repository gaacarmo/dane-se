import {
  BOMB_MS,
  WEAPONS,
  eyePos,
  type Match,
  type Vec3,
  type WorldEvent,
} from '@dane-se/shared';
import { csAudio } from '../../lib/csAudio';

const STEP_SPEED = 3.2;
const STRIDE = 2.2;
const EMPTY_CLICK_GAP_MS = 250;
const HEARD_GAP_MS = 380;

/** Traduz o estado e os eventos do motor em sons: tiros, passos, recarga, bomba e fim de rodada. */
export class AudioDirector {
  private stride = new Map<string, number>();
  private beepWait = 0;
  private lastReload = 0;
  private lastWeapon = '';
  private lastProgress = false;
  private lastPhase = '';
  private lastEnd = false;
  private lastEmptyAt = 0;
  private lastHeardAt = 0;

  onEvents(match: Match, events: WorldEvent[], meId: string): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          csAudio.shot(WEAPONS[e.weapon].category, e.from, e.shooter === meId);
          break;
        case 'hit':
          if (e.attacker === meId) csAudio.hit(e.zone, e.killed);
          if (e.victim === meId) csAudio.hurt();
          break;
        case 'plant':
          if (match.world.bomb.pos) csAudio.planted(match.world.bomb.pos);
          break;
        case 'defuse':
          if (match.world.bomb.pos) csAudio.defused(match.world.bomb.pos);
          break;
        case 'explode':
          if (match.world.bomb.pos) csAudio.explode(match.world.bomb.pos);
          break;
        default:
          break;
      }
    }
  }

  /** Passos de inimigos fora de vista (rede). Chegam a cada snapshot; o som sai no máximo a cada HEARD_GAP_MS. */
  heard(positions: Vec3[], now: number): void {
    if (now - this.lastHeardAt < HEARD_GAP_MS) return;
    this.lastHeardAt = now;
    for (const at of positions) csAudio.step(at, false);
  }

  /** Clique de pente vazio quando o jogador aperta o gatilho sem munição. */
  emptyClick(match: Match, meId: string, now: number): void {
    const me = match.world.players.find((p) => p.id === meId);
    if (!me?.alive || me.ammo > 0 || me.reserve > 0 || me.reloadLeftMs > 0) return;
    if (now - this.lastEmptyAt < EMPTY_CLICK_GAP_MS) return;
    this.lastEmptyAt = now;
    csAudio.empty();
  }

  /** Uma vez por quadro: ouvinte, passos, recarga, troca de arma, bip da bomba e fases. */
  frame(match: Match, dtSec: number, meId: string, yaw: number): void {
    const { world } = match;
    const me = world.players.find((p) => p.id === meId);
    if (!me) return;
    csAudio.setListener(eyePos(me.body), yaw);

    if (world.phase === 'live') {
      for (const p of world.players) {
        if (!p.alive || !p.body.onGround) {
          this.stride.set(p.id, 0);
          continue;
        }
        const speed = Math.hypot(p.body.vel.x, p.body.vel.z);
        if (speed < STEP_SPEED) continue;
        const walked = (this.stride.get(p.id) ?? 0) + speed * dtSec;
        if (walked >= STRIDE) {
          this.stride.set(p.id, walked - STRIDE);
          csAudio.step(p.body.pos, p.id === meId);
        } else {
          this.stride.set(p.id, walked);
        }
      }
    }

    if (me.reloadLeftMs > 0 && this.lastReload === 0) csAudio.reload(WEAPONS[me.weapon].reloadMs);
    this.lastReload = me.reloadLeftMs;
    if (this.lastWeapon && me.weapon !== this.lastWeapon && me.alive && world.phase === 'live') csAudio.switchWeapon();
    this.lastWeapon = me.weapon;

    const progressing = world.bomb.progress?.who === meId;
    if (progressing && !this.lastProgress) {
      const at: Vec3 = world.bomb.pos ?? me.body.pos;
      if (world.bomb.status === 'planted') csAudio.defuseStart(at);
      else csAudio.plantStart(at);
    }
    this.lastProgress = progressing;

    if (world.bomb.status === 'planted' && world.bomb.pos) {
      this.beepWait -= dtSec;
      if (this.beepWait <= 0) {
        csAudio.bombBeep(world.bomb.pos);
        this.beepWait = 0.12 + 0.9 * Math.max(0, world.bomb.explodeInMs / BOMB_MS);
      }
    } else {
      this.beepWait = 0;
    }

    if (world.phase !== this.lastPhase) {
      if (world.phase === 'live') csAudio.roundStart();
      this.lastPhase = world.phase;
    }
    const ended = !!world.end;
    if (ended && !this.lastEnd) csAudio.roundEnd(world.end!.winner === me.team);
    this.lastEnd = ended;
  }
}
