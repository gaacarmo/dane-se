import { useState } from 'react';
import { CHARACTER_KITS, COMMON_TALENTS, type CommonTalentId, type PlayerView } from '@dane-se/shared';
import { CHARACTER_COLORS, CHARACTER_NAMES, portraitUrl, withAlpha } from '../../lib/characters';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { SPECIAL_UI, TALENT_COLOR, TALENT_ICON } from './arcadeUi';

/**
 * Pre-match "your kit" briefing: the viewer's own passive, special and chosen
 * talents, all in their character's color. Shown at the start of every arcade
 * match unless the player checks "não mostrar de novo", and reachable again
 * from the table menu. Only ever the viewer's own kit — never the whole table.
 */
export function ArcadeOnboarding({
  open,
  game,
  onClose,
}: {
  open: boolean;
  game: PlayerView;
  /** Called with `true` when the player asked to never auto-open it again. */
  onClose: (hideForever: boolean) => void;
}) {
  const [hide, setHide] = useState(false);
  const loadout = game.arcade.loadout;
  if (!loadout) return null;

  const character = loadout.character;
  const kit = CHARACTER_KITS[character];
  const color = CHARACTER_COLORS[character];

  const rows = [
    {
      key: 'passive',
      tag: 'Passiva',
      name: kit.passive.name,
      icon: '🎭',
      tone: color,
      text: kit.passive.danese,
    },
    {
      key: 'special',
      tag: 'Especial · 1× por partida',
      name: kit.special.name,
      icon: SPECIAL_UI[kit.special.id].icon,
      tone: color,
      text: kit.special.danese,
    },
    ...loadout.talents.map((talent: CommonTalentId) => ({
      key: `talent-${talent}`,
      tag: 'Talento',
      name: COMMON_TALENTS[talent].name,
      icon: TALENT_ICON[talent],
      tone: TALENT_COLOR[talent],
      text: COMMON_TALENTS[talent].danese,
    })),
  ];

  const close = () => onClose(hide);

  return (
    <Modal open={open} onClose={close} title="Seu kit">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <img
            src={portraitUrl(character)}
            alt=""
            className="size-16 shrink-0 rounded-2xl bg-black/30 object-cover"
            style={{ boxShadow: `0 0 0 2px ${color}, 0 0 16px 2px ${withAlpha(color, 0.5)}` }}
            draggable={false}
          />
          <div>
            <p className="font-display text-xl" style={{ color }}>
              {CHARACTER_NAMES[character]}
            </p>
            <p className="text-xs text-stone-300">
              Este kit é só seu. Pra mesa, o único sinal é a aura quando o especial ainda está carregado.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-start gap-3 rounded-xl bg-black/25 p-2.5"
              style={{ borderLeft: `3px solid ${row.tone}` }}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-black/40 text-lg"
                style={{ boxShadow: `inset 0 0 0 1px ${withAlpha(row.tone, 0.6)}` }}
                aria-hidden
              >
                {row.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-wider text-stone-400 uppercase">{row.tag}</p>
                <p className="font-semibold text-stone-100">{row.name}</p>
                <p className="text-xs text-stone-300">{row.text}</p>
              </div>
            </div>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-300">
          <input
            type="checkbox"
            checked={hide}
            onChange={(e) => setHide(e.target.checked)}
            className="size-4 accent-amber-400"
          />
          Não mostrar de novo
        </label>

        <Button className="w-full" onClick={close}>
          Bora! 🎴
        </Button>
      </div>
    </Modal>
  );
}
