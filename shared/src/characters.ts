export const CHARACTER_IDS = ['carmelo', 'martelo', 'babin', 'dezin', 'sarney', 'colombo'] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}
