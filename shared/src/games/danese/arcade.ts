import { randomInt } from '../../rng.js';
import {
  type ArcadeAbilityId,
  type ArcadeSeatState,
  CHARACTER_KITS,
  arcadeSeat,
  grantShield,
  spendCharge,
  spendSpecial,
} from '../../arcade/index.js';
import type { ActionResult, ArcadeReveal, GameError, GameState } from './game.js';

/** The `arcade` member of `GameAction` (kept here to avoid a runtime cycle). */
export interface ArcadeAbilityAction {
  type: 'arcade';
  playerId: string;
  ability: ArcadeAbilityId;
  targetId?: string;
  bet?: number;
}

const ok = (state: GameState): ActionResult => ({ ok: true, state });
const err = (error: GameError): ActionResult => ({ ok: false, error });

function canAct(state: GameState, playerId: string): boolean {
  return (
    state.roundOrder.includes(playerId) &&
    (state.phase === 'betting' || state.phase === 'playing' || state.phase === 'trickEnd')
  );
}

/** The chosen opponent for a targeted ability, or null when illegal. */
function targetOpponent(state: GameState, playerId: string, targetId: unknown): string | null {
  if (typeof targetId !== 'string' || targetId === playerId) return null;
  if (!state.roundOrder.includes(targetId)) return null;
  const target = state.players.find((p) => p.id === targetId);
  if (!target || target.eliminated) return null;
  return targetId;
}

