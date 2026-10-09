import { isCharacterId, type CharacterId } from '../characters.js';
import { CHARACTER_KITS, COMMON_TALENT_IDS, SPECIAL_IDS } from './catalog.js';
import { ARCADE_TUNING } from './tuning.js';
import type {
  ArcadeAbilityId,
  ArcadeLoadout,
  ArcadeMatchState,
  ArcadeSeatState,
  CommonTalentId,
  SpecialId,
} from './types.js';

export function isCommonTalentId(value: unknown): value is CommonTalentId {
  return typeof value === 'string' && (COMMON_TALENT_IDS as readonly string[]).includes(value);
}

export function isSpecialId(value: unknown): value is SpecialId {
  return typeof value === 'string' && (SPECIAL_IDS as readonly string[]).includes(value);
}

export function isArcadeAbilityId(value: unknown): value is ArcadeAbilityId {
  return isCommonTalentId(value) || isSpecialId(value);
}

/** Valida um loadout vindo do lobby; null quando personagem ou talento é inválido. */
export function parseLoadout(character: unknown, talent: unknown): ArcadeLoadout | null {
  if (!isCharacterId(character) || !isCommonTalentId(talent)) return null;
  return { character, talent };
}

/** Quantos talentos comuns o personagem escolhe ("Sou o Bonzão" dá 2). */
export function talentsFor(character: CharacterId): number {
  const kit = CHARACTER_KITS[character];
  return 1 + (kit.passive.id === 'bonzao' ? ARCADE_TUNING.bonzaoTalentBonus : 0);
}

function createSeatState(id: string, loadout: ArcadeLoadout): ArcadeSeatState {
  const passive = CHARACTER_KITS[loadout.character].passive.id;
  return {
    id,
    character: loadout.character,
    talent: loadout.talent,
    specialCharged: true,
    shields: loadout.talent === 'escudo' ? 1 : 0,
    charges: loadout.talent === 'radar' || loadout.talent === 'curinga' ? 1 : 0,
    eliminationBuffer: passive === 'esquenta' ? ARCADE_TUNING.esquentaLetterBuffer : 0,
    revives: passive === 'zumbi' ? 1 : 0,
  };
}

/** Monta o bloco arcade de uma partida. Lista vazia = partida normal (disabled). */
export function createArcadeMatchState(
  seats: readonly { id: string; loadout: ArcadeLoadout }[],
): ArcadeMatchState {
  return { enabled: seats.length > 0, seats: seats.map((s) => createSeatState(s.id, s.loadout)) };
}

export function arcadeSeat(match: ArcadeMatchState, id: string): ArcadeSeatState | undefined {
  return match.enabled ? match.seats.find((s) => s.id === id) : undefined;
}

export function isSpecialCharged(match: ArcadeMatchState, id: string): boolean {
  return arcadeSeat(match, id)?.specialCharged ?? false;
}

/** Gasta o especial (1× por partida). Sem saldo, devolve o mesmo estado. */
export function spendSpecial(match: ArcadeMatchState, id: string): ArcadeMatchState {
  if (!isSpecialCharged(match, id)) return match;
  return { ...match, seats: match.seats.map((s) => (s.id === id ? { ...s, specialCharged: false } : s)) };
}

/** Gasta um uso de talento (Radar/Curinga). Sem saldo, devolve o mesmo estado. */
export function spendCharge(match: ArcadeMatchState, id: string): ArcadeMatchState {
  const seat = arcadeSeat(match, id);
  if (!seat || seat.charges <= 0) return match;
  return { ...match, seats: match.seats.map((s) => (s.id === id ? { ...s, charges: s.charges - 1 } : s)) };
}

/** Dá um escudo (Escudo inicial ou "Deixa Esquentar"). */
export function grantShield(match: ArcadeMatchState, id: string): ArcadeMatchState {
  const seat = arcadeSeat(match, id);
  if (!seat) return match;
  return { ...match, seats: match.seats.map((s) => (s.id === id ? { ...s, shields: s.shields + 1 } : s)) };
}

export interface ShieldResult {
  state: ArcadeMatchState;
  absorbed: boolean;
}

/** Consome um escudo pra anular um dano. Sem escudo, devolve o mesmo estado. */
export function absorbHit(match: ArcadeMatchState, id: string): ShieldResult {
  const seat = arcadeSeat(match, id);
  if (!seat || seat.shields <= 0) return { state: match, absorbed: false };
  return {
    state: { ...match, seats: match.seats.map((s) => (s.id === id ? { ...s, shields: s.shields - 1 } : s)) },
    absorbed: true,
  };
}

/** Vidas efetivas: base do jogo + buffer do Esquenta. */
export function eliminationThreshold(match: ArcadeMatchState, id: string, base: number): number {
  return base + (arcadeSeat(match, id)?.eliminationBuffer ?? 0);
}

export function canRevive(match: ArcadeMatchState, id: string): boolean {
  return (arcadeSeat(match, id)?.revives ?? 0) > 0;
}

/** Gasta uma ressurreição (Zumbi). Sem saldo, devolve o mesmo estado. */
export function spendRevive(match: ArcadeMatchState, id: string): ArcadeMatchState {
  if (!canRevive(match, id)) return match;
  return { ...match, seats: match.seats.map((s) => (s.id === id ? { ...s, revives: s.revives - 1 } : s)) };
}

/** Chance de uma habilidade ofensiva voltar no usuário ("Encrenca" do Babin). */
export function backfireChance(match: ArcadeMatchState, id: string): number {
  const seat = arcadeSeat(match, id);
  if (!seat) return 0;
  return CHARACTER_KITS[seat.character].passive.id === 'encrenca' ? ARCADE_TUNING.encrencaBackfire : 0;
}
