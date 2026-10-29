import { CHARACTER_IDS, type CharacterId } from '../characters.js';
import { shuffle } from '../rng.js';
import { BOT_SKILLS, botBuy, botInput, createBotMemory, varySkill, type BotMemory, type Difficulty } from './bot.js';
import { buyWeapon } from './buy.js';
import { START_MONEY, addMoney, nextLossStreak, roundReward } from './economy.js';
import { isSideSwapRound, matchWinner, sideOf } from './match.js';
import { drawMap } from './map.js';
import {
  IDLE_INPUT,
  createWorld,
  stepWorld,
  type PlayerInput,
  type RosterEntry,
  type SimPlayer,
  type World,
  type WorldEvent,
} from './sim.js';
import type { TeamId } from './types.js';
import { STARTER_WEAPON, slotOf, type WeaponId } from './weapons.js';

export const TEAM_SIZE = 3;
export const ROUND_PAUSE_MS = 3000;

export interface PlayerStats {
  kills: number;
  deaths: number;
  headshots: number;
}

export interface Match {
  world: World;
  score: Record<TeamId, number>;
  lossStreak: Record<TeamId, number>;
  roundIndex: number;
  winner: TeamId | null;
  forfeitedBy: TeamId | null;
  memories: Record<string, BotMemory>;
  roster: RosterEntry[];
  mapId: string;
  difficulty: Difficulty;
  /** Abates, mortes e headshots de cada jogador na partida inteira. */
  stats: Record<string, PlayerStats>;
  rng: number;
  /** Pausa entre rodadas; nula enquanto a rodada está rolando. */
  pauseMs: number | null;
  botsBought: boolean;
}

function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

interface HumanSeat {
  id: string;
  name: string;
  /** Time escolhido no lobby; sem ele o humano ocupa o A e depois o B. */
  team?: TeamId;
}

const zeroStats = (): PlayerStats => ({ kills: 0, deaths: 0, headshots: 0 });

/** Humanos nos times que escolheram (ou A e depois B); bots completam os dois times até 3. */
export function createMatch(humans: HumanSeat[], seed: number, difficulty: Difficulty = 'normal'): Match {
  const roster: RosterEntry[] = [];
  const memories: Record<string, BotMemory> = {};
  const characters: CharacterId[] = shuffle(CHARACTER_IDS, seed).items;
  const seats: Record<TeamId, HumanSeat[]> = { A: [], B: [] };
  for (const h of humans) if (h.team) seats[h.team].push(h);
  if (seats.A.length > TEAM_SIZE || seats.B.length > TEAM_SIZE) throw new Error('TEAM_FULL');
  for (const h of humans) {
    if (h.team) continue;
    const team: TeamId = seats.A.length < TEAM_SIZE ? 'A' : 'B';
    if (seats[team].length >= TEAM_SIZE) throw new Error('TEAM_FULL');
    seats[team].push(h);
  }

  for (const team of ['A', 'B'] as const) {
    for (const h of seats[team]) {
      roster.push({
        id: h.id,
        name: h.name,
        team,
        bot: false,
        character: characters[roster.length]!,
        money: START_MONEY,
        weapon: STARTER_WEAPON,
      });
    }
    for (let n = seats[team].length + 1; n <= TEAM_SIZE; n++) {
      const id = `bot-${team}${n}`;
      roster.push({
        id,
        name: `Bot ${team}${n}`,
        team,
        bot: true,
        character: characters[roster.length]!,
        money: START_MONEY,
        weapon: STARTER_WEAPON,
      });
      memories[id] = createBotMemory(seed + roster.length * 13, varySkill(BOT_SKILLS[difficulty], seed + roster.length * 17));
    }
  }

  const drawn = drawMap(seed);
  return {
    world: createWorld(drawn.map, 0, roster, drawn.rng),
    score: { A: 0, B: 0 },
    lossStreak: { A: 0, B: 0 },
    roundIndex: 0,
    winner: null,
    forfeitedBy: null,
    memories,
    roster,
    mapId: drawn.map.id,
    difficulty,
    stats: Object.fromEntries(roster.map((r) => [r.id, zeroStats()])),
    rng: drawn.rng,
    pauseMs: null,
    botsBought: false,
  };
}

function idSeed(id: string): number {
  let sum = 17;
  for (const ch of id) sum = (sum * 31 + ch.charCodeAt(0)) | 0;
  return sum;
}

/** Liga ou desliga o bot de um jogador: quem sai da sala vira bot, quem volta retoma o controle. */
export function setBotControl(match: Match, playerId: string, bot: boolean): Match {
  const entry = match.roster.find((r) => r.id === playerId);
  if (!entry || entry.bot === bot) return match;
  const memories = { ...match.memories };
  if (bot) {
    const seed = match.rng + idSeed(playerId);
    memories[playerId] = createBotMemory(seed, varySkill(BOT_SKILLS[match.difficulty], seed));
  } else {
    delete memories[playerId];
  }
  return {
    ...match,
    memories,
    roster: match.roster.map((r) => (r.id === playerId ? { ...r, bot } : r)),
    world: { ...match.world, players: match.world.players.map((p) => (p.id === playerId ? { ...p, bot } : p)) },
  };
}

