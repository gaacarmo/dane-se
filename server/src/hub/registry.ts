import { daneseModule, type GameModule, type GameType } from '@dane-se/shared';

/**
 * The engine contract as seen by the room layer. The concrete module keeps its
 * own precise types; the registry erases them so `RoomManager` stays generic.
 */
export type AnyGameModule = GameModule<Record<string, unknown>, unknown, unknown, unknown>;

const modules = new Map<GameType, AnyGameModule>();

modules.set('danese', daneseModule as unknown as AnyGameModule);

export function gameModule(id: GameType): AnyGameModule | undefined {
  return modules.get(id);
}

export function registerGame(module: AnyGameModule): void {
  modules.set(module.id, module);
}

export function availableGames(): GameType[] {
  return [...modules.keys()];
}
