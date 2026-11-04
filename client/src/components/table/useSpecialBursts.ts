import { useEffect, useRef, useState } from 'react';
import type { PublicPlayer } from '@dane-se/shared';

const BURST_MS = 1500;

/**
 * Detects the public moment a player's 1× special leaves its aura
 * (`specialCharged` true → false) and hands back a per-player burst id for a
 * short while, so every client can flash the same energy at that seat. The
 * ability itself stays secret; only "a special went off" is shared, exactly
 * what `specialCharged` already reveals.
 */
export function useSpecialBursts(players: PublicPlayer[]): Map<string, number> {
  const prev = useRef<Map<string, boolean>>(new Map());
  const seq = useRef(0);
  const addedAt = useRef<Map<string, number>>(new Map());
  const [bursts, setBursts] = useState<Map<string, number>>(new Map());

  // Only re-runs when some player's charged flag flips, not on every render.
  const signature = players.map((p) => `${p.id}:${p.specialCharged ? 1 : 0}`).join(',');

  useEffect(() => {
    const next = new Map<string, boolean>();
    const fired: Array<[string, number]> = [];
    for (const p of players) {
      next.set(p.id, p.specialCharged);
      if (prev.current.get(p.id) === true && !p.specialCharged) fired.push([p.id, ++seq.current]);
    }
    prev.current = next;
    if (fired.length === 0) return;

    const now = Date.now();
    setBursts((b) => {
      const copy = new Map(b);
      for (const [id, key] of fired) {
        copy.set(id, key);
        addedAt.current.set(id, now);
      }
      return copy;
    });
    // `players` is a fresh array each render, so depend on the derived signature only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Prune expired bursts. Runs on its own clock so re-renders can't cancel it.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setBursts((b) => {
        const copy = new Map(b);
        let changed = false;
        for (const [id] of b) {
          if (now - (addedAt.current.get(id) ?? 0) > BURST_MS) {
            copy.delete(id);
            addedAt.current.delete(id);
            changed = true;
          }
        }
        return changed ? copy : b;
      });
    }, 400);
    return () => clearInterval(t);
  }, []);

  return bursts;
}