function pushReveals(
  map: Record<string, ArcadeReveal[]>,
  id: string,
  reveals: readonly ArcadeReveal[],
): Record<string, ArcadeReveal[]> {
  return { ...map, [id]: [...(map[id] ?? []), ...reveals] };
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

/** Rádio Corredor (talento): 1× vê uma carta aleatória de um oponente. */
function useRadar(state: GameState, seat: ArcadeSeatState, action: ArcadeAbilityAction): ActionResult {
  if (!seat.talents.includes('radar') || seat.charges <= 0) return err('ABILITY_UNAVAILABLE');
  if (!canAct(state, action.playerId)) return err('WRONG_PHASE');
  const target = targetOpponent(state, action.playerId, action.targetId);
  if (!target) return err('INVALID_TARGET');
  const hand = state.hands[target] ?? [];
  if (hand.length === 0) return err('INVALID_TARGET');

  const pick = randomInt(state.rng, hand.length);
  return ok({
    ...state,
    rng: pick.state,
    arcade: spendCharge(state.arcade, action.playerId),
    arcadePrivate: pushReveals(state.arcadePrivate, action.playerId, [
      { targetId: target, card: { ...hand[pick.value]! } },
    ]),
  });
}

/** Substituição (talento): 1× troca uma carta aleatória da própria mão por uma do baralho. */
function useCuringa(state: GameState, seat: ArcadeSeatState, action: ArcadeAbilityAction): ActionResult {
  if (!seat.talents.includes('curinga') || seat.charges <= 0) return err('ABILITY_UNAVAILABLE');
  if (state.phase !== 'betting' && state.phase !== 'playing') return err('WRONG_PHASE');
  const hand = state.hands[action.playerId] ?? [];
  if (hand.length === 0 || state.deck.length === 0) return err('ABILITY_UNAVAILABLE');

  const out = randomInt(state.rng, hand.length);
  const next = [...hand];
  next[out.value] = state.deck[state.deck.length - 1]!;
  return ok({
    ...state,
    rng: out.state,
    deck: state.deck.slice(0, -1),
    hands: { ...state.hands, [action.playerId]: next },
    arcade: spendCharge(state.arcade, action.playerId),
  });
}

/** Leitura de Jogo (Dezin): especial, vê a mão inteira de um oponente. */
function useVisao(state: GameState, seat: ArcadeSeatState, action: ArcadeAbilityAction): ActionResult {
  if (CHARACTER_KITS[seat.character].special.id !== 'visao' || !seat.specialCharged) {
    return err('ABILITY_UNAVAILABLE');
  }
  if (!canAct(state, action.playerId)) return err('WRONG_PHASE');
  const target = targetOpponent(state, action.playerId, action.targetId);
  if (!target) return err('INVALID_TARGET');
  const hand = state.hands[target] ?? [];
  if (hand.length === 0) return err('INVALID_TARGET');

  const reveals: ArcadeReveal[] = hand.map((card) => ({ targetId: target, card: { ...card } }));
  return ok({
    ...state,
    arcade: spendSpecial(state.arcade, action.playerId),
    arcadePrivate: pushReveals(state.arcadePrivate, action.playerId, reveals),
  });
}

/** Catimba (Carmelo): especial, muda a própria aposta depois de todo mundo apostar. */
function useNuossa(state: GameState, seat: ArcadeSeatState, action: ArcadeAbilityAction): ActionResult {
  if (CHARACTER_KITS[seat.character].special.id !== 'nuossa' || !seat.specialCharged) {
    return err('ABILITY_UNAVAILABLE');
  }
  if (state.phase !== 'playing') return err('WRONG_PHASE');
  const bet = action.bet;
  if (typeof bet !== 'number' || !Number.isInteger(bet) || bet < 0 || bet > state.cardsPerPlayer) {
    return err('ILLEGAL_BET');
  }
  return ok({
    ...state,
    bets: { ...state.bets, [action.playerId]: bet },
    arcade: spendSpecial(state.arcade, action.playerId),
  });
}

/** Tabelinha (Martelo): especial, troca uma carta aleatória com um oponente escolhido. */
function useSafadeza(state: GameState, seat: ArcadeSeatState, action: ArcadeAbilityAction): ActionResult {
  if (CHARACTER_KITS[seat.character].special.id !== 'safadeza' || !seat.specialCharged) {
    return err('ABILITY_UNAVAILABLE');
  }
  if (state.phase !== 'playing') return err('WRONG_PHASE');
  const target = targetOpponent(state, action.playerId, action.targetId);
  if (!target) return err('INVALID_TARGET');
  const mine = state.hands[action.playerId] ?? [];
  const theirs = state.hands[target] ?? [];
  if (mine.length === 0 || theirs.length === 0) return err('INVALID_TARGET');

  const myPick = randomInt(state.rng, mine.length);
  const theirPick = randomInt(myPick.state, theirs.length);
  const myHand = [...mine];
  const theirHand = [...theirs];
  const swapped = myHand[myPick.value]!;
  myHand[myPick.value] = theirHand[theirPick.value]!;
  theirHand[theirPick.value] = swapped;

  return ok({
    ...state,
    rng: theirPick.state,
    hands: { ...state.hands, [action.playerId]: myHand, [target]: theirHand },
    arcade: spendSpecial(state.arcade, action.playerId),
  });
}

/** Invasão de Campo (Babin): especial, zera as apostas e todo mundo re-aposta a mesma mão. */
function useBomba(state: GameState, seat: ArcadeSeatState, action: ArcadeAbilityAction): ActionResult {
  if (CHARACTER_KITS[seat.character].special.id !== 'bomba' || !seat.specialCharged) {
    return err('ABILITY_UNAVAILABLE');
  }
  const canBomb =
    state.phase === 'betting' ||
    (state.phase === 'playing' && state.completedTricks.length === 0 && state.trick.plays.length === 0);
  if (!canBomb) return err('WRONG_PHASE');

  return ok({
    ...state,
    phase: 'betting',
    bets: {},
    trick: { leaderId: state.trick.leaderId, plays: [], result: null },
    turnPlayerId: state.roundOrder[0] ?? null,
    arcade: spendSpecial(state.arcade, action.playerId),
  });
}

/** Pênalti! (Colombo): acusa; acerto pune o alvo, erro devolve a letra pro acusador. */
function usePegaGato(state: GameState, seat: ArcadeSeatState, action: ArcadeAbilityAction): ActionResult {
  if (CHARACTER_KITS[seat.character].special.id !== 'pegaGato' || !seat.specialCharged) {
    return err('ABILITY_UNAVAILABLE');
  }
  if (state.phase !== 'playing' && state.phase !== 'trickEnd') return err('WRONG_PHASE');
  const target = targetOpponent(state, action.playerId, action.targetId);
  if (!target) return err('INVALID_TARGET');

  const punished = isGato(state, target) ? target : action.playerId;
  return ok({
    ...state,
    pendingLetters: { ...state.pendingLetters, [punished]: (state.pendingLetters[punished] ?? 0) + 1 },
    arcade: spendSpecial(state.arcade, action.playerId),
  });
}

/** Carrinho (Sarney): especial, ganha um escudo contra a próxima letra recebida. */
function useEsquentar(state: GameState, seat: ArcadeSeatState, action: ArcadeAbilityAction): ActionResult {
  if (CHARACTER_KITS[seat.character].special.id !== 'esquentar' || !seat.specialCharged) {
    return err('ABILITY_UNAVAILABLE');
  }
  if (state.phase !== 'betting' && state.phase !== 'playing' && state.phase !== 'trickEnd') {
    return err('WRONG_PHASE');
  }
  return ok({
    ...state,
    arcade: grantShield(spendSpecial(state.arcade, action.playerId), action.playerId),
  });
}

// ---------------------------------------------------------------------------
// Entry point + view helpers
// ---------------------------------------------------------------------------

export function applyArcadeAbility(state: GameState, action: ArcadeAbilityAction): ActionResult {
  const seat = arcadeSeat(state.arcade, action.playerId);
  const player = state.players.find((p) => p.id === action.playerId);
  if (!seat || !player || player.eliminated) return err('ABILITY_UNAVAILABLE');

  switch (action.ability) {
    case 'radar':
      return useRadar(state, seat, action);
    case 'curinga':
      return useCuringa(state, seat, action);
    case 'visao':
      return useVisao(state, seat, action);
    case 'nuossa':
      return useNuossa(state, seat, action);
    case 'safadeza':
      return useSafadeza(state, seat, action);
    case 'bomba':
      return useBomba(state, seat, action);
    case 'pegaGato':
      return usePegaGato(state, seat, action);
    case 'esquentar':
      return useEsquentar(state, seat, action);
    // Trave é passiva (não acionável); qualquer outro id cai aqui.
    default:
      return err('ABILITY_UNAVAILABLE');
  }
}

/** Cartas de oponentes reveladas ao viewer (só ele recebe). */
export function viewerReveals(state: GameState, viewerId: string | null): ArcadeReveal[] {
  if (!viewerId || !state.arcade.enabled) return [];
  return state.arcadePrivate[viewerId] ?? [];
}

/** "De gato": apostou ≥1 e, matematicamente, já não consegue mais bater a aposta. */
function isGato(state: GameState, id: string): boolean {
  const bet = state.bets[id] ?? 0;
  if (bet < 1) return false;
  const won = state.tricksWon[id] ?? 0;
  const remaining = state.cardsPerPlayer - state.completedTricks.length;
  const canHit = won <= bet && won + remaining >= bet;
  return !canHit;
}

/**
 * VAR (Colombo): marca quem apostou ≥1 e já não consegue mais
 * bater a aposta. Só o dono da passiva recebe a lista.
 */
export function gatoAlerts(state: GameState, viewerId: string | null): string[] {
  if (!viewerId || !state.arcade.enabled) return [];
  const seat = arcadeSeat(state.arcade, viewerId);
  if (!seat || CHARACTER_KITS[seat.character].passive.id !== 'farejador') return [];
  if (state.phase !== 'playing' && state.phase !== 'trickEnd') return [];

  const alerts: string[] = [];
  for (const id of state.roundOrder) {
    if (id === viewerId) continue;
    const player = state.players.find((p) => p.id === id);
    if (!player || player.eliminated) continue;
    if (isGato(state, id)) alerts.push(id);
  }
  return alerts;
}
