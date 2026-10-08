import { AnimatePresence, motion } from 'framer-motion';
import { type PlayerView, cardId } from '@dane-se/shared';
import { PlayingCard } from '../cards/PlayingCard';
import { type Point, tiltFor } from './geometry';

/**
 * Cards played in the current trick. Each one flies in from its player's seat
 * (yours comes straight from your hand via the shared layoutId), and when the
 * trick is collected they all slide to the winner.
 */
export function TrickArea({
  game,
  youId,
  seats,
  spots,
  center,
}: {
  game: PlayerView;
  youId: string;
  seats: Map<string, Point>;
  /** Where each player's card lands. */
  spots: Map<string, Point>;
  center: Point;
}) {
  const result = game.trick.result;
  // Exiting cards keep the props of their last render, which is the "trickEnd"
  // state that has the result, so they slide to that trick's winner.
  const exitTo = result?.winnerId ? (seats.get(result.winnerId) ?? center) : center;

  const trickKey = `${game.roundNumber}-${game.tricksPlayed}`;

  return (
    <AnimatePresence>
      {game.trick.plays.map(({ playerId, card }) => {
        const seat = seats.get(playerId) ?? center;
        const target = spots.get(playerId) ?? center;
        const won = result?.winnerId === playerId;
        const canceled = result?.canceledPlayerIds.includes(playerId) ?? false;
        const fromHand = playerId === youId && !game.blindRound;

        return (
          <motion.div
            key={`${trickKey}-${playerId}`}
            layoutId={fromHand ? `card-${cardId(card)}` : undefined}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ width: 'var(--table-card-w)', zIndex: won ? 30 : 20 }}
            initial={fromHand ? false : { left: seat.x, top: seat.y, scale: 0.5, opacity: 0, rotate: 0 }}
            animate={{
              left: target.x,
              top: target.y,
              scale: won ? 1.15 : 1,
              opacity: 1,
              rotate: tiltFor(playerId + trickKey),
            }}
            exit={{ left: exitTo.x, top: exitTo.y, scale: 0.35, opacity: 0, transition: { duration: 0.45, ease: 'easeIn' } }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div className={`relative transition ${canceled ? 'opacity-60 grayscale' : ''}`}>
              <PlayingCard card={card} highlight={card.rank === game.manilhaRank} />
              {won && <span className="absolute -inset-1 rounded-lg ring-4 ring-gold-400 shadow-[0_0_24px_rgb(232_198_106/0.8)]" />}
              {canceled && (
                <span className="absolute inset-0 grid place-items-center text-4xl font-black text-card-red drop-shadow" aria-label="Cancelada">
                  ✕
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

/** "Ana levou a vaza" / "Empatou!" label shown while the finished trick is on the table. */
export function TrickResultLabel({ game, spots, center }: { game: PlayerView; spots: Map<string, Point>; center: Point }) {
  const result = game.phase === 'trickEnd' ? game.trick.result : null;
  const winner = result?.winnerId ? game.players.find((p) => p.id === result.winnerId) : null;
  // Above the winning card; in the middle when it's a tie.
  const at = (winner && spots.get(winner.id)) || center;
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          key={`${game.roundNumber}-${game.tricksPlayed}`}
          className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80 px-3 py-1.5 text-sm font-bold whitespace-nowrap shadow-xl ring-1 ring-gold-500/60"
          style={{ left: at.x, top: at.y }}
          initial={{ opacity: 0, y: 0, scale: 0.8 }}
          animate={{ opacity: 1, y: winner ? 'calc(var(--table-card-w) * -0.95)' : 0, scale: 1 }}
          exit={{ opacity: 0 }}
        >
          {winner ? (
            <span className="text-gold-300">{winner.id === game.viewerId ? 'Você levou!' : `${winner.name} levou!`}</span>
          ) : (
            <span className="text-stone-200">Empatou! Ninguém leva.</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
