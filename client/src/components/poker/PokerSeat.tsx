import { motion } from 'framer-motion';
import type { PokerCard, PokerSeatView, RoomMember } from '@dane-se/shared';
import { formatMoney } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { CardBack } from '../cards/PlayingCard';
import type { Point } from '../table/geometry';
import { MiniCard } from './CardFace';

interface PokerSeatProps {
  seat: PokerSeatView;
  member: RoomMember | undefined;
  point: Point;
  isYou: boolean;
  isActor: boolean;
  /** The viewer's own hole cards; only set for the viewer's seat. */
  hole: PokerCard[];
  /** Cards shown face-up at showdown for this seat, if any. */
  revealed: PokerCard[] | null;
  /** True while this seat still holds cards in the current hand. */
  inHand: boolean;
  holeCardW: number;
  /** Amount won in the last hand (drives the winner highlight), or null. */
  wonAmount: number | null;
  /** Show the cards above the avatar (seats in the bottom half, i.e. nearer the middle). */
  cardsFirst: boolean;
}

export function PokerSeat({
  seat,
  member,
  point,
  isYou,
  isActor,
  hole,
  revealed,
  inHand,
  holeCardW,
  wonAmount,
  cardsFirst,
}: PokerSeatProps) {
  const out = seat.chips === 0 && !inHand;
  const faced = isYou && hole.length === 2 ? hole : revealed && revealed.length === 2 ? revealed : null;
  const showBacks = !faced && inHand && !seat.folded;

  const cardsEl = (
    <div className="mb-0.5 flex items-end justify-center" style={{ height: holeCardW * 1.4 }}>
      {faced
        ? faced.map((c, i) => (
            <MiniCard
              key={`${c.rank}${c.suit}-${i}`}
              card={c}
              style={{
                width: holeCardW,
                marginLeft: i === 0 ? 0 : -holeCardW * 0.28,
                transform: `rotate(${(i - 0.5) * 8}deg)`,
              }}
            />
          ))
        : showBacks &&
          [0, 1].map((i) => (
            <div
              key={i}
              style={{ width: holeCardW, marginLeft: i === 0 ? 0 : -holeCardW * 0.28, transform: `rotate(${(i - 0.5) * 8}deg)` }}
            >
              <CardBack />
            </div>
          ))}
    </div>
  );

  return (
    <motion.div
      className="absolute z-10 flex w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: point.x, top: point.y }}
      animate={{ left: point.x, top: point.y }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
    >
      {cardsFirst && cardsEl}

      <div className="relative">
        {isActor && (
          <motion.span
            className="absolute -inset-1.5 rounded-full ring-4 ring-gold-400"
            animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            aria-hidden
          />
        )}
        {wonAmount !== null && (
          <motion.span
            className="absolute -inset-2 rounded-full ring-4 ring-emerald-400"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            aria-hidden
          />
        )}
        <div
          className={`relative grid size-12 place-items-center rounded-full text-lg font-bold text-white shadow-lg ring-2 transition ${
            out ? 'opacity-45 grayscale ring-white/20' : seat.folded ? 'opacity-60 ring-white/25' : 'ring-white/50'
          }`}
          style={{ background: avatarColor(seat.id) }}
        >
          {initial(seat.name)}
          {seat.isButton && (
            <span
              className="absolute -right-2 -bottom-1 grid size-5 place-items-center rounded-full bg-paper text-[10px] font-black text-wood-900 shadow ring-2 ring-gold-500"
              title="Botão (dealer)"
              aria-label="Botão"
            >
              D
            </span>
          )}
          {member && (member.isBot || !member.connected) && !out && (
            <span
              className="absolute -top-1 -left-2 rounded-full bg-black/80 px-1 text-[10px] text-stone-200"
              title={member.isBot ? 'Bot' : member.autoPlay ? 'Fora da vez: o bot está jogando' : 'Desconectado'}
            >
              {member.isBot || member.autoPlay ? '🤖' : '📵'}
            </span>
          )}
        </div>

        {/* Folded stamp */}
        {seat.folded && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] rounded border-2 border-wine-700 bg-black/60 px-1.5 text-[10px] font-black tracking-wide text-wine-700">
            DESISTIU
          </span>
        )}
      </div>

      <div
        className={`mt-1 max-w-full truncate px-1 text-center text-xs font-semibold drop-shadow ${
          isActor ? 'text-gold-300' : 'text-stone-100'
        }`}
      >
        {isYou ? 'Você' : seat.name}
      </div>

      <div className="mt-0.5 flex items-center gap-1 text-[11px] leading-none">
        <span className="rounded bg-black/55 px-1.5 py-1 font-mono text-white" title="Fichas">
          {formatMoney(seat.chips)}
        </span>
        {seat.allIn && <span className="rounded bg-wine-700 px-1.5 py-1 font-bold text-white">ALL-IN</span>}
        {wonAmount !== null && (
          <span className="rounded bg-emerald-600 px-1.5 py-1 font-bold text-white">+{formatMoney(wonAmount)}</span>
        )}
      </div>

      {!cardsFirst && cardsEl}
    </motion.div>
  );
}
