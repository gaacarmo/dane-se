const AVATAR_COLORS = ['#c0392b', '#2471a3', '#b9770e', '#7d3c98', '#1e8449', '#a04000', '#117a65', '#884ea0'];

/** Stable color per player, so the same friend always has the same avatar color. */
export function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

export function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?';
}
