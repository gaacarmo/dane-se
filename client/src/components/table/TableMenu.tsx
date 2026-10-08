import { type TableTheme, setPref, usePrefs } from '../../lib/prefs';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

const THEMES: { id: TableTheme; label: string; color: string }[] = [
  { id: 'green', label: 'Verde', color: '#145236' },
  { id: 'wine', label: 'Vinho', color: '#5e1825' },
  { id: 'blue', label: 'Azul', color: '#173a63' },
];

export function TableMenu({
  open,
  onClose,
  onHelp,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  onHelp: () => void;
  onLeave: () => void;
}) {
  const prefs = usePrefs();
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  return (
    <Modal open={open} onClose={onClose} title="Menu">
      <div className="space-y-4">
        <Toggle label="🔊 Sons" checked={!prefs.muted} onChange={(on) => setPref('muted', !on)} />
        {canVibrate && <Toggle label="📳 Vibrar na sua vez" checked={prefs.haptics} onChange={(on) => setPref('haptics', on)} />}

        <div>
          <p className="mb-2 text-sm text-stone-300">Cor da mesa (só no seu aparelho)</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Cor da mesa">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={prefs.theme === t.id}
                onClick={() => setPref('theme', t.id)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ring-2 transition ${
                  prefs.theme === t.id ? 'ring-gold-400' : 'ring-white/10'
                }`}
                style={{ background: t.color }}
              >
                {prefs.theme === t.id && '✓ '}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              onClose();
              onHelp();
            }}
          >
            📖 Como jogar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onClose();
              onLeave();
            }}
          >
            🚪 Sair da partida
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 rounded-full transition ${checked ? 'bg-gold-400' : 'bg-black/50 ring-1 ring-white/20'}`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${checked ? 'left-7' : 'left-1'}`}
        />
        <span className="sr-only">{checked ? 'ligado' : 'desligado'}</span>
      </button>
    </label>
  );
}
