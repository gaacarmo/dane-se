const CHIP_COLORS = ['#c0392b', '#1f5fa8', '#1e7a4a', '#1b1b1f', '#f2ecdd'];

/** How many drawn chips stand for an amount (decorative; the number is shown next to them). */
export function chipCount(amount: number, unit: number, max: number): number {
  if (amount <= 0) return 0;
  return Math.max(1, Math.min(max, Math.round(amount / unit)));
}

/** A stack of chips seen from the side, drawn with CSS. */
export function ChipStack({ count, size = 16, seed = 0 }: { count: number; size?: number; seed?: number }) {
  const step = Math.max(2, size * 0.2);
  return (
    <span
      className="relative inline-block"
      style={{ width: size, height: size * 0.5 + step * (count - 1) }}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="absolute left-0 rounded-[50%] shadow-[0_1px_0_rgb(0_0_0/0.45)] ring-1 ring-white/50 ring-inset"
          style={{
            width: size,
            height: size * 0.5,
            bottom: i * step,
            background: CHIP_COLORS[(i + seed) % CHIP_COLORS.length],
          }}
        />
      ))}
    </span>
  );
}

/** A few stacks side by side, `perStack` chips each. */
export function ChipPile({
  count,
  size = 16,
  perStack = 6,
  seed = 0,
}: {
  count: number;
  size?: number;
  perStack?: number;
  seed?: number;
}) {
  const stacks = Math.ceil(count / perStack);
  return (
    <span className="inline-flex items-end gap-0.5" aria-hidden>
      {Array.from({ length: stacks }, (_, i) => (
        <ChipStack key={i} count={Math.min(perStack, count - i * perStack)} size={size} seed={seed + i * 2} />
      ))}
    </span>
  );
}
