import type { Suit } from '@dane-se/shared';

export const SUIT_NAMES_PT: Record<Suit, string> = { D: 'Ouros', S: 'Espadas', H: 'Copas', C: 'Paus' };
export const SUIT_SYMBOLS: Record<Suit, string> = { D: '♦', S: '♠', H: '♥', C: '♣' };
export const isRed = (suit: Suit) => suit === 'D' || suit === 'H';
export const suitColor = (suit: Suit) => (isRed(suit) ? 'var(--color-card-red)' : 'var(--color-card-black)');

/** Suit shapes drawn in a 100x100 box, centered on (50, 50). Real SVG, never emoji. */
export function SuitShape({ suit, fill }: { suit: Suit; fill?: string }) {
  const color = fill ?? suitColor(suit);
  switch (suit) {
    case 'H':
      return (
        <path
          fill={color}
          d="M50 90C22 68 5 52 5 31 5 17 16 7 29 7c9 0 17 5 21 13 4-8 12-13 21-13 13 0 24 10 24 24 0 21-17 37-45 59z"
        />
      );
    case 'D':
      return <path fill={color} d="M50 4Q66 29 88 50 66 71 50 96 34 71 12 50 34 29 50 4z" />;
    case 'S':
      return (
        <path
          fill={color}
          d="M50 5C61 25 93 39 93 62c0 13-10 22-21 22-8 0-15-4-18-10 1 9 5 15 13 21H33c8-6 12-12 13-21-3 6-10 10-18 10C17 84 7 75 7 62 7 39 39 25 50 5z"
        />
      );
    case 'C':
      return (
        <g fill={color}>
          <circle cx="50" cy="29" r="19" />
          <circle cx="28" cy="58" r="19" />
          <circle cx="72" cy="58" r="19" />
          <path d="M44 45h12c0 22 4 36 13 50H31c9-14 13-28 13-50z" />
        </g>
      );
  }
}

export function SuitIcon({ suit, className, title }: { suit: Suit; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={title ?? SUIT_NAMES_PT[suit]}>
      <SuitShape suit={suit} />
    </svg>
  );
}
