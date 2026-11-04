import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function set(value: boolean) {
  open = value;
  listeners.forEach((l) => l());
}

/** Abre e fecha o modo CS a partir do card do hub; o estado não persiste entre visitas. */
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
