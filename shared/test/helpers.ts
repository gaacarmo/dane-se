import {
  type Card,
  type GameAction,
  type GameState,
  applyAction,
  cardId,
  createGame,
  legalBets,
  manilhaRankFor,
  parseCardId,
} from '../src/index.js';

export function c(id: string): Card {
  const card = parseCardId(id);
  if (!card) throw new Error(`Bad card id ${id}`);
  return card;
}

export function newGame(playerCount: number, seed = 1): GameState {
  const players = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const result = createGame(players, seed);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Replaces the dealt cards with known ones (keeps everything else). */
export function rig(state: GameState, hands: Record<string, string[]>, vira: string): GameState {
  const viraCard = c(vira);
  return {
    ...state,
    vira: viraCard,
    manilhaRank: manilhaRankFor(viraCard),
    hands: Object.fromEntries(Object.entries(hands).map(([id, cards]) => [id, cards.map(c)])),
  };
}

export function act(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${action.type} failed: ${result.error}`);
  return result.state;
}

/** Places bets in turn order. */
export function betAll(state: GameState, bets: Record<string, number>): GameState {
  let s = state;
  while (s.phase === 'betting') {
    const id = s.turnPlayerId!;
    s = act(s, { type: 'bet', playerId: id, bet: bets[id]! });
  }
  return s;
}

/** Plays one trick: each player plays the given card, in turn order. */
export function playTrick(state: GameState, cards: Record<string, string>): GameState {
  let s = state;
  while (s.phase === 'playing') {
    const id = s.turnPlayerId!;
    s = act(s, { type: 'play', playerId: id, cardId: cards[id]! });
  }
  return s;
}

/** Finishes the current round with the first legal bet and first card for everyone. */
export function autoPlayRound(state: GameState): GameState {
  let s = state;
  while (s.phase === 'betting' || s.phase === 'playing' || s.phase === 'trickEnd') {
    const id = s.turnPlayerId!;
    if (s.phase === 'betting') s = act(s, { type: 'bet', playerId: id, bet: legalBets(s, id)[0]! });
    else if (s.phase === 'playing') s = act(s, { type: 'play', playerId: id, cardId: cardId(s.hands[id]![0]!) });
    else s = act(s, { type: 'collectTrick' });
  }
  return s;
}
