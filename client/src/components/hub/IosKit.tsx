import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GameType } from '@dane-se/shared';

/** Tudo que aparece no catálogo do hub: os jogos e o modo CS. */
export type HubGameId = GameType | 'cs';

const ICONS: Record<HubGameId, { glyph: string; bg: string }> = {
  danese: { glyph: '🃏', bg: 'linear-gradient(160deg, #34d399 0%, #15803d 55%, #064e3b 100%)' },
  truco: { glyph: '🂡', bg: 'linear-gradient(160deg, #ff8a7a 0%, #e11d48 50%, #7f1d1d 100%)' },
  poker: { glyph: '♠️', bg: 'linear-gradient(160deg, #fafaf9 0%, #d6d3d1 55%, #a8a29e 100%)' },
  cs: { glyph: '🎯', bg: 'linear-gradient(160deg, #7dd3fc 0%, #2563eb 55%, #1e1b4b 100%)' },
};

/** Ícone de app: squircle com degradê e o brilho de vidro na borda de cima. */
export function AppIcon({ id, size = 56 }: { id: HubGameId; size?: number }) {
  const icon = ICONS[id];
  return (
    <span
      aria-hidden
      className="relative grid shrink-0 place-items-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.2237,
        background: icon.bg,
        fontSize: size * 0.5,
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.45), inset 0 0 0 0.5px rgb(255 255 255 / 0.25), 0 6px 16px -6px rgb(0 0 0 / 0.6)',
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <span className="relative drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]">{icon.glyph}</span>
    </span>
  );
}

/** Cabeçalho de seção de lista agrupada (cinza, frase comum). */
export function SectionHeader({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 px-4 text-[15px] font-semibold text-ios-label-2">{children}</h2>;
}

/** Chave do iOS. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full p-[2px] transition-colors duration-200 ${on ? 'bg-ios-green' : 'bg-white/20'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 38 }}
        className={`block size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.25),0_0_0_0.5px_rgb(0_0_0/0.04)] ${on ? 'ml-auto' : ''}`}
      />
    </button>
  );
}

/** Controle segmentado com o polegar de vidro deslizando. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  format,
  layoutId,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  format: (v: T) => string;
  layoutId: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[0.9rem] bg-white/10 p-[3px]">
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={`relative min-h-9 flex-1 rounded-[0.75rem] px-1 text-[13px] font-semibold tabular-nums transition-colors ${on ? 'text-white' : 'text-ios-label-2'}`}
          >
            {on && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                className="glass-control absolute inset-0 rounded-[0.75rem] bg-white/25!"
              />
            )}
            <span className="relative">{format(o)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Botão principal (preenchido, azul do sistema) e o secundário (vidro). */
export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`min-h-[50px] w-full rounded-full bg-ios-blue px-5 text-[17px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_8px_20px_-8px_rgb(10_132_255/0.7)] transition active:scale-[0.98] active:brightness-90 disabled:bg-white/15 disabled:text-ios-label-3 disabled:shadow-none ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function GlassButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`glass-control min-h-[50px] w-full rounded-full px-5 text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:text-ios-label-3 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Botão redondo de vidro (fechar, ajuda, perfil). */
export function CircleButton({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="glass-control grid size-11 shrink-0 place-items-center rounded-full text-white transition active:scale-95"
    >
      {children}
    </button>
  );
}

/**
 * Folha flutuante do iOS 26: vidro grosso, cantos grandes, uma alça, solta das
 * bordas da tela. Arrastar pra baixo, tocar fora ou Esc fecham.
 */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Portal: above the floating tab bar, whatever stacking context the caller is in.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center text-white sm:items-center"
          style={{ fontFamily: 'var(--font-ios)' }}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="glass glass-thick relative m-2 w-full max-w-md rounded-[2.4rem]! px-5 pt-2 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div aria-hidden className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-white/30" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Ícones de linha no estilo SF Symbols, desenhados à mão em SVG. */
export const Symbols = {
  play: (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
      <rect x="3" y="4" width="11" height="16" rx="2.4" opacity="0.55" />
      <rect x="9" y="3" width="11" height="16" rx="2.4" transform="rotate(10 14.5 11)" />
    </svg>
  ),
  friends: (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M2.5 19.2c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6c0 .6-.4.8-1 .8h-11c-.6 0-1-.2-1-.8Z" />
      <circle cx="17" cy="9" r="2.8" opacity="0.6" />
      <path d="M16.6 13.4c2.9 0 4.9 1.9 4.9 4.6 0 .5-.3.7-.8.7h-3.4c.1-2-.4-3.8-1.6-5.2.3-.1.6-.1.9-.1Z" opacity="0.6" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
      <path d="M7 3.5h10v5.2a5 5 0 0 1-10 0V3.5Z" />
      <path d="M7 5H4.2v1.6A3.4 3.4 0 0 0 7.4 10M17 5h2.8v1.6a3.4 3.4 0 0 1-3.2 3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.6 13.4h2.8v3.4h-2.8z" />
      <rect x="7.5" y="17.2" width="9" height="3" rx="1.2" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10.3 2.6h3.4l.5 2.5 1.6.7 2.1-1.4 2.4 2.4-1.4 2.1.7 1.6 2.5.5v3.4l-2.5.5-.7 1.6 1.4 2.1-2.4 2.4-2.1-1.4-1.6.7-.5 2.5h-3.4l-.5-2.5-1.6-.7-2.1 1.4-2.4-2.4 1.4-2.1-.7-1.6-2.5-.5v-3.4l2.5-.5.7-1.6-1.4-2.1 2.4-2.4 2.1 1.4 1.6-.7.5-2.5ZM12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z"
      />
    </svg>
  ),
  question: (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M9 9.2a3 3 0 1 1 4.3 2.7c-.8.4-1.3 1-1.3 1.9v.6" />
      <circle cx="12" cy="18" r="0.6" fill="currentColor" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 5 7 7-7 7" />
    </svg>
  ),
};

/** Barra de abas flutuante, uma cápsula de vidro; a aba ativa ganha uma gota de vidro. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; icon: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden"
      aria-label="Seções"
    >
      <div role="tablist" className="glass glass-thick flex w-full max-w-md gap-1 rounded-full! p-1.5">
        {tabs.map((t) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.id)}
              className={`relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                on ? 'text-ios-blue' : 'text-white/80'
              }`}
            >
              {on && (
                <motion.span
                  layoutId="tab-drop"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  className="absolute inset-0 rounded-full bg-white/14 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
                />
              )}
              <span className="relative">{t.icon}</span>
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
