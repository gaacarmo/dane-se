import { AnimatePresence, motion } from 'framer-motion';
import { actions, useClient } from '../lib/store';

const GAME_NAMES = { danese: 'Dane-se', poker: 'Poker' } as const;

/** Friends calling you to their table, at the top of any screen. */
export function InviteToast() {
  const { invites, room } = useClient();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {invites.map((invite) => (
          <motion.div
            key={invite.id}
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-2xl bg-felt-900/95 p-3 shadow-2xl ring-1 ring-gold-500/50 backdrop-blur"
            role="alert"
          >
            <span className="min-w-0 flex-1 text-sm text-stone-100">
              <strong className="text-gold-300">{invite.fromName}</strong> te chamou pra uma mesa de{' '}
              {GAME_NAMES[invite.gameType] ?? invite.gameType}
            </span>
            <button
              type="button"
              onClick={() => void actions.acceptInvite(invite)}
              className="rounded-xl bg-gold-400 px-3 py-2 text-sm font-bold text-wood-900"
            >
              {room?.code === invite.code ? 'Já está aqui' : room ? 'Sair e entrar' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={() => actions.dismissInvite(invite.id)}
              className="grid size-9 place-items-center rounded-xl text-stone-400 hover:bg-white/10"
              aria-label="Ignorar convite"
            >
              ✕
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
