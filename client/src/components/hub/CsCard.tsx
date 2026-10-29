/** O modo CS no catálogo do hub: abre direto, sem sala, entrada ou prêmio. */
export function CsCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hub-panel group relative flex w-full items-center gap-3.5 overflow-hidden rounded-3xl p-3.5 text-left transition hover:border-gold-400/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 active:translate-y-px"
    >
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/25 text-2xl ring-1 ring-white/10">
        🎯
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-white">Modo CS</span>
        <span className="mt-0.5 block text-sm leading-snug text-stone-300">
          Tiro em primeira pessoa: você e 2 bots contra 3 bots. Plante e desarme a bomba, rodada a rodada.
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-400">
          <span className="rounded-full bg-black/30 px-2 py-0.5 ring-1 ring-white/10">🖥️ no computador</span>
          <span className="rounded-full bg-black/30 px-2 py-0.5 ring-1 ring-white/10">🚫 sem entrada nem prêmio</span>
        </span>
      </span>
    </button>
  );
}
