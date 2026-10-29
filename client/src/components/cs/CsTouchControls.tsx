import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { CsInput } from './useCsInput';

const STICK_RADIUS = 56;

interface Props {
  input: CsInput;
  /** Menus, mercado e mapa abertos: os controles somem e os toques vão para eles. */
  hidden: boolean;
  /** Morto: um toque na área de olhar troca o colega observado. */
  onLookTap: () => void;
  onBuy: () => void;
  onMap: () => void;
  onPing: () => void;
  onMenu: () => void;
  /** Armas na mão e no coldre, por slot: a ativa fica destacada. */
  weapons: { slot: 1 | 2; name: string; active: boolean }[];
}

function Button({
  label,
  size = 56,
  className = '',
  onDown,
  onUp,
  children,
}: {
  label: string;
  size?: number;
  className?: string;
  onDown: () => void;
  onUp?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{ width: size, height: size }}
      className={`pointer-events-auto grid touch-none place-items-center rounded-full border border-white/25 bg-black/45 font-mono text-xs text-stone-200 select-none active:bg-white/25 ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {children}
    </button>
  );
}

/** Controles de toque no estilo PUBG: alavanca à esquerda, olhar arrastando à direita e botões de ação. */
export function CsTouchControls({ input, hidden, onLookTap, onBuy, onMap, onPing, onMenu, weapons }: Props) {
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [crouching, setCrouching] = useState(false);

  if (hidden) return null;

  const stickDown = (e: PointerEvent<HTMLDivElement>) => {
    if (stick.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setKnob({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };
  const stickMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const length = Math.hypot(dx, dy);
    if (length > STICK_RADIUS) {
      dx = (dx / length) * STICK_RADIUS;
      dy = (dy / length) * STICK_RADIUS;
    }
    input.touch.setMove(dx / STICK_RADIUS, -dy / STICK_RADIUS);
    setKnob({ x: s.x, y: s.y, dx, dy });
  };
  const stickUp = (e: PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    input.touch.setMove(0, 0);
    setKnob(null);
  };

  const lookDown = (e: PointerEvent<HTMLDivElement>) => {
    if (look.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  };
  const lookMove = (e: PointerEvent<HTMLDivElement>) => {
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    const dx = e.clientX - l.x;
    const dy = e.clientY - l.y;
    l.x = e.clientX;
    l.y = e.clientY;
    l.moved += Math.abs(dx) + Math.abs(dy);
    input.touch.addLook(dx, dy);
  };
  const lookUp = (e: PointerEvent<HTMLDivElement>) => {
    const l = look.current;
    if (l?.id !== e.pointerId) return;
    look.current = null;
    if (l.moved < 8) onLookTap();
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] touch-none select-none">
      <div
        className="pointer-events-auto absolute inset-y-0 left-0 w-2/5 touch-none"
        onPointerDown={stickDown}
        onPointerMove={stickMove}
        onPointerUp={stickUp}
        onPointerCancel={stickUp}
      />
      <div
        className="pointer-events-auto absolute inset-y-0 right-0 w-3/5 touch-none"
        onPointerDown={lookDown}
        onPointerMove={lookMove}
        onPointerUp={lookUp}
        onPointerCancel={lookUp}
      />

      {knob && (
        <div className="pointer-events-none fixed" style={{ left: knob.x - STICK_RADIUS, top: knob.y - STICK_RADIUS }}>
          <div className="size-28 rounded-full border border-white/25 bg-white/5" />
          <div
            className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-white/20"
            style={{ transform: `translate(calc(-50% + ${knob.dx}px), calc(-50% + ${knob.dy}px))` }}
          />
        </div>
      )}

      <div className="pointer-events-none absolute top-3 right-3 flex gap-2">
        <Button label="Mercado" size={44} onDown={onBuy}>
          $
        </Button>
        <Button label="Mapa e placar" size={44} onDown={onMap}>
          Mapa
        </Button>
        <Button label="Pingar" size={44} onDown={onPing}>
          Ping
        </Button>
        <Button label="Menu" size={44} onDown={onMenu}>
          Menu
        </Button>
      </div>

      <div className="pointer-events-none absolute right-4 bottom-4 flex items-end gap-3">
        <div className="flex flex-col items-center gap-3">
          {weapons.map((w) => (
            <button
              key={w.slot}
              type="button"
              aria-label={`Trocar para ${w.name}`}
              aria-pressed={w.active}
              onPointerDown={() => input.touch.selectSlot(w.slot)}
              className={`pointer-events-auto touch-none rounded-lg border px-2 py-1.5 text-left font-mono text-[11px] leading-tight select-none ${
                w.active ? 'border-gold-400/80 bg-gold-500/25 text-stone-100' : 'border-white/25 bg-black/45 text-stone-300'
              }`}
              style={{ width: 84 }}
            >
              <span className="block text-[10px] text-stone-400">{w.slot}</span>
              <span className="block truncate">{w.name}</span>
            </button>
          ))}
          <Button label="Recarregar" size={48} onDown={() => input.touch.reload()}>
            R
          </Button>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Button label="Pular" size={52} onDown={() => input.touch.jump()}>
            Pular
          </Button>
          <Button
            label="Agachar"
            size={52}
            className={crouching ? 'bg-white/30' : ''}
            onDown={() => {
              input.touch.toggleCrouch();
              setCrouching((c) => !c);
            }}
          >
            Abaixar
          </Button>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Button label="Plantar ou desarmar" size={64} onDown={() => input.touch.setUse(true)} onUp={() => input.touch.setUse(false)}>
            Usar
          </Button>
          <Button label="Atirar" size={88} className="border-red-400/60 bg-red-900/40" onDown={() => input.touch.setFire(true)} onUp={() => input.touch.setFire(false)}>
            Fogo
          </Button>
        </div>
      </div>
    </div>
  );
}
