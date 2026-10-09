import {
  CHARACTER_KITS,
  COMMON_TALENTS,
  type ArcadeAbilityId,
  type CommonTalentId,
  type PlayerView,
  type PublicPlayer,
  type SpecialId,
} from '@dane-se/shared';

export interface ArcadeAbilityUi {
  id: ArcadeAbilityId;
  name: string;
  icon: string;
  blurb: string;
  /** The player must point at an opponent (can be done on the seat itself). */
  needsTarget: boolean;
  /** NUOSSA! asks for a new bet instead of a target. */
  needsBet: boolean;
}

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

/**
 * The viewer's currently usable arcade abilities: the 1× special (while charged)
 * plus Radar/Curinga (while talent charges remain). Empty outside an active
 * round, for spectators, or when arcade is off.
 */
export function arcadeSlots(game: PlayerView): ArcadeAbilityUi[] {
  const { arcade } = game;
  const me = game.viewerId ? game.players.find((p) => p.id === game.viewerId) : undefined;
  const active = game.phase === 'betting' || game.phase === 'playing' || game.phase === 'trickEnd';
  if (!me || game.isSpectator || me.eliminated || !arcade.enabled || !arcade.loadout || !active) return [];

  const slots: ArcadeAbilityUi[] = [];
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
  return slots;
}

/** Opponents the viewer may point at (still in the round). */
export function arcadeOpponents(game: PlayerView): PublicPlayer[] {
  return game.players.filter((p) => p.id !== game.viewerId && !p.eliminated);
}
