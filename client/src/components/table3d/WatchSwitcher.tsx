import { useState } from 'react';

export interface Watchable {
  id: string;
  name: string;
}

/**
 * Who an out-of-the-game player is watching from. Only moves the camera to that seat: what is shown still comes
 * from this player's own view, so switching never reveals anyone's hidden cards.
 */
export function useWatchedSeat(candidates: Watchable[], youId: string, canWatch: boolean) {
  const [watchedId, setWatchedId] = useState<string | null>(null);
  const valid = canWatch && candidates.some((c) => c.id === watchedId);
  const current = valid ? watchedId! : youId;
  const step = (dir: 1 | -1) => {
    if (candidates.length === 0) return;
    const i = candidates.findIndex((c) => c.id === current);
    const next = candidates[(i + dir + candidates.length) % candidates.length]!;
    setWatchedId(next.id);
  };
  return { watchedId: current, step };
}

export function WatchSwitcher({
  name,
  isYou,
  onStep,
}: {
  name: string;
  isYou: boolean;
  onStep: (dir: 1 | -1) => void;
}) {
  return (
    <div className="absolute top-2 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 p-1 text-sm text-white shadow-xl ring-1 ring-white/20 backdrop-blur">
      <button
        type="button"
        onClick={() => onStep(-1)}
        className="grid size-9 place-items-center rounded-full hover:bg-white/15"
        aria-label="Assistir o jogador anterior"
      >
        ◀
      </button>
      <span className="min-w-36 px-1 text-center whitespace-nowrap">
        <span className="text-stone-400">Assistindo </span>
        <strong className="text-gold-300">{isYou ? 'da sua cadeira' : name}</strong>
      </span>
      <button
        type="button"
        onClick={() => onStep(1)}
        className="grid size-9 place-items-center rounded-full hover:bg-white/15"
        aria-label="Assistir o próximo jogador"
      >
        ▶
      </button>
    </div>
  );
}
