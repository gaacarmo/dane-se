import { motion } from 'framer-motion';
import type { Card } from '@dane-se/shared';
import { CardBack, PlayingCard } from './PlayingCard';

const FAN: Card[] = [
  { rank: '3', suit: 'C' },
  { rank: 'K', suit: 'H' },
  { rank: '7', suit: 'D' },
  { rank: 'A', suit: 'S' },
];

/**
 * The brand motif: a small fan of cards plus a face-down card, used on the hub
 * and the lobby. `sm` keeps it compact for headers where vertical space is tight.
 */
export function CardFan({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const md = size === 'md';
  const spread = md ? 26 : 16;
  const tilt = md ? 14 : 12;
  const rise = md ? 6 : 4;

  return (
    <div className={`relative ${md ? 'h-36 w-64' : 'h-24 w-44'}`} aria-hidden>
      {FAN.map((card, i) => (
        <motion.div
          key={i}
          className={`absolute bottom-0 left-1/2 origin-bottom ${md ? 'w-20' : 'w-14'}`}
          initial={{ rotate: 0, x: '-50%', y: 30, opacity: 0 }}
          animate={{
            rotate: (i - 1.5) * tilt,
            x: `calc(-50% + ${(i - 1.5) * spread}px)`,
            y: Math.abs(i - 1.5) * rise,
            opacity: 1,
          }}
          transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 160, damping: 16 }}
        >
          <PlayingCard card={card} highlight={i === 0} />
        </motion.div>
      ))}
      <motion.div
        className={`absolute bottom-2 ${md ? '-right-6 w-14' : '-right-4 w-10'}`}
        initial={{ opacity: 0, x: 30, rotate: 12 }}
        animate={{ opacity: 1, x: 0, rotate: 12 }}
        transition={{ delay: 0.6 }}
      >
        <CardBack />
      </motion.div>
    </div>
  );
}
