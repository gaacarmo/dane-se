import { useEffect, useState } from 'react';
import { MAPS } from '@dane-se/shared';

const SPIN_MS = 1800;
const REVEAL_MS = 900;

/** Tela rápida do sorteio de mapa antes da partida. */
export function CsMapDraw({ mapId, onDone }: { mapId: string; onDone: () => void }) {
  const [tick, setTick] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const spin = setInterval(() => setTick((t) => t + 1), 110);
    const reveal = setTimeout(() => {
      clearInterval(spin);
      setRevealed(true);
    }, SPIN_MS);
    const done = setTimeout(onDone, SPIN_MS + REVEAL_MS);
    return () => {
      clearInterval(spin);
      clearTimeout(reveal);
      clearTimeout(done);
    };
  }, [onDone]);

  const final = MAPS.find((m) => m.id === mapId) ?? MAPS[0]!;
  const shown = revealed ? final : MAPS[tick % MAPS.length]!;

  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black font-mono text-stone-200">
      <p className="text-xs tracking-[0.3em] text-stone-500 uppercase">Sorteando mapa</p>
      <p className={`text-4xl font-bold tracking-wide ${revealed ? 'text-gold-400' : 'text-stone-300'}`}>{shown.name}</p>
    </main>
  );
}
