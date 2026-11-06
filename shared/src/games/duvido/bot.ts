import { nextRandom } from '../../rng.js';
import { type Card, cardId } from '../danese/cards.js';
import { type DuvidoAction } from './game.js';
import { cardCounts } from './rules.js';
import { type DuvidoView } from './view.js';

/** Cartas que "valem" em toda a mesa: 4 do valor da rodada + 4 manilhas. */
const TRUE_CARDS = 8;

/**
 * Bot de Duvido. Só usa o que a própria visão mostra: a mão dele, quantas cartas
 * cada um jogou e quantas balas cada um tem. Joga a verdade quando pode, blefa
 * com uma carta quando não pode, e duvida mais de jogadas grandes, de mesas
 * cheias de "valores" e quando a conta não fecha.
 */
export function chooseDuvidoAction(view: DuvidoView, playerId: string, rng: number): { action: DuvidoAction; rng: number } {
  let s = rng;
  const roll = () => {
    const r = nextRandom(s);
    s = r.state;
    return r.value;
  };

  const counts = (c: Card) => cardCounts(c, view.value, view.manilha);
  const trues = view.hand.filter(counts);
  const lies = view.hand.filter((c) => !counts(c));
  const me = view.seats.find((x) => x.id === playerId)!;

  if (view.legal.canDoubt) {
    if (!view.legal.canPlay) return { action: { type: 'doubt', playerId }, rng: s };
    const last = view.lastPlay!;
    const claimed = view.pile.reduce((sum, p) => sum + p.count, 0);
    // A conta não fecha: tem mais "valores" na mesa do que existem fora da minha mão.
    if (claimed + trues.length > TRUE_CARDS) return { action: { type: 'doubt', playerId }, rng: s };
    const lastSeat = view.seats.find((x) => x.id === last.playerId);
    let suspicion = 0.18 + 0.14 * (last.count - 1) + 0.07 * Math.max(0, claimed - 3);
    if (lastSeat && lastSeat.cardCount === 0) suspicion += 0.12; // largou a mão inteira
    if (trues.length === 0) suspicion += 0.12; // eu teria que blefar de qualquer jeito
    // Com poucas balas, duvidar errado dói mais: fica mais cauteloso.
    if (me.candies <= 2) suspicion -= 0.1;
    if (roll() < suspicion) return { action: { type: 'doubt', playerId }, rng: s };
  }

  // Joga a verdade quando tem; às vezes mistura um blefe junto.
  if (trues.length > 0) {
    const n = Math.min(trues.length, roll() < 0.5 ? 1 : 2);
    const cards = trues.slice(0, n);
    if (lies.length > 0 && cards.length < 3 && roll() < 0.15) cards.push(lies[0]!);
    return { action: { type: 'play', playerId, cardIds: cards.map(cardId) }, rng: s };
  }
  // Sem nada que valha: blefa com uma carta.
  return { action: { type: 'play', playerId, cardIds: [cardId(view.hand[0]!)] }, rng: s };
}
