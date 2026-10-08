import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-gold-300 to-gold-500 text-wood-900 shadow-[0_3px_0_#8a6a20,0_8px_20px_rgb(0_0_0/0.35)] active:translate-y-[2px] active:shadow-[0_1px_0_#8a6a20] disabled:from-stone-500 disabled:to-stone-600 disabled:text-stone-300 disabled:shadow-none',
  secondary:
    'bg-felt-800/80 text-gold-300 ring-1 ring-gold-500/50 hover:bg-felt-700 active:translate-y-[1px] disabled:opacity-50',
  ghost: 'bg-transparent text-stone-200 hover:bg-white/10 disabled:opacity-40',
  danger: 'bg-wine-700 text-white hover:bg-wine-800 ring-1 ring-white/20 disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-xl px-5 py-2.5 font-semibold transition select-none ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
