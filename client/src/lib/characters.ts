import type { CharacterId } from '@dane-se/shared';

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  carmelo: 'Carmelo',
  martelo: 'Martelo',
  babin: 'Babin Tom Sahur',
  dezin: 'Dezin du Couto',
  sarney: 'Sarney',
  colombo: 'Colombo',
};

/** Each character's accent color — tints the kit, the ability bar and the charged aura. */
export const CHARACTER_COLORS: Record<CharacterId, string> = {
  carmelo: '#f5f5f4', // branca
  martelo: '#3f3f46', // preta (grafite, pra aparecer no feltro)
  colombo: '#8b5a2b', // marrom
  dezin: '#22c55e', // verde
  babin: '#3b82f6', // azul
  sarney: '#ef4444', // vermelha
};

/** `#rgb`/`#rrggbb` → `rgb(r g b / a)`, for glows and shadows. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`;
}

export function portraitUrl(id: CharacterId): string {
  return `/characters/${id}.png`;
}