function withStats(stats: Record<string, PlayerStats>, events: WorldEvent[]): Record<string, PlayerStats> {
  let next = stats;
  for (const e of events) {
    if (e.type !== 'kill') continue;
    if (next === stats) next = { ...stats };
    const killer = next[e.killer] ?? zeroStats();
    const victim = next[e.victim] ?? zeroStats();
    next[e.killer] = { ...killer, kills: killer.kills + 1, headshots: killer.headshots + (e.headshot ? 1 : 0) };
    next[e.victim] = { ...victim, deaths: victim.deaths + 1 };
  }
  return next;
}

/** Compra de um humano; devolve a mesma partida se o mercado recusar. */
export function buyForPlayer(match: Match, playerId: string, weapon: WeaponId): Match {
  const world = buyWeapon(match.world, playerId, weapon);
  return world === match.world ? match : { ...match, world };
}

export function forfeit(match: Match, team: TeamId): Match {
  return { ...match, winner: otherTeam(team), forfeitedBy: team };
}

interface Loadout {
  weapon: WeaponId;
  holstered?: WeaponId;
}

/** Quem sobrevive começa a próxima rodada com a principal na mão e a pistola no coldre. */
function carriedLoadout(p: SimPlayer): Loadout {
  const held = [p.weapon, p.holstered?.weapon].filter((w): w is WeaponId => !!w);
  const primary = held.find((w) => slotOf(w) === 1);
  const pistol = held.find((w) => slotOf(w) === 2) ?? STARTER_WEAPON;
  return primary ? { weapon: primary, holstered: pistol } : { weapon: pistol };
}

function withLoadout(entry: RosterEntry, money: number, loadout: Loadout): RosterEntry {
  const { holstered: _previous, ...rest } = entry;
  return { ...rest, money, weapon: loadout.weapon, ...(loadout.holstered ? { holstered: loadout.holstered } : {}) };
}

function settleRound(match: Match): Match {
  const { world } = match;
  const end = world.end!;
  const planted = world.bomb.status !== 'carried';
  const rewards: Record<TeamId, number> = { A: 0, B: 0 };
  const lossStreak = { ...match.lossStreak };
  for (const team of ['A', 'B'] as const) {
    const won = team === end.winner;
    rewards[team] = roundReward({ won, lossStreak: match.lossStreak[team], side: sideOf(team, match.roundIndex), planted });
    lossStreak[team] = nextLossStreak(match.lossStreak[team], won);
  }

  const roster = match.roster.map((entry) => {
    const p = world.players.find((x) => x.id === entry.id)!;
    return withLoadout(entry, addMoney(p.money, rewards[entry.team]), p.alive ? carriedLoadout(p) : { weapon: STARTER_WEAPON });
  });
  const score = { ...match.score, [end.winner]: match.score[end.winner] + 1 };
  const winner = matchWinner(score.A, score.B);
  return { ...match, roster, score, lossStreak, winner, pauseMs: winner ? null : ROUND_PAUSE_MS };
}

function startNextRound(match: Match): Match {
  const roundIndex = match.roundIndex + 1;
  const swapping = isSideSwapRound(roundIndex);
  const roster = swapping
    ? match.roster.map((r) => withLoadout(r, START_MONEY, { weapon: STARTER_WEAPON }))
    : match.roster;
  return {
    ...match,
    roster,
    roundIndex,
    lossStreak: swapping ? { A: 0, B: 0 } : match.lossStreak,
    world: createWorld(match.world.baseMap, roundIndex, roster, match.world.rng),
    pauseMs: null,
    botsBought: false,
  };
}

export function stepMatch(match: Match, humanInputs: Record<string, PlayerInput>, dtMs: number): Match {
  if (match.winner) return match;

  if (match.world.end && match.pauseMs === null) return settleRound(match);
  if (match.pauseMs !== null) {
    const left = match.pauseMs - dtMs;
    return left <= 0 ? startNextRound(match) : { ...match, pauseMs: left };
  }

  let world = match.world;
  if (world.phase === 'buy' && !match.botsBought) {
    for (const entry of match.roster) {
      if (!entry.bot) continue;
      const pick = botBuy(world, entry.id);
      if (pick) world = buyWeapon(world, entry.id, pick);
    }
  }

  const memories = { ...match.memories };
  const inputs: Record<string, PlayerInput> = {};
  for (const p of world.players) {
    if (!p.bot) {
      inputs[p.id] = humanInputs[p.id] ?? { ...IDLE_INPUT, yaw: p.yaw, pitch: p.pitch };
      continue;
    }
    const out = botInput(world, p.id, memories[p.id]!, dtMs);
    inputs[p.id] = out.input;
    memories[p.id] = out.memory;
  }

  const next = stepWorld(world, inputs, dtMs);
  return { ...match, world: next, memories, botsBought: true, stats: withStats(match.stats, next.events) };
}
