import { memo, type CSSProperties } from 'react';
import type { PokerCard, PokerRank } from '@dane-se/shared';
import { SUIT_NAMES_PT, SuitShape, suitColor } from '../cards/suits';

const W = 250;
const H = 350;

const RANK_LABEL: Record<PokerRank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

const RANK_NAMES_PT: Record<PokerRank, string> = {
  '2': 'Dois',
  '3': 'Três',
  '4': 'Quatro',
  '5': 'Cinco',
  '6': 'Seis',
  '7': 'Sete',
  '8': 'Oito',
  '9': 'Nove',
  T: 'Dez',
  J: 'Valete',
  Q: 'Dama',
  K: 'Rei',
  A: 'Ás',
};

/** Court cards and ten/Ace read better as a big letter than as a pip. */
const LETTER_CENTER: readonly PokerRank[] = ['T', 'J', 'Q', 'K', 'A'];

/** Draws the suit shape centered on (x, y), `size` px wide (SuitShape lives in a 100x100 box). */
function Pip({ suit, x, y, size }: { suit: PokerCard['suit']; x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})`}>
      <SuitShape suit={suit} />
    </g>
  );
}

function CornerIndex({ card, color }: { card: PokerCard; color: string }) {
  const label = RANK_LABEL[card.rank];
  return (
    <g>
      <text
        x="32"
        y="60"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize={label.length > 1 ? 44 : 58}
        fill={color}
      >
        {label}
      </text>
      <Pip suit={card.suit} x={32} y={90} size={32} />
    </g>
  );
}

export const CardFace = memo(function CardFace({
  card,
  className,
  style,
}: {
  card: PokerCard;
  className?: string;
  style?: React.CSSProperties;
}) {
  const color = suitColor(card.suit);
  const label = `${RANK_NAMES_PT[card.rank]} de ${SUIT_NAMES_PT[card.suit]}`;
  const bigLetter = LETTER_CENTER.includes(card.rank);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`card-shadow block ${className ?? ''}`}
      style={style}
      role="img"
      aria-label={label}
    >
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="18" fill="var(--color-paper)" stroke="#d6d0c0" strokeWidth="3" />

      <CornerIndex card={card} color={color} />
      <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <CornerIndex card={card} color={color} />
      </g>

      {bigLetter ? (
        <g fill={color}>
          <text
            x="125"
            y="215"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="700"
            fontSize="150"
          >
            {RANK_LABEL[card.rank]}
          </text>
          <Pip suit={card.suit} x={125} y={150} size={54} />
        </g>
      ) : (
        <Pip suit={card.suit} x={125} y={175} size={124} />
      )}
    </svg>
  );
});

/** Small, compact card used for a seat's hole cards (rank + suit, no center art). */
export const MiniCard = memo(function MiniCard({
  card,
  className,
  style,
}: {
  card: PokerCard;
  className?: string;
  style?: React.CSSProperties;
}) {
  const color = suitColor(card.suit);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`card-shadow block ${className ?? ''}`}
      style={style}
      role="img"
      aria-label={`${RANK_NAMES_PT[card.rank]} de ${SUIT_NAMES_PT[card.suit]}`}
    >
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="18" fill="var(--color-paper)" stroke="#d6d0c0" strokeWidth="3" />
      <text
        x="40"
        y="150"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize={RANK_LABEL[card.rank].length > 1 ? 88 : 120}
        fill={color}
      >
        {RANK_LABEL[card.rank]}
      </text>
      <Pip suit={card.suit} x={125} y={255} size={110} />
    </svg>
  );
});
