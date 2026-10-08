import { AnimatePresence, motion } from 'framer-motion';
import { dismissNotice, useClient } from '../../lib/store';

export function Toast() {
  const { notice } = useClient();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-3" aria-live="polite">
      <AnimatePresence>
        {notice && (
          <motion.button
            key={notice.id}
            onClick={dismissNotice}
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-left text-sm font-medium shadow-xl ring-1 ${
              notice.kind === 'error' ? 'bg-wine-700 text-white ring-white/20' : 'bg-felt-800 text-gold-300 ring-gold-500/40'
            }`}
          >
            {notice.kind === 'error' ? '⚠️ ' : ''}
            {notice.text}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Shown while the socket is down (e.g. the free server is waking up). */
export function ConnectionBanner() {
  const { connection, slowConnect } = useClient();
  if (connection === 'connected') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] flex justify-center p-3 safe-bottom" role="status">
      <div className="flex items-center gap-3 rounded-xl bg-black/80 px-4 py-3 text-sm text-stone-200 ring-1 ring-white/10">
        <span className="size-3 animate-pulse rounded-full bg-gold-400" />
        {slowConnect
          ? 'Acordando o servidor… no plano grátis isso pode levar até 1 minuto.'
          : connection === 'offline'
            ? 'Conexão perdida. Reconectando…'
            : 'Conectando…'}
      </div>
    </div>
  );
}
