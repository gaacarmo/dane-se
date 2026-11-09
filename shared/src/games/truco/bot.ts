import { nextRandom } from '../../rng.js';
import { type Card } from '../danese/cards.js';
import { type TrucoAction } from './game.js';
import { TRUCO_COVERED_STRENGTH, trucoStrength } from './rules.js';
import { type TrucoTableCard, type TrucoView } from './view.js';

/**
 * Bot de truco: só usa o que a própria `TrucoView` mostra (não espia ninguém).
 * Pede truco com mão forte, blefa de vez em quando e foge quando a mão é fraca.
 */

/** 0 (mão péssima) a 1 (manilhas altas). */
function handScore(cards: readonly Card[], manilha: Card['rank']): number {
  if (cards.length === 0) return 0;
  const values = cards.map((c) => {
    const s = trucoStrength(c, manilha);
    return s >= 100 ? 0.75 + (s - 100) * 0.0833 : s / 12; // manilhas: 0,75 a 1; resto: 0 a 0,75
  });
  values.sort((a, b) => b - a);
  // A melhor carta pesa mais: é ela que ganha vaza.
  const weights = [0.55, 0.3, 0.15];
  return values.reduce((sum, v, i) => sum + v * (weights[i] ?? 0), 0) / weights.slice(0, values.length).reduce((a, b) => a + b, 0);
}

function roundsWon(view: TrucoView): number {
  return view.rounds.filter((r) => r.result === view.myTeam).length;
}

function roundsLost(view: TrucoView): number {
  return view.rounds.filter((r) => r.result !== 'tie' && r.result !== view.myTeam).length;
}

/** Força da mão contando o andamento da mão (vazas ganhas valem muito). */
function confidence(view: TrucoView, cards: readonly Card[]): number {
  const base = handScore(cards, view.manilha);
  return Math.min(1, Math.max(0, base + roundsWon(view) * 0.25 - roundsLost(view) * 0.3));
}

/** A carta a jogar e se ela é só descarte (não vai ganhar a vaza): descarte pode ir encoberto. */
function chooseCard(view: TrucoView, playerId: string): { id: string; discard: boolean } {
  const hand = view.hand;
  // Mão de ferro: ninguém vê nada, joga a primeira.
  if (hand.some((h) => h.card === null)) return { id: hand[0]!.id, discard: false };
  const cards = hand.map((h) => h.card!);
  const strength = (c: Card) => trucoStrength(c, view.manilha);
  const sorted = [...cards].sort((a, b) => strength(a) - strength(b));
  const lowest = sorted[0]!;
  const highest = sorted[sorted.length - 1]!;
  const idOf = (c: Card) => `${c.rank}${c.suit}`;
  const keep = (c: Card) => ({ id: idOf(c), discard: false });
  const discard = (c: Card) => ({ id: idOf(c), discard: true });

  if (view.table.length === 0) {
    // Abrindo a primeira vaza com mão boa: guarda a maior e joga a do meio.
    if (view.rounds.length === 0 && sorted.length === 3) return keep(sorted[1]!);
    return keep(highest);
  }

  // Encoberta não ganha de nada.
  const onTable = (p: TrucoTableCard) => (p.covered || !p.card ? TRUCO_COVERED_STRENGTH : strength(p.card));
  const bestOnTable = view.table.reduce((best, p) => (onTable(p) > onTable(best) ? p : best));
  const best = onTable(bestOnTable);
  const myTeamId = view.seats.find((s) => s.id === playerId)?.team;
  const partnerWinning = best > TRUCO_COVERED_STRENGTH && view.seats.find((s) => s.id === bestOnTable.playerId)?.team === myTeamId;
  if (partnerWinning) return discard(lowest);

  // A menor carta que ganha a vaza; se nenhuma ganha, a menor de todas.
  const beats = sorted.find((c) => strength(c) > best);
  if (beats) return keep(beats);
  // Cangar a primeira vaza também serve quando dá.
  const ties = sorted.find((c) => strength(c) === best);
  if (ties && view.rounds.length === 0) return keep(ties);
  return discard(lowest);
}

export function chooseTrucoAction(view: TrucoView, playerId: string, rng: number): { action: TrucoAction; rng: number } {
  const roll = nextRandom(rng);
  const luck = roll.value;
  const cards = view.hand.flatMap((h) => (h.card ? [h.card] : []));
  const partners = view.partnerHands.map((h) => h.cards);

  // Regra da casa: 3 palhaços sem nenhuma manilha no meio é mão fraca; troca.
  if (view.legal.canSwap && !cards.some((c) => c.rank === view.manilha)) {
    return { action: { type: 'swap', playerId }, rng: roll.state };
  }

  if (view.phase === 'maoDeOnze') {
    const team = Math.max(handScore(cards, view.manilha), ...partners.map((c) => handScore(c, view.manilha)));
    const play = team > 0.42 || luck < 0.15;
    return { action: { type: play ? 'accept' : 'run', playerId }, rng: roll.state };
  }

  if (view.phase === 'truco' && view.legal.canAccept) {
    const c = confidence(view, cards);
    // Quanto mais alto o pedido, mais a mão precisa ser boa.
    const need = 0.38 + (view.request!.value / 12) * 0.2;
    if (view.legal.canRaise && c > need + 0.28 && luck < 0.7) return { action: { type: 'truco', playerId }, rng: roll.state };
    if (c >= need || luck < 0.12) return { action: { type: 'accept', playerId }, rng: roll.state };
    return { action: { type: 'run', playerId }, rng: roll.state };
  }

  if (view.legal.canAskTruco) {
    const c = confidence(view, cards);
    const bluff = luck < 0.07;
    if ((c > 0.68 && luck < 0.6) || bluff) return { action: { type: 'truco', playerId }, rng: roll.state };
  }

  const pick = chooseCard(view, playerId);
  // Descarte vai encoberto às vezes: não entrega pro adversário o que sobrou na mão.
  const covered = pick.discard && view.legal.canCover && luck < 0.5;
  return { action: { type: 'play', playerId, cardId: pick.id, ...(covered ? { covered: true } : {}) }, rng: roll.state };
}
