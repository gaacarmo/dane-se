import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  CHARACTER_KITS,
  COMMON_TALENTS,
  type ArcadeAbilityId,
  type CommonTalentId,
  type PlayerView,
  type SpecialId,
} from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { actions } from '../../lib/store';
import { PlayingCard } from '../cards/PlayingCard';

/** Icon + targeting shape of each 1× special. */
const SPECIAL_UI: Record<SpecialId, { icon: string; target: boolean; bet: boolean }> = {
  nuossa: { icon: '😎', target: false, bet: true },
  safadeza: { icon: '🃏', target: true, bet: false },
  bomba: { icon: '💣', target: false, bet: false },
  visao: { icon: '👁️', target: true, bet: false },
  esquentar: { icon: '🔥', target: false, bet: false },
  pegaGato: { icon: '🐱', target: true, bet: false },
};

const TALENT_ICON: Record<CommonTalentId, string> = {
  escudo: '🛡️',
  radar: '📡',
  curinga: '🃏',
};

interface AbilityUi {
  id: ArcadeAbilityId;
  name: string;
  icon: string;
  blurb: string;
  needsTarget: boolean;
  needsBet: boolean;
}

/**
 * The viewer's arcade controls, kept out of the felt: a thin row of ability
 * icons anchored to the lower-left corner, plus hotkeys (1..n to fire, Esc to
 * cancel). Targeted abilities unfold an inline "pick a target" row, so nothing
 * ever sits over the vira or the cards on the table.
 */
export function ArcadeBar({ game }: { game: PlayerView }) {
  const arcade = game.arcade;
  const youId = game.viewerId;
  const me = youId ? game.players.find((p) => p.id === youId) : undefined;
  const isPlayer = !!me && !game.isSpectator && !me.eliminated && arcade.enabled && !!arcade.loadout;
  // Abilities only make sense mid-round; the info tray (reveals) stays readable after.
  const canActNow = game.phase === 'betting' || game.phase === 'playing' || game.phase === 'trickEnd';

  const [pending, setPending] = useState<ArcadeAbilityId | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const slots: AbilityUi[] = [];
  if (isPlayer && canActNow && arcade.loadout) {
    if (arcade.specialCharged) {
      const special = CHARACTER_KITS[arcade.loadout.character].special;
      const ui = SPECIAL_UI[special.id];
      slots.push({
        id: special.id,
        name: special.name,
        icon: ui.icon,
        blurb: special.danese,
        needsTarget: ui.target,
        needsBet: ui.bet,
      });
    }
    if (arcade.charges > 0) {
      for (const talent of arcade.loadout.talents) {
        if (talent !== 'radar' && talent !== 'curinga') continue;
        const def = COMMON_TALENTS[talent];
        slots.push({
          id: talent,
          name: def.name,
          icon: TALENT_ICON[talent],
          blurb: def.danese,
          needsTarget: talent === 'radar',
          needsBet: false,
        });
      }
    }
  }

  const hasInfo = arcade.reveals.length > 0 || arcade.gatoAlerts.length > 0;
  const opponents = game.players.filter((p) => p.id !== youId && !p.eliminated);
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? '…';
  const pendingDef = pending ? slots.find((s) => s.id === pending) : undefined;

  function fire(ability: ArcadeAbilityId, targetId?: string, bet?: number): void {
    void actions.arcade(ability, targetId, bet);
    setPending(null);
  }

  function choose(ability: AbilityUi): void {
    if (ability.needsTarget || ability.needsBet) setPending(ability.id);
    else fire(ability.id);
  }

  // Hotkeys: 1..n fires the matching ability, Esc backs out. Only while playing.
  useEffect(() => {
    if (!isPlayer) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (pending || showInfo) {
          e.preventDefault();
          setPending(null);
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
        choose(ability);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlayer, pending, showInfo, game]);

  if (!isPlayer || (slots.length === 0 && !hasInfo)) return null;

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
            onClick={() => choose(ability)}
            title={`${ability.name} — ${ability.blurb} (tecla ${i + 1})`}
            aria-label={`${ability.name}: ${ability.blurb}`}
            className={`relative grid size-10 place-items-center rounded-xl bg-black/70 text-xl shadow-lg ring-1 backdrop-blur transition active:scale-90 ${
              pending === ability.id ? 'ring-2 ring-fuchsia-300' : 'ring-fuchsia-400/50 hover:ring-fuchsia-300'
            }`}
          >
            <span aria-hidden>{ability.icon}</span>
            <kbd className="absolute -top-1 -left-1 grid size-4 place-items-center rounded bg-fuchsia-500/80 text-[9px] font-bold text-white">
              {i + 1}
            </kbd>
          </button>
        ))}

        {pendingDef && (
          <>
            <span className="ml-1 rounded bg-black/70 px-1.5 py-1 text-[11px] font-semibold text-stone-200">
              {pendingDef.needsBet ? 'Nova aposta:' : 'Alvo:'}
            </span>
            {pendingDef.needsBet
              ? Array.from({ length: game.cardsPerPlayer + 1 }, (_, bet) => (
                  <button
                    key={bet}
                    type="button"
                    onClick={() => fire(pendingDef.id, undefined, bet)}
                    className="grid size-8 place-items-center rounded-lg bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-black text-wood-900 ring-1 ring-gold-300 transition active:scale-90"
                  >
                    {bet}
                  </button>
                ))
              : opponents.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => fire(pendingDef.id, p.id)}
                    className="flex items-center gap-1 rounded-lg bg-black/70 py-1 pr-2 pl-1 text-xs font-semibold text-white ring-1 ring-fuchsia-400/40 transition hover:ring-fuchsia-300 active:scale-95"
                  >
                    <span
                      className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: avatarColor(p.id) }}
                    >
                      {initial(p.name)}
                    </span>
                    {p.name}
                  </button>
                ))}
            <button
              type="button"
              onClick={() => setPending(null)}
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
