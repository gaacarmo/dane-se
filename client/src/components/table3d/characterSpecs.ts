import type { CharacterId } from '@dane-se/shared';

export type ShirtPattern = 'solid' | 'hoops' | 'band' | 'sash';

/** What the drawn body needs; the head always comes from the character's portrait. */
export interface CharacterSpec {
  skin: string;
  shirt: { base: string; accent: string; pattern: ShirtPattern; hood?: boolean };
  /** Small round detail on the chest (crest, badge). */
  badge?: string;
  /** Which way the portrait looks on its own: -1 viewer's left, 1 viewer's right, 0 straight ahead. */
  faces: -1 | 0 | 1;
}

export const CHARACTER_SPECS: Record<CharacterId, CharacterSpec> = {
  carmelo: { skin: '#f0b48f', shirt: { base: '#17140f', accent: '#d8b560', pattern: 'solid', hood: true }, faces: 0 },
  martelo: { skin: '#f2b690', shirt: { base: '#17140f', accent: '#f4f1ea', pattern: 'sash' }, badge: '#c8312c', faces: 0 },
  babin: { skin: '#e3a47c', shirt: { base: '#15130f', accent: '#2a9fd6', pattern: 'solid' }, badge: '#d94a5a', faces: 0 },
  dezin: { skin: '#e8a47f', shirt: { base: '#f1eee6', accent: '#1f6a42', pattern: 'band' }, badge: '#1f6a42', faces: 1 },
  sornitas: { skin: '#e9aa84', shirt: { base: '#141210', accent: '#c4202a', pattern: 'hoops' }, badge: '#d9d2c4', faces: 1 },
  colombo: { skin: '#e7a883', shirt: { base: '#5d6a45', accent: '#7fa387', pattern: 'solid', hood: true }, faces: 0 },
};
