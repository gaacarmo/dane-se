import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { REACTIONS, REACTION_COOLDOWN_MS } from '@dane-se/shared';
import { sfx } from '../../lib/sound';
import { actions, useClient } from '../../lib/store';
import type { Point } from './geometry';

/** Emojis popping up over the seat of whoever sent them. */
export function ReactionBubbles({ seats }: { seats: Map<string, Point> }) {
  const { reactions } = useClient();
  const latest = reactions.at(-1)?.id;

  useEffect(() => {
    if (latest) sfx.pop();
  }, [latest]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[45]" aria-live="polite">
      <AnimatePresence>
        {reactions.map((r, i) => {
          const seat = seats.get(r.playerId);
          if (!seat) return null;
          // Several reactions from the same player stack up a little.
          const stack = reactions.slice(0, i).filter((o) => o.playerId === r.playerId).length;
          return (
            <motion.span
              key={r.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-5xl drop-shadow-[0_4px_8px_rgb(0_0_0/0.6)] select-none"
              style={{ left: seat.x + stack * 14, top: seat.y }}
              initial={{ scale: 0, y: 0, opacity: 0 }}
              animate={{ scale: [0, 1.35, 1], y: -46 - stack * 10, opacity: 1 }}
              exit={{ y: -90, opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 14 }}
            >
              {r.emoji}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * Round button on the table that opens the emoji palette. In the compact
 * (short landscape) layout it sits at the top, where there's free felt.
 */
export function ReactionPicker({ atTop = false }: { atTop?: boolean }) {
  const [open, setOpen] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);

  function send(emoji: string) {
    setOpen(false);
    setCoolingDown(true);
    void actions.react(emoji);
    setTimeout(() => setCoolingDown(false), REACTION_COOLDOWN_MS);
  }

  return (
    <div
      className={`absolute right-2 z-[46] flex items-end gap-2 ${atTop ? 'top-2 flex-col-reverse' : 'bottom-2 flex-col'}`}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            className="grid grid-cols-4 gap-1 rounded-2xl bg-black/85 p-2 shadow-2xl ring-1 ring-gold-500/50"
            initial={{ opacity: 0, scale: 0.8, y: atTop ? -10 : 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: atTop ? -10 : 10 }}
            style={{ transformOrigin: atTop ? 'top right' : 'bottom right' }}
            role="menu"
            aria-label="Reações"
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                role="menuitem"
                onClick={() => send(emoji)}
                className="grid size-11 place-items-center rounded-xl text-2xl transition hover:bg-white/15 active:scale-90"
                aria-label={`Reagir com ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={coolingDown}
        aria-expanded={open}
        aria-label="Reações"
        className={`grid size-12 place-items-center rounded-full bg-black/60 text-2xl shadow-lg ring-1 transition active:scale-90 disabled:opacity-40 ${
          open ? 'ring-gold-400' : 'ring-white/20'
        }`}
      >
        {open ? '✕' : '😀'}
      </button>
    </div>
  );
}
