import { useLayoutEffect, useRef, useState } from 'react';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface TableGeometry {
  center: Point;
  /** Felt ellipse radii. */
  rx: number;
  ry: number;
  /** Ellipse the seats sit on (the rim). */
  seatRx: number;
  seatRy: number;
  /** Ellipse the played cards sit on, clear of the deck/vira pile in the middle. */
  trickRx: number;
  trickRy: number;
  /** Width of cards on the table and on foreheads, in px (exposed as CSS variables). */
  tableCardW: number;
  seatCardW: number;
}

const CARD_RATIO = 1.4;
/** Space taken by the manilha badge under the vira. */
const BADGE_H = 34;

/** `compact`: short landscape screens, where the deck/vira pile moves to the HUD. */
export function tableGeometry({ width, height }: Size, compact = false): TableGeometry {
  const padX = Math.min(64, width * 0.13);
  const padY = Math.min(70, height * 0.13);
  const rx = Math.max(60, width / 2 - padX);
  const ry = Math.max(60, height / 2 - padY);
  const tableCardW = clamp(Math.min(width * 0.095, height * 0.09), 32, 72);
  const cardH = tableCardW * CARD_RATIO;
  return {
    // Compact mode has no seat of your own at the bottom, so the middle moves down to give the top seat room.
    center: { x: width / 2, y: compact ? height * 0.62 : height / 2 },
    rx,
    ry,
    seatRx: rx + Math.min(18, padX * 0.4),
    seatRy: ry + Math.min(22, padY * 0.4),
    // Pile is two cards wide and a card + badge tall; leave half a card of gap.
    // Without the pile (compact), the cards just gather around the middle.
    trickRx: compact ? Math.max(rx * 0.3, tableCardW * 1.3) : Math.max(rx * 0.55, tableCardW * 2.2),
    trickRy: compact ? cardH * 0.5 : Math.max(ry * 0.5, cardH + BADGE_H / 2 + 8),
    tableCardW,
    seatCardW: clamp(tableCardW * 0.72, 28, 52),
  };
}

function seatAngle(k: number, n: number): number {
  return -Math.PI / 2 + (k * 2 * Math.PI) / n;
}

/**
 * Seat k positions after the local player (k = 0 is you, at the bottom). Seats
 * go counter-clockwise on screen: bottom -> right -> top -> left, so the
 * player to your right (who plays after you) sits to your right.
 */
export function seatPoint(k: number, n: number, g: TableGeometry, size: Size, extraTop = 0, scale = 1): Point {
  const angle = seatAngle(k, n);
  const x = g.center.x + g.seatRx * Math.cos(angle);
  const y = g.center.y - g.seatRy * Math.sin(angle);
  // Keep the seat box on screen (plus room for a forehead card above it in the blind round).
  const halfW = 50 * scale;
  const halfH = 52 * scale;
  return {
    x: clamp(x, halfW, size.width - halfW),
    y: clamp(y, halfH + extraTop, size.height - halfH),
  };
}

/** Room above a seat for the blind-round forehead card (minus its overlap with the avatar). */
export function foreheadSpace(g: TableGeometry): number {
  return g.seatCardW * CARD_RATIO - 12;
}

/** Where seat k's card lands in the middle of the table. */
export function trickPoint(k: number, n: number, g: TableGeometry): Point {
  const angle = seatAngle(k, n);
  return {
    x: g.center.x + g.trickRx * Math.cos(angle),
    y: g.center.y - g.trickRy * Math.sin(angle),
  };
}

/** Small, stable tilt per player so cards don't look perfectly aligned. */
export function tiltFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 17 + ch.charCodeAt(0)) % 997;
  return (h % 15) - 7;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}
