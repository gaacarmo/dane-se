import type { ReactNode } from 'react';
import { type TableTheme, setPref, usePrefs } from '../../lib/prefs';
import { Switch, Symbols } from '../hub/IosKit';
import { Modal } from '../ui/Modal';

const THEMES: { id: TableTheme; label: string; color: string }[] = [
  { id: 'green', label: 'Verde', color: '#145236' },
  { id: 'wine', label: 'Vinho', color: '#5e1825' },
  { id: 'blue', label: 'Azul', color: '#173a63' },
];

/** The rounded, colored square icon of an iOS Settings row. */
function RowIcon({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[0.5rem] text-[17px] text-white" style={{ background: bg }}>
      {children}
    </span>
  );
}

/** A grouped list, like a section of the Settings app. */
function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-1.5 px-4 text-[13px] text-ios-label-2">{title}</h3>}
      <div className="overflow-hidden rounded-[1.1rem] bg-ios-fill">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] text-ios-label-2">{footer}</p>}
    </section>
  );
}

/** One row: icon, label and whatever goes on the right (switch, check, chevron). */
function Row({
  icon,
  label,
  right,
  onClick,
  first = false,
  tone = 'default',
}: {
  icon?: ReactNode;
  label: string;
  right?: ReactNode;
  onClick?: () => void;
  first?: boolean;
  tone?: 'default' | 'danger';
}) {
  const body = (
    <>
      {icon}
      <span className={`min-w-0 flex-1 truncate text-left text-[17px] ${tone === 'danger' ? 'text-ios-red' : 'text-ios-label'}`}>{label}</span>
      {right}
    </>
  );
  // The separator starts after the icon, as on iOS.
  const line = first ? '' : 'border-t border-ios-separator';
  return onClick ? (
    <button type="button" onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 px-4 py-2 transition-colors active:bg-ios-fill-strong ${line}`}>
      {body}
    </button>
  ) : (
    <div className={`flex min-h-12 items-center gap-3 px-4 py-2 ${line}`}>{body}</div>
  );
}

const Chevron = <span className="text-ios-label-3">{Symbols.chevron}</span>;

export function TableMenu({
  open,
  onClose,
  onHelp,
  onLeave,
  onShowKit,
  followAppearance = false,
  tableSettings = true,
}: {
  open: boolean;
  onClose: () => void;
  onHelp: () => void;
  onLeave: () => void;
  /** Arcade: reopen the "your kit" briefing, when the viewer has a loadout. */
  onShowKit?: () => void;
  /** Bingo (iOS table): follow light/dark instead of always dark. */
  followAppearance?: boolean;
  /** Felt tables only: table color and first-person view. The iOS tables (bingo, truco) have neither. */
  tableSettings?: boolean;
}) {
  const prefs = usePrefs();
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  const then = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Modal open={open} onClose={onClose} title="Menu" followAppearance={followAppearance}>
      <div className="space-y-6 pt-1">
        <Group>
          <Row
            first
            icon={<RowIcon bg="#ff375f">🔊</RowIcon>}
            label="Sons"
            right={<Switch on={!prefs.muted} onChange={(on) => setPref('muted', !on)} label="Sons" />}
          />
          {canVibrate && (
            <Row
              icon={<RowIcon bg="#5e5ce6">📳</RowIcon>}
              label="Vibrar na sua vez"
              right={<Switch on={prefs.haptics} onChange={(on) => setPref('haptics', on)} label="Vibrar na sua vez" />}
            />
          )}
          {tableSettings && (
          <Row
            icon={<RowIcon bg="#0a84ff">🪑</RowIcon>}
            label="Primeira pessoa (3D)"
            right={<Switch on={prefs.view3d} onChange={(on) => setPref('view3d', on)} label="Primeira pessoa (3D)" />}
          />
          )}
        </Group>

        {tableSettings && (
        <Group title="Cor da mesa" footer="Só muda no seu aparelho.">
          <div role="radiogroup" aria-label="Cor da mesa">
            {THEMES.map((t, i) => {
              const on = prefs.theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPref('theme', t.id)}
                  className={`flex min-h-12 w-full items-center gap-3 px-4 py-2 transition-colors active:bg-ios-fill-strong ${i > 0 ? 'border-t border-ios-separator' : ''}`}
                >
                  <span aria-hidden className="size-[30px] shrink-0 rounded-full ring-2 ring-white/20" style={{ background: t.color }} />
                  <span className="flex-1 text-left text-[17px] text-ios-label">{t.label}</span>
                  {on && (
                    <svg viewBox="0 0 24 24" className="size-5 text-ios-blue" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </Group>
        )}

        <Group>
          {onShowKit && <Row first icon={<RowIcon bg="#bf5af2">🎴</RowIcon>} label="Seu kit" right={Chevron} onClick={then(onShowKit)} />}
          <Row first={!onShowKit} icon={<RowIcon bg="#ff9f0a">📖</RowIcon>} label="Como jogar" right={Chevron} onClick={then(onHelp)} />
        </Group>

        <Group>
          <Row first label="Sair da partida" tone="danger" onClick={then(onLeave)} />
        </Group>
      </div>
    </Modal>
  );
}
