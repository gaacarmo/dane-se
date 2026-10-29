import type { CharacterId } from '../characters.js';
import type { Difficulty } from './bot.js';
import type { RosterEntry } from './sim.js';
import type { TeamId } from './types.js';

export const TEAM_LIMIT = 3;

export interface CsMember {
  id: string;
  name: string;
  team: TeamId;
  isHost: boolean;
  connected: boolean;
  character: CharacterId;
}

export type CsRoomStatus = 'lobby' | 'playing' | 'finished';

export interface CsLobbyView {
  code: string;
  youId: string;
  hostId: string;
  status: CsRoomStatus;
  /** Só os humanos: os bots entram sozinhos para completar cada time. */
  members: CsMember[];
  difficulty: Difficulty;
  teamSize: number;
}

/** O que o cliente precisa saber de uma partida que começou (ou recomeçou) para montar a cena. */
export interface CsStartInfo {
  mapId: string;
  roster: RosterEntry[];
}

/** Cabe mais um humano no time? Quem já está nele sempre pode ficar. */
export function canJoinTeam(members: readonly CsMember[], memberId: string, team: TeamId): boolean {
  const inTeam = members.filter((m) => m.team === team);
  return inTeam.some((m) => m.id === memberId) || inTeam.length < TEAM_LIMIT;
}

/** O time com menos humanos; empate vai para o A. */
export function autoTeam(members: readonly CsMember[]): TeamId {
  const a = members.filter((m) => m.team === 'A').length;
  const b = members.filter((m) => m.team === 'B').length;
  return a <= b ? 'A' : 'B';
}

export function startError(members: readonly CsMember[]): 'NOT_ENOUGH_PLAYERS' | null {
  return members.length === 0 ? 'NOT_ENOUGH_PLAYERS' : null;
}

/** Desistir passa com mais da metade dos humanos do time; com um humano só, um voto basta. */
export function forfeitPassed(votes: ReadonlySet<string>, teamHumanIds: readonly string[]): boolean {
  if (teamHumanIds.length === 0) return false;
  const count = teamHumanIds.filter((id) => votes.has(id)).length;
  return count * 2 > teamHumanIds.length;
}
