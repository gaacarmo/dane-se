import { motion } from 'framer-motion';
import type { GameType } from '@dane-se/shared';

/** Tudo que aparece no catálogo: os jogos do hub e o modo CS. */
export type HubGameId = GameType | 'cs';

/** Visual de cada jogo no hub: ícone de app, cor e uma frase curta. */
export const GAME_LOOK: Record<HubGameId, { icon: string; tagline: string; gradient: string; glow: string }> = {
  danese: {
    icon: '🃏',
    tagline: 'Palpite e vazas',
    gradient: 'from-emerald-400 via-felt-600 to-felt-900',
    glow: 'rgb(52 211 153 / 0.35)',
  },
  poker: {
    icon: '♠️',
    tagline: 'Cash game com fichas',
    gradient: 'from-stone-100 via-stone-300 to-stone-500',
    glow: 'rgb(214 211 209 / 0.3)',
  },
  truco: {
    icon: '🂡',
    tagline: 'Duplas, blefe e grito',
    gradient: 'from-red-400 via-red-700 to-wine-800',
    glow: 'rgb(248 113 113 / 0.35)',
  },
  cs: {
    icon: '🎯',
    tagline: 'Tiro 3 contra 3',
    gradient: 'from-sky-400 via-indigo-700 to-indigo-950',
    glow: 'rgb(56 189 248 / 0.35)',
  },
};

/** O "ícone de app" do jogo: quadrado arredondado com degradê e brilho no topo. */
export function GameIcon({ id, size = 'md' }: { id: HubGameId; size?: 'md' | 'lg' }) {
  const look = GAME_LOOK[id];
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br ring-1 ring-white/15 ${look.gradient} ${
        size === 'lg' ? 'size-16 rounded-[1.15rem] text-3xl' : 'size-14 rounded-[1rem] text-[1.6rem]'
      }`}
      style={{ boxShadow: `0 10px 24px -10px ${look.glow}, inset 0 1px 0 rgb(255 255 255 / 0.25)` }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
      <span className="relative drop-shadow-[0_2px_2px_rgb(0_0_0/0.4)]">{look.icon}</span>
    </span>
  );
}

/** Um jogo na grade do hub. Tocar seleciona e abre os detalhes logo abaixo. */
export function GameTile({
  id,
  name,
  selected,
  badge,
  disabled,
  onSelect,
}: {
  id: HubGameId;
  name: string;
  selected: boolean;
  /** Etiqueta pequena no canto ("novo", "em breve"). */
  badge?: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      // `.hub-panel` owns box-shadow (so `ring` would be overridden): the selection is an outline.
      className={`hub-panel relative flex w-full flex-col items-start gap-3 p-3.5 text-left transition-[outline-color,border-color] disabled:cursor-not-allowed disabled:opacity-55 ${
        selected ? 'border-gold-400/70! outline-2 outline-gold-400' : 'outline-2 outline-transparent hover:border-gold-400/45!'
      }`}
    >
      <span className="flex w-full items-start justify-between">
        <GameIcon id={id} />
        {selected ? (
          <motion.span
            layoutId="hub-check"
            className="grid size-6 place-items-center rounded-full bg-gold-400 text-xs font-black text-wood-900"
          >
            ✓
          </motion.span>
        ) : (
          badge && (
            <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
              {badge}
            </span>
          )
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] leading-tight font-semibold text-white">{name}</span>
        <span className="mt-0.5 block truncate text-xs text-stone-400">{GAME_LOOK[id].tagline}</span>
      </span>
    </motion.button>
  );
}
