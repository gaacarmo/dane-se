import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { ArcadeAbilityId, PlayerView } from '@dane-se/shared';
import { withAlpha } from '../../lib/characters';
import { PlayingCard } from '../cards/PlayingCard';
import type { ArcadeAbilityUi } from './arcadeUi';

/**
 * The viewer's arcade controls, kept out of the felt: a thin row of ability
 * icons anchored to the lower-left corner, plus hotkeys (1..n to fire, Esc to
 * cancel). Targeted abilities don't list opponents — the seats themselves light
 * up so you point at whoever is sitting there. The info tray (reveals + the
 * VAR's "de gato" alerts) only ever reaches its owner.
 */
export function ArcadeBar({
  game,
  slots,
  pending,
  onSelect,
  onFire,
  onCancel,
}: {
  game: PlayerView;
  slots: ArcadeAbilityUi[];
  pending: ArcadeAbilityId | null;
  onSelect: (ability: ArcadeAbilityUi) => void;
  onFire: (ability: ArcadeAbilityId, targetId?: string, bet?: number) => void;
  onCancel: () => void;
}) {
  const arcade = game.arcade;
  const [showInfo, setShowInfo] = useState(false);
  const hasInfo = arcade.reveals.length > 0 || arcade.gatoAlerts.length > 0;
  const pendingDef = pending ? slots.find((s) => s.id === pending) : undefined;
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? '…';

  // Hotkeys: 1..n fires the matching ability, Esc backs out. Only while playing.
  useEffect(() => {
    if (slots.length === 0 && !hasInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (pending || showInfo) {
          e.preventDefault();
          onCancel();
          setShowInfo(false);
        }
        return;
      }
      if (pending) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > slots.length) return;
      const ability = slots[n - 1];
      if (ability) {
        e.preventDefault();
        onSelect(ability);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slots, pending, showInfo, hasInfo, onSelect, onCancel]);

  if (slots.length === 0 && !hasInfo) return null;

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-40 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1.5">
      <AnimatePresence>
        {showInfo && hasInfo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-auto max-h-[55vh] w-64 overflow-y-auto rounded-2xl bg-black/85 p-2 text-stone-100 ring-1 ring-fuchsia-400/40 backdrop-blur"
          >
            {arcade.gatoAlerts.length > 0 && (
              <p className="mb-2 rounded-lg bg-card-red/25 px-2 py-1 text-[11px] font-semibold text-card-red">
                🐱 De gato: {arcade.gatoAlerts.map(nameOf).join(', ')}
              </p>
            )}
            {arcade.reveals.length > 0 && (
              <>
                <p className="mb-1 text-[10px] font-semibold tracking-wider text-stone-400 uppercase">Espiadas</p>
                <div className="flex flex-wrap gap-2">
                  {arcade.reveals.map((r, i) => (
                    <div key={`${r.targetId}-${i}`} className="w-9">
                      <PlayingCard card={r.card} highlight={r.card.rank === game.manilhaRank} />
                      <p className="mt-0.5 truncate text-center text-[9px] text-stone-300">{nameOf(r.targetId)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
        {slots.map((ability, i) => (
          <button
            key={ability.id}
            type="button"
            onClick={() => onSelect(ability)}
            title={`${ability.name} — ${ability.blurb} (tecla ${i + 1})`}
            aria-label={`${ability.name}: ${ability.blurb}`}
            className="relative grid size-10 place-items-center rounded-xl border-2 bg-black/70 text-xl shadow-lg backdrop-blur transition active:scale-90"
            style={{
              borderColor: ability.color,
              boxShadow:
                pending === ability.id
                  ? `0 0 0 2px ${withAlpha(ability.color, 0.75)}, 0 0 14px 3px ${withAlpha(ability.color, 0.55)}`
                  : `0 0 9px 1px ${withAlpha(ability.color, 0.4)}`,
            }}
          >
            <span aria-hidden>{ability.icon}</span>
            <kbd className="absolute -top-1 -left-1 grid size-4 place-items-center rounded bg-fuchsia-500/80 text-[9px] font-bold text-white">
              {i + 1}
            </kbd>
          </button>
        ))}

        {pendingDef?.needsTarget && (
          <span
            className="ml-1 flex items-center gap-1.5 rounded-lg border-2 bg-black/70 px-2 py-1 text-[11px] font-semibold text-stone-100"
            style={{ borderColor: withAlpha(pendingDef.color, 0.6) }}
          >
            🎯 {pendingDef.name}: toque no jogador
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancelar"
              title="Cancelar (Esc)"
              className="grid size-5 place-items-center rounded bg-white/10 text-sm text-stone-300 transition hover:text-white active:scale-90"
            >
              ×
            </button>
          </span>
        )}

        {pendingDef?.needsBet && (
          <>
            <span className="ml-1 rounded bg-black/70 px-1.5 py-1 text-[11px] font-semibold text-stone-200">
              {pendingDef.name} — nova aposta:
            </span>
            {Array.from({ length: game.cardsPerPlayer + 1 }, (_, bet) => (
              <button
                key={bet}
                type="button"
                onClick={() => onFire(pendingDef.id, undefined, bet)}
                className="grid size-8 place-items-center rounded-lg bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-black text-wood-900 ring-1 ring-gold-300 transition active:scale-90"
              >
                {bet}
              </button>
            ))}
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancelar"
              title="Cancelar (Esc)"
              className="grid size-8 place-items-center rounded-lg bg-black/70 text-lg text-stone-300 ring-1 ring-white/20 transition hover:text-white active:scale-90"
            >
              ×
            </button>
          </>
        )}

        {!pendingDef && hasInfo && (
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-label="Espiadas e avisos"
            title="Espiadas e avisos"
            className={`relative grid size-10 place-items-center rounded-xl bg-black/70 text-xl shadow-lg ring-1 backdrop-blur transition active:scale-90 ${
              showInfo ? 'ring-2 ring-sky-300' : 'ring-sky-400/50 hover:ring-sky-300'
            }`}
          >
            <span aria-hidden>👁️</span>
            {arcade.gatoAlerts.length > 0 && (
              <span className="absolute -top-1 -left-1 grid size-4 place-items-center rounded bg-card-red text-[9px] font-bold text-white">
                !
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
