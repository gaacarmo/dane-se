import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode, useEffect } from 'react';

/**
 * iOS-style sheet: thick glass, large corners, a grabber on phones (it rises
 * from the bottom) and centered on wider screens. Inside the hub it follows
 * the light/dark appearance; at the game tables (always dark) it stays dark.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  followAppearance = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Use the hub's light/dark appearance instead of always dark. */
  followAppearance?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`ios-sheet fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4 ${followAppearance ? '' : 'ios-force-dark'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* Slide only (no fade on the glass itself): Safari can leave glass inside a fading parent unpainted. */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="glass glass-thick m-2 flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-[2.2rem]! pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:pb-2"
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            exit={{ y: '110%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div aria-hidden className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-ios-label-3 sm:hidden" />
            <header className="relative flex min-h-14 shrink-0 items-center justify-center px-14">
              <h2 className="truncate text-[17px] font-semibold text-ios-label">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="glass-control absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ios-label-2 transition active:scale-95"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-ios-label">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
