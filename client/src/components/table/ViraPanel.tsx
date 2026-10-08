import { motion } from 'framer-motion';
import { type Card, type Rank, SUITS } from '@dane-se/shared';
import { PlayingCard } from '../cards/PlayingCard';
import { SuitIcon } from '../cards/suits';

/** The vira and the manilha it makes, always on screen (on the table the vira is small and easy to miss). */
export function ViraPanel({ vira, manilhaRank, roundKey }: { vira: Card; manilhaRank: Rank; roundKey: number }) {
  return (
    // Appears when the vira is turned over, a moment after the cards are dealt.
    <motion.aside
      key={roundKey}
      initial={{ opacity: 0, scale: 0.8, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 1.1, type: 'spring', stiffness: 220, damping: 18 }}
      className="pointer-events-none flex items-center gap-3 rounded-2xl bg-black/65 p-2 shadow-xl ring-1 ring-gold-500/50 backdrop-blur"
      aria-label={`Vira e manilha ${manilhaRank}`}
    >
      <div className="w-14 shrink-0" aria-hidden>
        <PlayingCard card={vira} />
      </div>
      <div className="min-w-0 text-white">
        <p className="text-[10px] tracking-wider text-stone-300 uppercase">Vira</p>
        <p className="text-xs text-stone-300">
          Manilha <strong className="ml-1 text-2xl font-black text-gold-300">{manilhaRank}</strong>
        </p>
        <span
          className="mt-1 flex items-center gap-[1px] rounded-full bg-paper px-1.5 py-0.5"
          aria-label="Paus maior que Copas, maior que Espadas, maior que Ouros"
        >
          {[...SUITS].reverse().map((s, i) => (
            <span key={s} className="flex items-center">
              {i > 0 && <span className="px-[1px] text-[9px] text-stone-500">›</span>}
              <SuitIcon suit={s} className="size-3" />
            </span>
          ))}
        </span>
      </div>
    </motion.aside>
  );
}
