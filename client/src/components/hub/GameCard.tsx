import { formatMoney, type GameCatalogEntry } from '@dane-se/shared';

/** One game in the hub's catalog; clicking an available one opens its create panel. */
export function GameCard({
  game,
  selected,
  onSelect,
}: {
  game: GameCatalogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!game.available}
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex w-full items-center gap-3.5 overflow-hidden rounded-3xl p-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 active:translate-y-px ${
        selected
          ? 'bg-gradient-to-b from-felt-700 to-felt-800 shadow-[0_18px_40px_-22px_rgb(0_0_0/0.95)] ring-2 ring-gold-400'
          : 'hub-panel hover:border-gold-400/45 disabled:cursor-not-allowed disabled:opacity-55'
      }`}
    >
      <span
        aria-hidden
        className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/25 text-2xl ring-1 ring-white/10"
      >
        {game.icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-bold text-white">{game.name}</span>
          {!game.available && (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-stone-300">
              em breve
            </span>
          )}
          {selected && <span className="ml-auto shrink-0 text-gold-300">✓</span>}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-stone-300">{game.description}</span>
        <span className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-400">
          <span className="rounded-full bg-black/30 px-2 py-0.5 ring-1 ring-white/10">
            👥 {game.minPlayers}–{game.maxPlayers} jogadores
          </span>
          <span className="rounded-full bg-black/30 px-2 py-0.5 ring-1 ring-white/10">
            💵 a partir de {formatMoney(game.minEntry)}
          </span>
        </span>
      </span>
    </button>
  );
}
