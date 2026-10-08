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
      className={`flex min-h-14 w-full flex-col gap-1 rounded-2xl p-4 text-left ring-2 transition focus:outline-none focus-visible:ring-gold-400 ${
        selected
          ? 'bg-felt-700 ring-gold-400'
          : 'bg-black/30 ring-white/10 hover:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60'
      }`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-base font-bold text-white">
          <span className="mr-2 text-xl" aria-hidden>
            {game.icon}
          </span>
          {game.name}
        </span>
        {selected && <span className="text-gold-300">✓</span>}
        {!game.available && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-stone-300">em breve</span>
        )}
      </span>
      <span className="text-sm leading-snug text-stone-300">{game.description}</span>
      <span className="mt-1 text-xs text-stone-400">
        {game.minPlayers}–{game.maxPlayers} jogadores · entrada a partir de {formatMoney(game.minEntry)}
      </span>
    </button>
  );
}