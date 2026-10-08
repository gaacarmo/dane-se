import { AnimatePresence, motion } from 'framer-motion';
import type { PublicPlayer, RoomMember } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { CardBack, PlayingCard } from '../cards/PlayingCard';
import type { Point } from './geometry';
import { Letters } from './Letters';

interface SeatProps {
  player: PublicPlayer;
  member: RoomMember | undefined;
  point: Point;
  word: string[];
  isYou: boolean;
  isTurn: boolean;
  blindRound: boolean;
  /** Fan the face-down cards to the left (seats on the right side of the table). */
  fanLeft: boolean;
  manilhaRank: string;
  /** Seconds until this seat's cards have been dealt (for the deal animation). */
  dealDelay: number;
  roundKey: string;
  /** Shrinks the seat on short screens. */
  scale?: number;
}

export function Seat({
  player,
  member,
  point,
  word,
  isYou,
  isTurn,
  blindRound,
  fanLeft,
  manilhaRank,
  dealDelay,
  roundKey,
  scale = 1,
}: SeatProps) {
  const out = player.eliminated;
  const showFan = !blindRound && !isYou && !out && player.cardCount > 0;
  const showForehead = blindRound && !out && player.cardCount > 0;

  return (
    <motion.div
      className="absolute z-10 flex w-[100px] -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: point.x, top: point.y, scale }}
      animate={{ left: point.x, top: point.y }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
    >
      {/* Blind round: the card sits on the forehead. You only see the back of yours. */}
      <AnimatePresence>
        {showForehead && (
          <motion.div
            key={`forehead-${roundKey}`}
            className="absolute bottom-[calc(100%-14px)] z-20"
            style={{ width: 'var(--seat-card-w)' }}
            initial={{ opacity: 0, y: 20, rotate: 0 }}
            animate={{ opacity: 1, y: 0, rotate: isYou ? 0 : -4 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: dealDelay, type: 'spring', stiffness: 200, damping: 18 }}
          >
            {isYou || !player.foreheadCard ? (
              <CardBack />
            ) : (
              <PlayingCard card={player.foreheadCard} highlight={player.foreheadCard.rank === manilhaRank} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        {/* Turn ring */}
        {isTurn && (
          <motion.span
            className="absolute -inset-1.5 rounded-full ring-4 ring-gold-400"
            animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            aria-hidden
          />
        )}
        <div
          className={`relative grid size-12 place-items-center rounded-full text-lg font-bold text-white shadow-lg ring-2 transition ${
            out ? 'opacity-50 grayscale ring-white/20' : 'ring-white/50'
          }`}
          style={{ background: avatarColor(player.id) }}
        >
          {initial(player.name)}
          {player.isDealer && !out && (
            <span
              className="absolute -right-2 -bottom-1 grid size-6 place-items-center rounded-full bg-paper text-[11px] font-black text-wood-900 shadow ring-2 ring-gold-500"
              title="Pé (dá as cartas e joga por último)"
              aria-label="Pé"
            >
              PÉ
            </span>
          )}
          {member && (member.isBot || !member.connected) && !out && (
            <span
              className="absolute -top-1 -left-2 rounded-full bg-black/80 px-1 text-[10px] text-stone-200"
              title={member.isBot ? 'Bot' : member.autoPlay ? 'Desconectado: o bot está jogando' : 'Desconectado'}
            >
              {member.isBot || member.autoPlay ? '🤖' : '📵'}
            </span>
          )}
        </div>

        {/* Opponents' cards, face down, fanned beside the avatar. */}
        {showFan && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${fanLeft ? 'right-[calc(100%+2px)]' : 'left-[calc(100%+2px)]'}`}
            aria-label={`${player.cardCount} cartas`}
          >
            {Array.from({ length: player.cardCount }, (_, i) => (
              <motion.div
                key={`${roundKey}-${i}`}
                className="absolute top-0 -translate-y-1/2"
                style={{ width: 'calc(var(--seat-card-w) * 0.62)', [fanLeft ? 'right' : 'left']: i * 6 }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1, rotate: (i - player.cardCount / 2) * 6 }}
                transition={{ delay: dealDelay }}
              >
                <CardBack />
              </motion.div>
            ))}
          </div>
        )}

        {/* Eliminated stamp */}
        <AnimatePresence>
          {out && (
            <motion.span
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded border-2 border-card-red bg-black/60 px-1.5 text-xs font-black tracking-wider text-card-red"
              initial={{ scale: 3, rotate: -30, opacity: 0 }}
              animate={{ scale: 1, rotate: -14, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.3 }}
            >
              FORA
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className={`mt-1 max-w-full truncate px-1 text-center text-xs font-semibold drop-shadow ${isTurn ? 'text-gold-300' : 'text-stone-100'}`}>
        {isYou ? 'Você' : player.name}
      </div>
      <Letters word={word} lost={player.letters} compact />

      {!out && (
        <div className="mt-0.5 flex gap-1 text-[11px] leading-none">
          <span
            className={`rounded px-1.5 py-1 ${player.bet === null ? 'bg-black/30 text-stone-400' : 'bg-black/55 text-white'}`}
            title="Palpite"
          >
            🎯 {player.bet ?? '–'}
          </span>
          <span
            className={`rounded px-1.5 py-1 ${
              player.bet !== null && player.tricksWon > player.bet ? 'bg-wine-700 text-white' : 'bg-black/55 text-white'
            }`}
            title="Vazas feitas"
          >
            ✋ {player.tricksWon}
          </span>
        </div>
      )}
    </motion.div>
  );
}
