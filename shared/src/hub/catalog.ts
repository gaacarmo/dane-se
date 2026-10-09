import type { GameType } from './gameModule.js';
import type { Money } from './money.js';

/** Public metadata the hub shows for each game. Server and client share it. */
export interface GameCatalogEntry {
  id: GameType;
  /** pt-BR display name. */
  name: string;
  /** pt-BR one-liner. */
  description: string;
  minPlayers: number;
  maxPlayers: number;
  minEntry: Money;
  defaultEntry: Money;
  entryOptions: readonly Money[];
  /** Icon shown on the hub card. */
  icon: string;
  /** False while a game is still being built: the hub shows it disabled ("em breve"). */
  available: boolean;
}

export const GAME_CATALOG: readonly GameCatalogEntry[] = [
  {
    id: 'danese',
    name: 'Dane-se (Fodinha)',
    description: 'O clássico da mesa. Faça seu palpite, cumpra e não deixe a palavra completar.',
    minPlayers: 2,
    maxPlayers: 6,
    minEntry: 100,
    defaultEntry: 100,
    entryOptions: [100, 250, 500, 1000],
    icon: '🃏',
    available: true,
  },
  {
    id: 'poker',
    name: "Poker Texas Hold'em",
    description: "Mesa de cash game: sente com um buy-in, jogue mãos seguidas e saia com o que tiver.",
    minPlayers: 2,
    maxPlayers: 8,
    minEntry: 1000,
    defaultEntry: 1000,
    entryOptions: [1000, 2500, 5000, 10000],
    icon: '♠️',
    available: true,
  },
];

export function catalogEntry(id: GameType): GameCatalogEntry {
  const entry = GAME_CATALOG.find((g) => g.id === id);
  if (!entry) throw new Error(`Unknown game ${id}`);
  return entry;
}
