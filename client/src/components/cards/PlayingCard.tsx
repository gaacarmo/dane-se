import { memo, useId } from 'react';
import type { Card, Rank, Suit } from '@dane-se/shared';
import { SUIT_NAMES_PT, SuitShape, suitColor } from './suits';

const W = 250;
const H = 350;

const RANK_NAMES_PT: Record<Rank, string> = {
  '4': 'Quatro',
  '5': 'Cinco',
  '6': 'Seis',
  '7': 'Sete',
  Q: 'Dama',
  J: 'Valete',
  K: 'Rei',
  A: 'Ás',
  '2': 'Dois',
  '3': 'Três',
};

export function cardLabel(card: Card): string {
  return `${RANK_NAMES_PT[card.rank]} de ${SUIT_NAMES_PT[card.suit]}`;
}

/** Pip centers for number cards; pips in the lower half are drawn upside down. */
const PIPS: Partial<Record<Rank, [number, number][]>> = {
  '2': [[125, 95], [125, 255]],
  '3': [[125, 95], [125, 175], [125, 255]],
  '4': [[82, 95], [168, 95], [82, 255], [168, 255]],
  '5': [[82, 95], [168, 95], [125, 175], [82, 255], [168, 255]],
  '6': [[82, 95], [168, 95], [82, 175], [168, 175], [82, 255], [168, 255]],
  '7': [[82, 95], [168, 95], [125, 135], [82, 175], [168, 175], [82, 255], [168, 255]],
};

function Pip({ suit, x, y, size, flip }: { suit: Suit; x: number; y: number; size: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) ${flip ? `rotate(180 ${size / 2} ${size / 2})` : ''} scale(${size / 100})`}>
      <SuitShape suit={suit} />
    </g>
  );
}

function CornerIndex({ card }: { card: Card }) {
  const color = suitColor(card.suit);
  return (
    <g>
      <text
        x="30"
        y="58"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="56"
        fill={color}
      >
        {card.rank}
      </text>
      <Pip suit={card.suit} x={30} y={86} size={34} />
    </g>
  );
}

/** Court cards (Q, J, K): an original framed design, no traditional artwork. */
function CourtPanel({ card, patternId }: { card: Card; patternId: string }) {
  const color = suitColor(card.suit);
  const emblem = {
    K: 'M-38 18 L-38 -14 L-19 4 L0 -24 L19 4 L38 -14 L38 18 Z', // crown
    Q: 'M-34 16 Q-34 -6 -18 -10 Q-10 -26 0 -26 Q10 -26 18 -10 Q34 -6 34 16 Z', // tiara
    J: 'M-30 16 L-30 -2 Q0 -30 30 -2 L30 16 Z', // cap
  }[card.rank as 'K' | 'Q' | 'J'];

  return (
    <g>
      <defs>
        <pattern id={patternId} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill="#fbf3dc" />
          <rect width="8" height="16" fill={color} opacity="0.06" />
        </pattern>
      </defs>
      <rect x="52" y="54" width="146" height="242" rx="10" fill={`url(#${patternId})`} stroke="#c9a14a" strokeWidth="4" />
      <rect x="60" y="62" width="130" height="226" rx="7" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />
      {/* Mirrored halves like a real court card. */}
      {[0, 180].map((rot) => (
        <g key={rot} transform={`rotate(${rot} 125 175)`}>
          <g transform="translate(125 118)">
            <path d={emblem} fill="#e8c66a" stroke="#8a6a20" strokeWidth="3" />
            <circle cx="0" cy="-2" r="6" fill={color} />
          </g>
          <text
            x="125"
            y="168"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="700"
            fontSize="40"
            fill={color}
          >
            {card.rank}
          </text>
        </g>
      ))}
      <line x1="66" y1="175" x2="184" y2="175" stroke="#c9a14a" strokeWidth="2" />
      <Pip suit={card.suit} x={125} y={175} size={30} />
    </g>
  );
}

interface PlayingCardProps {
  card: Card;
  /** Gold glow + star, used for manilhas. */
  highlight?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const PlayingCard = memo(function PlayingCard({ card, highlight, className, style }: PlayingCardProps) {
  const patternId = useId();
  const pips = PIPS[card.rank];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`card-shadow block ${className ?? ''}`}
      style={style}
      role="img"
      aria-label={cardLabel(card) + (highlight ? ' (manilha)' : '')}
    >
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="18" fill="var(--color-paper)" stroke="#d6d0c0" strokeWidth="3" />
      {highlight && (
        <rect x="6" y="6" width={W - 12} height={H - 12} rx="15" fill="none" stroke="#e0b543" strokeWidth="8" />
      )}

      <CornerIndex card={card} />
      <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <CornerIndex card={card} />
      </g>

      {card.rank === 'A' && <Pip suit={card.suit} x={125} y={175} size={120} />}
      {pips?.map(([x, y], i) => <Pip key={i} suit={card.suit} x={x} y={y} size={56} flip={y > 175} />)}
      {(card.rank === 'Q' || card.rank === 'J' || card.rank === 'K') && <CourtPanel card={card} patternId={patternId} />}

      {highlight && (
        <g transform="translate(212 38)">
          <circle r="22" fill="#e0b543" stroke="#8a6a20" strokeWidth="3" />
          <path
            d="M0-13 3.8-4.2 13-4 5.8 2 8.1 11 0 6 -8.1 11-5.8 2-13-4-3.8-4.2z"
            fill="#fffdf6"
          />
        </g>
      )}
    </svg>
  );
});

export const CardBack = memo(function CardBack({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const id = useId();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`card-shadow block ${className ?? ''}`} style={style} role="img" aria-label="Carta virada">
      <defs>
        <pattern id={`${id}-lattice`} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="22" height="22" fill="#7a1f2b" />
          <path d="M0 11h22M11 0v22" stroke="#9b3341" strokeWidth="3" />
          <circle cx="11" cy="11" r="3" fill="#e8c66a" opacity="0.55" />
        </pattern>
      </defs>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="18" fill="var(--color-paper)" stroke="#d6d0c0" strokeWidth="3" />
      <rect x="16" y="16" width={W - 32} height={H - 32} rx="10" fill={`url(#${id}-lattice)`} />
      <rect x="16" y="16" width={W - 32} height={H - 32} rx="10" fill="none" stroke="#e8c66a" strokeWidth="3" />
      <ellipse cx="125" cy="175" rx="52" ry="68" fill="#5c1520" stroke="#e8c66a" strokeWidth="4" />
      <text
        x="125"
        y="198"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="700"
        fontSize="68"
        fill="#e8c66a"
      >
        D
      </text>
    </svg>
  );
});
