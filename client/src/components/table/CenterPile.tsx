import { motion } from 'framer-motion';
import { type Card, type Rank, SUITS } from '@dane-se/shared';
import { CardBack, PlayingCard } from '../cards/PlayingCard';
import { SuitIcon } from '../cards/suits';
import type { Point } from './geometry';

const FLIP_HALF = 0.25;

/** Deck + vira (flipped after the deal) + manilha badge, in the middle of the felt. */
export function CenterPile({
  center,
  vira,
  manilhaRank,
  flipDelay,
  roundKey,
}: {
  center: Point;
  vira: Card;
  manilhaRank: Rank;
  flipDelay: number;
  roundKey: string;
}) {
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
      style={{ left: center.x, top: center.y }}
    >
      <div className="flex items-end gap-2">
        {/* Deck: a few offset backs to look like a stack. */}
        <div className="relative" style={{ width: 'var(--table-card-w)' }} aria-label="Baralho">
          {[3, 2, 1, 0].map((i) => (
            <div key={i} className={i === 0 ? 'relative' : 'absolute inset-0'} style={{ transform: `translate(${-i * 1.5}px, ${-i * 1.5}px)` }}>
              <CardBack />
            </div>
          ))}
        </div>

        {/* Vira: flips face up after the cards are dealt. */}
        {/* A 2D flip (the back squeezes away, the face opens up): 3D backface tricks
            are unreliable in WebKit and could leave the vira face down. */}
        <div className="relative" style={{ width: 'var(--table-card-w)' }} aria-label="Vira">
          <motion.div
            key={`face-${roundKey}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: flipDelay + FLIP_HALF, duration: FLIP_HALF, ease: 'easeOut' }}
          >
            <PlayingCard card={vira} />
          </motion.div>
          <motion.div
            key={`back-${roundKey}`}
            className="absolute inset-0"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ delay: flipDelay, duration: FLIP_HALF, ease: 'easeIn' }}
            aria-hidden
          >
            <CardBack />
          </motion.div>
        </div>
      </div>

      <motion.div
        key={`badge-${roundKey}`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: flipDelay + 0.5 }}
        className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs whitespace-nowrap shadow-lg ring-1 ring-gold-500/60"
      >
        <span className="text-stone-300">Manilha:</span>
        <span className="text-sm font-black text-gold-300">{manilhaRank}</span>
        {/* Manilha suit order, strongest first, for quick reference. */}
        <span className="ml-0.5 hidden items-center gap-[1px] rounded-full bg-paper px-1.5 py-0.5 sm:flex" aria-label="Paus maior que Copas, maior que Espadas, maior que Ouros">
          {[...SUITS].reverse().map((s, i) => (
            <span key={s} className="flex items-center">
              {i > 0 && <span className="px-[1px] text-[9px] text-stone-500">›</span>}
              <SuitIcon suit={s} className="size-3" />
            </span>
          ))}
        </span>
      </motion.div>
    </div>
  );
}
