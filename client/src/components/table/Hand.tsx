import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { type Card, type Rank, cardId, cardStrength } from '@dane-se/shared';
import { PlayingCard } from '../cards/PlayingCard';

const DRAG_TO_PLAY_PX = 70;

/** Your hand, fanned at the bottom. Tap to select, tap again (or drag up) to play. */
export function Hand({
  cards,
  manilhaRank,
  canPlay,
  dimmed,
  onPlay,
  dealDelays,
}: {
  cards: Card[];
  manilhaRank: Rank;
  canPlay: boolean;
  /** Darken the hand (not your turn to play). */
  dimmed: boolean;
  /** Resolves once the server answered. */
  onPlay: (id: string) => Promise<unknown> | void;
  /** While dealing: seconds until each card (in dealt order) lands. Empty otherwise. */
  dealDelays: number[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // After playing, ignore taps until the server answers (no accidental double plays).
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!canPlay) setSelected(null);
  }, [canPlay]);
  const active = canPlay && !pending;

  function play(id: string) {
    setSelected(null);
    setPending(true);
    void Promise.resolve(onPlay(id)).finally(() => setPending(false));
  }

  // Sorted weakest to strongest (manilhas on the right), like most people hold them.
  const sorted = cards
    .map((card, dealtIndex) => ({ card, dealtIndex }))
    .sort((a, b) => cardStrength(a.card, manilhaRank) - cardStrength(b.card, manilhaRank));
  const mid = (sorted.length - 1) / 2;

  function tap(id: string) {
    if (!active) return;
    if (selected === id) {
      play(id);
    } else {
      setSelected(id);
    }
  }

  return (
    // Keeps its height when empty so the table doesn't jump as cards are played.
    <div className="flex min-h-[calc(var(--card-w)*1.4+2.25rem)] justify-center px-2 pt-6 pb-3" role="group" aria-label="Sua mão">
      {sorted.map(({ card, dealtIndex }, i) => {
        const id = cardId(card);
        const offset = i - mid;
        const isSelected = selected === id;
        return (
          <motion.button
            key={id}
            layoutId={`card-${id}`}
            type="button"
            onClick={() => tap(id)}
            disabled={!canPlay}
            aria-pressed={isSelected}
            className={`relative shrink-0 touch-none rounded-[7.2%/5.15%] focus-visible:outline-offset-4 ${i > 0 ? '-ml-[calc(var(--card-w)*0.32)]' : ''} ${
              canPlay ? '' : 'cursor-default'
            }`}
            style={{ width: 'var(--card-w)', zIndex: isSelected ? 20 : i, transformOrigin: '50% 120%' }}
            initial={{ opacity: 0, y: -160, scale: 0.6 }}
            animate={{
              opacity: 1,
              scale: 1,
              rotate: offset * 5,
              y: (isSelected ? -26 : 0) + Math.abs(offset) * Math.abs(offset) * 2,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 26,
              delay: dealDelays[dealtIndex] ?? 0,
            }}
            whileHover={canPlay ? { y: -14 + Math.abs(offset) * Math.abs(offset) * 2 } : undefined}
            drag={active ? 'y' : false}
            dragSnapToOrigin
            dragElastic={0.6}
            dragConstraints={{ top: -220, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (active && info.offset.y < -DRAG_TO_PLAY_PX) play(id);
            }}
          >
            <PlayingCard card={card} highlight={card.rank === manilhaRank} />
            {/* Dimming overlay (a CSS filter here breaks rendering on iOS Safari). */}
            <span
              className={`pointer-events-none absolute inset-0 rounded-[7.2%/5.15%] bg-black transition-opacity duration-200 ${
                dimmed ? 'opacity-30' : 'opacity-0'
              }`}
            />
            {canPlay && (
              <span
                className={`pointer-events-none absolute inset-0 rounded-[7.2%/5.15%] ring-2 ${isSelected ? 'ring-4 ring-gold-300' : 'ring-gold-400/70'}`}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
