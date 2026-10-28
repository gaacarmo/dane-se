import { botBuy, botInput, createBotMemory, type BotMemory } from './bot.js';
import { buyWeapon } from './buy.js';
import { START_MONEY, addMoney, nextLossStreak, roundReward } from './economy.js';
import { SWAP_EVERY, matchWinner, sideOf } from './match.js';
import { drawMap } from './map.js';
import { IDLE_INPUT, createWorld, stepWorld, type PlayerInput, type RosterEntry, type World } from './sim.js';
import type { TeamId } from './types.js';
import { STARTER_WEAPON, type WeaponId } from './weapons.js';

export const TEAM_SIZE = 3;
export const ROUND_PAUSE_MS = 3000;

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
  rng: number;
  /** Pausa entre rodadas; nula enquanto a rodada está rolando. */
  pauseMs: number | null;
  botsBought: boolean;
}

function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

/** Humanos ocupam o time A até 3 e depois o B; bots completam os dois times até 3. */
export function createMatch(humans: { id: string; name: string }[], seed: number): Match {
  const roster: RosterEntry[] = [];
  const memories: Record<string, BotMemory> = {};
  const seats: Record<TeamId, { id: string; name: string }[]> = {
    A: humans.slice(0, TEAM_SIZE),
    B: humans.slice(TEAM_SIZE, TEAM_SIZE * 2),
  };

  for (const team of ['A', 'B'] as const) {
    for (const h of seats[team]) {
      roster.push({ id: h.id, name: h.name, team, bot: false, money: START_MONEY, weapon: STARTER_WEAPON });
    }
    for (let n = seats[team].length + 1; n <= TEAM_SIZE; n++) {
      const id = `bot-${team}${n}`;
      roster.push({ id, name: `Bot ${team}${n}`, team, bot: true, money: START_MONEY, weapon: STARTER_WEAPON });
      memories[id] = createBotMemory(seed + roster.length * 13);
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
    rng: drawn.rng,
    pauseMs: null,
    botsBought: false,
  };
}

/** Compra de um humano; devolve a mesma partida se o mercado recusar. */
export function buyForPlayer(match: Match, playerId: string, weapon: WeaponId): Match {
  const world = buyWeapon(match.world, playerId, weapon);
  return world === match.world ? match : { ...match, world };
}

export function forfeit(match: Match, team: TeamId): Match {
  return { ...match, winner: otherTeam(team), forfeitedBy: team };
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
    return { ...entry, money: addMoney(p.money, rewards[entry.team]), weapon: p.alive ? p.weapon : STARTER_WEAPON };
  });
  const score = { ...match.score, [end.winner]: match.score[end.winner] + 1 };
  const winner = matchWinner(score.A, score.B);
  return { ...match, roster, score, lossStreak, winner, pauseMs: winner ? null : ROUND_PAUSE_MS };
}

function startNextRound(match: Match): Match {
  const roundIndex = match.roundIndex + 1;
  const swapping = roundIndex % SWAP_EVERY === 0;
  const roster = swapping
    ? match.roster.map((r) => ({ ...r, money: START_MONEY, weapon: STARTER_WEAPON }))
    : match.roster;
  return {
    ...match,
    roster,
    roundIndex,
    lossStreak: swapping ? { A: 0, B: 0 } : match.lossStreak,
    world: createWorld(match.world.map, roundIndex, roster, match.world.rng),
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
      if (pick !== world.players.find((p) => p.id === entry.id)!.weapon) world = buyWeapon(world, entry.id, pick);
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

  return { ...match, world: stepWorld(world, inputs, dtMs), memories, botsBought: true };
}
