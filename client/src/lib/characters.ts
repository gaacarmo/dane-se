import type { CharacterId } from '@dane-se/shared';

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  carmelo: 'Carmelo',
  martelo: 'Martelo',
  babin: 'Babin Tom Sahur',
  dezin: 'Dezin du Couto',
  sarney: 'Sarney',
  colombo: 'Colombo',
};

export function portraitUrl(id: CharacterId): string {
  return `/characters/${id}.png`;
}
