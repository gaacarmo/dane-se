import { useCallback, useRef, useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function set(value: boolean) {
  open = value;
  listeners.forEach((l) => l());
}

/** O modo CS é escondido: só abre por `useSecretTap` e nunca persiste entre visitas. */
export const csMode = {
  open: () => set(true),
  close: () => set(false),
};

export function useCsOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
  );
}

/** Chama `onTrigger` após `count` cliques seguidos dentro de `windowMs`. Sem nenhuma dica visual. */
export function useSecretTap(onTrigger: () => void, count = 5, windowMs = 2000): () => void {
  const taps = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t <= windowMs), now];
    if (taps.current.length >= count) {
      taps.current = [];
      onTrigger();
    }
  }, [onTrigger, count, windowMs]);
}
