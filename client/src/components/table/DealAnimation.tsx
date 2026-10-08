import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { PlayerView } from '@dane-se/shared';
import { CardBack } from '../cards/PlayingCard';
import type { Point } from './geometry';

/** Alive players in dealing order: right of the Pé first, the Pé last. */
export function dealOrder(game: PlayerView): string[] {
  const ids = game.players.map((p) => p.id);
  const alive = new Set(game.players.filter((p) => !p.eliminated).map((p) => p.id));
  const start = ids.indexOf(game.dealerId);
  const order: string[] = [];
  for (let i = 1; i <= ids.length; i++) {
    const id = ids[(start + i) % ids.length]!;
    if (alive.has(id)) order.push(id);
  }
  return order;
}

export interface DealTiming {
  /** Seconds between two consecutive cards. */
  stagger: number;
  /** When the last card lands (the vira flips after this). */
  total: number;
  /** Seconds until card `c` of player at position `j` in deal order lands. */
  landAt: (c: number, j: number) => number;
}

const FLIGHT = 0.35;

export function dealTiming(cardsPerPlayer: number, players: number, animate: boolean): DealTiming {
  if (!animate) return { stagger: 0, total: 0, landAt: () => 0 };
  const count = cardsPerPlayer * players;
  const stagger = Math.min(0.09, 1.6 / count);
  return {
    stagger,
    total: count * stagger + FLIGHT,
    landAt: (c, j) => (c * players + j) * stagger + FLIGHT,
  };
}

/** Card backs flying from the deck to every seat, one at a time, round-robin. */
export function DealAnimation({
  order,
  cardsPerPlayer,
  from,
  seats,
  timing,
  roundKey,
}: {
  order: string[];
  cardsPerPlayer: number;
  from: Point;
  seats: Map<string, Point>;
  timing: DealTiming;
  roundKey: string;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), (timing.total + 0.2) * 1000);
    return () => clearTimeout(t);
  }, [roundKey, timing.total]);

  if (!visible || timing.total === 0) return null;

  const flights: { key: string; to: Point; delay: number }[] = [];
  for (let c = 0; c < cardsPerPlayer; c++) {
    order.forEach((id, j) => {
      const to = seats.get(id);
      if (to) flights.push({ key: `${c}-${id}`, to, delay: timing.landAt(c, j) - FLIGHT });
    });
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden>
      {flights.map((f) => (
        <motion.div
          key={`${roundKey}-${f.key}`}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ width: 'var(--table-card-w)' }}
          initial={{ left: from.x, top: from.y, rotate: 0, opacity: 0, scale: 0.9 }}
          animate={{ left: f.to.x, top: f.to.y, rotate: 360 + 20, opacity: [0, 1, 1, 0], scale: 0.6 }}
          transition={{ delay: f.delay, duration: FLIGHT, ease: 'easeOut', opacity: { times: [0, 0.1, 0.8, 1], delay: f.delay, duration: FLIGHT } }}
        >
          <CardBack />
        </motion.div>
      ))}
    </div>
  );
}
