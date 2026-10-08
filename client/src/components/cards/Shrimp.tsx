/**
 * The group's mascot: a curled-up shrimp, drawn in a 100x100 box.
 * `color` uses its natural coral colors; `mono` draws it in one tone (gold on a
 * card back, a faint print on the felt).
 */

// The body follows an arc: head at the upper left, back arching over the top
// and down the right side, tail tucked under toward the head.
const CX = 52;
const CY = 52;
const R = 25;
const HEAD_ANGLE = 232;
const TAIL_ANGLE = 470;
const HEAD_WIDTH = 25;
const TAIL_WIDTH = 8;

const rad = (deg: number) => (deg * Math.PI) / 180;
const point = (deg: number, r: number) => ({ x: CX + r * Math.cos(rad(deg)), y: CY + r * Math.sin(rad(deg)) });
const angleAt = (t: number) => HEAD_ANGLE + t * (TAIL_ANGLE - HEAD_ANGLE);
const widthAt = (t: number) => HEAD_WIDTH + t * (TAIL_WIDTH - HEAD_WIDTH);
const fmt = (p: { x: number; y: number }) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

function bodyPath(): string {
  const steps = 32;
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    outer.push(fmt(point(angleAt(t), R + widthAt(t) / 2)));
    inner.push(fmt(point(angleAt(t), R - widthAt(t) / 2)));
  }
  return `M${outer.join(' L')} L${inner.reverse().join(' L')} Z`;
}

/** Shell bands across the body, bulging slightly toward the tail. */
function segmentPaths(): string[] {
  return [0.14, 0.27, 0.4, 0.53, 0.66, 0.78].map((t) => {
    const a = angleAt(t);
    const w = widthAt(t);
    const from = point(a, R + w / 2);
    const to = point(a, R - w / 2);
    const ctrl = point(a + 7, R);
    return `M${fmt(from)} Q${fmt(ctrl)} ${fmt(to)}`;
  });
}

const BODY = bodyPath();
const SEGMENTS = segmentPaths();
const HEAD = point(HEAD_ANGLE - 4, R);
// "Forward" for the head is the direction of decreasing angle along the arc.
const HEAD_DIR = HEAD_ANGLE - 90;
const TAIL = point(TAIL_ANGLE, R);
const TAIL_DIR = TAIL_ANGLE + 90;

interface ShrimpProps {
  variant?: 'color' | 'mono';
  /** Mono fill color. */
  tone?: string;
  /** Outline color. */
  line?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible name; empty string makes it decorative. */
  title?: string;
}

export function ShrimpShape({ variant = 'color', tone = '#e8c66a', line }: Omit<ShrimpProps, 'className' | 'style' | 'title'>) {
  const mono = variant === 'mono';
  const body = mono ? tone : '#f2845c';
  const light = mono ? tone : '#ffb98f';
  const stroke = line ?? (mono ? 'rgb(0 0 0 / 0.35)' : '#b9472c');
  const front = (dist: number, spread = 0) => ({
    x: HEAD.x + dist * Math.cos(rad(HEAD_DIR + spread)),
    y: HEAD.y + dist * Math.sin(rad(HEAD_DIR + spread)),
  });
  const rostrumTip = front(27, 22);
  const antennaBase = front(9, 30);

  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* Long antennae sweeping back over the arched back */}
      <path d={`M${fmt(antennaBase)} C 20 2, 70 -6, 97 20`} fill="none" stroke={stroke} strokeWidth="1.8" />
      <path d={`M${fmt(antennaBase)} C 28 8, 72 4, 92 32`} fill="none" stroke={stroke} strokeWidth="1.4" />

      {/* Swimming legs under the belly, walking legs under the head */}
      {[0.22, 0.34, 0.46, 0.58].map((t) => {
        const a = angleAt(t);
        const from = point(a, R - widthAt(t) / 2 + 1);
        const to = point(a + 9, R - widthAt(t) / 2 - 7);
        return <path key={t} d={`M${fmt(from)} L${fmt(to)}`} stroke={stroke} strokeWidth="1.8" />;
      })}
      {[-30, -48, -66].map((s) => {
        const from = front(4, s);
        const to = front(16, s - 18);
        return <path key={s} d={`M${fmt(from)} L${fmt(to)}`} stroke={stroke} strokeWidth="1.6" />;
      })}

      {/* Tail fan */}
      <g transform={`translate(${TAIL.x} ${TAIL.y}) rotate(${TAIL_DIR})`}>
        {[-32, 0, 32].map((spread) => (
          <ellipse
            key={spread}
            cx="9"
            cy="0"
            rx="10"
            ry="4.6"
            transform={`rotate(${spread})`}
            fill={light}
            stroke={stroke}
            strokeWidth="1.6"
          />
        ))}
      </g>

      {/* Body and shell bands */}
      <path d={BODY} fill={body} stroke={stroke} strokeWidth="1.8" />
      {SEGMENTS.map((d) => (
        <path key={d} d={d} fill="none" stroke={stroke} strokeWidth="1.4" opacity="0.8" />
      ))}

      {/* Head: carapace, pointy rostrum, eye */}
      <path
        d={`M${fmt(front(8, 40))} L${fmt(rostrumTip)} L${fmt(front(11, 8))} Z`}
        fill={body}
        stroke={stroke}
        strokeWidth="1.6"
      />
      <ellipse
        cx={HEAD.x}
        cy={HEAD.y}
        rx="15"
        ry="12.5"
        transform={`rotate(${HEAD_DIR} ${HEAD.x} ${HEAD.y})`}
        fill={body}
        stroke={stroke}
        strokeWidth="1.8"
      />
      {!mono && (
        <ellipse
          cx={HEAD.x}
          cy={HEAD.y}
          rx="9"
          ry="5"
          transform={`rotate(${HEAD_DIR} ${HEAD.x} ${HEAD.y}) translate(-2 -4)`}
          fill={light}
          opacity="0.7"
        />
      )}
      <circle cx={front(7, 35).x} cy={front(7, 35).y} r="3.4" fill={mono ? stroke : '#1b1b1f'} />
      {!mono && <circle cx={front(7, 35).x - 1} cy={front(7, 35).y - 1.2} r="1.1" fill="#fff" />}
    </g>
  );
}

export function Shrimp({ className, style, title = 'Camarão', ...shape }: ShrimpProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={style}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <ShrimpShape {...shape} />
    </svg>
  );
}
