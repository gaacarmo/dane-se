export type PingKind = 'attention' | 'enemy' | 'go';

export interface Ping {
  id: number;
  kind: PingKind;
  x: number;
  z: number;
  by: string;
  at: number;
}

export const PING_TTL_MS = 8000;
export const MAX_PINGS_PER_PLAYER = 3;

/** Acrescenta o ping, descarta os vencidos e mantém só os MAX_PINGS_PER_PLAYER mais novos de quem pingou. */
export function addPing(pings: Ping[], ping: Ping): Ping[] {
  const alive = pings.filter((p) => ping.at - p.at < PING_TTL_MS);
  const mine = alive.filter((p) => p.by === ping.by);
  const excess = Math.max(0, mine.length - MAX_PINGS_PER_PLAYER + 1);
  const dropped = new Set(mine.slice(0, excess));
  return [...alive.filter((p) => !dropped.has(p)), ping];
}
