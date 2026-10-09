import type { Point, Size } from '../table/geometry';

export interface PokerGeometry {
  center: Point;
  /** Felt ellipse radii. */
  rx: number;
  ry: number;
  /** Ellipse the seats sit on (the rim). */
  seatRx: number;
  seatRy: number;
  /** Width of the five community cards. */
  boardCardW: number;
  /** Width of a seat's two hole cards. */
  holeCardW: number;
}

const CARD_RATIO = 1.4;
const MAX_TABLE_ASPECT = 2.1;

/** Sizes the felt and the community cards from the table's box. */
export function pokerGeometry({ width, height }: Size, compact: boolean): PokerGeometry {
  const padX = Math.min(48, width * 0.1);
  const padY = compact ? Math.min(44, height * 0.12) : Math.min(80, height * 0.16);
  const ry = Math.max(52, height / 2 - padY);
  const rx = Math.min(Math.max(56, width / 2 - padX), ry * MAX_TABLE_ASPECT);
  const boardCardW = clamp(Math.min(width * 0.11, height * 0.11), 34, 66);
  return {
    center: { x: width / 2, y: compact ? height * 0.5 : height * 0.46 },
    rx,
    ry,
    seatRx: rx + Math.min(14, padX * 0.35),
    seatRy: ry + Math.min(18, padY * 0.35),
    boardCardW,
    holeCardW: clamp(boardCardW * 0.62, 22, 42),
  };
}

/** Seat k, where k = 0 is the viewer at the bottom; action runs clockwise on screen. */
export function pokerSeatPoint(k: number, n: number, g: PokerGeometry, size: Size): Point {
  const angle = -Math.PI / 2 - (k * 2 * Math.PI) / n;
  const x = g.center.x + g.seatRx * Math.cos(angle);
  const y = g.center.y - g.seatRy * Math.sin(angle);
  const halfW = 54;
  const halfH = 44;
  return {
    x: clamp(x, halfW, size.width - halfW),
    y: clamp(y, halfH, size.height - halfH),
  };
}

/** Where a seat's street bet sits, between the seat and the pot. */
export function betPoint(k: number, n: number, g: PokerGeometry): Point {
  const angle = -Math.PI / 2 - (k * 2 * Math.PI) / n;
  const rx = g.rx * 0.68;
  const ry = g.ry * 0.68;
  return { x: g.center.x + rx * Math.cos(angle), y: g.center.y - ry * Math.sin(angle) };
}

export function boardCardHeight(g: PokerGeometry): number {
  return g.boardCardW * CARD_RATIO;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}
