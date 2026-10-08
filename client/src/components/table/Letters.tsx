import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/** The lives word with lost letters struck through in red. */
export function Letters({ word, lost, compact }: { word: string[]; lost: number; compact?: boolean }) {
  // Only the letter lost since the last render animates (not all of them on mount).
  const previous = useRef(lost);
  const fresh = lost > previous.current ? lost - 1 : -1;
  useEffect(() => {
    previous.current = lost;
  }, [lost]);

  return (
    <div className="flex gap-[2px]" aria-label={`${lost} de ${word.length} letras perdidas`}>
      {word.map((letter, i) => {
        const isLost = i < lost;
        return (
          <motion.span
            key={`${i}-${isLost}`}
            initial={i === fresh ? { scale: 2.6, rotate: -20, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.15 }}
            className={`grid place-items-center rounded-[3px] font-bold leading-none ${
              compact ? 'h-4 w-3.5 text-[10px]' : 'h-5 w-4 text-xs'
            } ${
              isLost
                ? 'bg-card-red text-white line-through decoration-2 shadow-[0_0_6px_rgb(192_36_47/0.7)]'
                : 'bg-black/35 text-stone-400 ring-1 ring-white/15'
            }`}
          >
            {letter}
          </motion.span>
        );
      })}
    </div>
  );
}
