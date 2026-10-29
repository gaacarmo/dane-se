import type { PingKind } from '@dane-se/shared';

export const PING_KINDS: Record<PingKind, { label: string; color: string }> = {
  attention: { label: 'Atenção', color: '#e8c66a' },
  enemy: { label: 'Inimigo', color: '#d9534f' },
  go: { label: 'Ir para cá', color: '#5aa0c8' },
};
