import { describe, expect, it } from 'vitest';
import { type GameState, cardId, chooseBotBet, chooseBotCard, getPlayerView } from '../src/index.js';
import { act, newGame, rig } from './helpers.js';

function botStep(s: GameState): GameState {
  if (s.phase === 'trickEnd') return act(s, { type: 'collectTrick' });
  if (s.phase === 'roundSummary') return act(s, { type: 'nextRound' });
  const id = s.turnPlayerId!;
  const view = getPlayerView(s, id);
  if (s.phase === 'betting') return act(s, { type: 'bet', playerId: id, bet: chooseBotBet(view) });
  const chosen = chooseBotCard(view) ?? cardId(s.hands[id]![0]!); // blind round: forehead card
  return act(s, { type: 'play', playerId: id, cardId: chosen });
}

describe('bot', () => {
  it.each([2, 4, 6])('plays full %i-player games using only its own view', (players) => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = newGame(players, seed);
      for (let i = 0; i < 50_000 && s.phase !== 'gameOver'; i++) s = botStep(s);
      expect(s.phase).toBe('gameOver');
    }
  });

  it('bets on manilhas and high cards', () => {
    let s = { ...newGame(2, 3), cardsPerPlayer: 3 };
    const [a, pe] = s.roundOrder as [string, string];
    s = rig(s, { [a]: ['5C', '5H', '3D'], [pe]: ['4D', '6S', '7H'] }, '4S'); // manilha 5
    expect(chooseBotBet(getPlayerView(s, a))).toBe(2); // 0.99 + 0.91 + 0.55
  });

  it('plays the cheapest winning card when it still needs tricks', () => {
    let s = { ...newGame(2, 3), cardsPerPlayer: 3 };
    const [a, pe] = s.roundOrder as [string, string];
    s = rig(s, { [a]: ['7D', 'KH', '6S'], [pe]: ['QC', '3H', '2D'] }, '4S');
    s = act(act(s, { type: 'bet', playerId: a, bet: 0 }), { type: 'bet', playerId: pe, bet: 1 });
    s = act(s, { type: 'play', playerId: a, cardId: '7D' });
    expect(chooseBotCard(getPlayerView(s, pe))).toBe('QC');
  });

  it('dumps the strongest losing card when it already has enough', () => {
    let s = { ...newGame(2, 3), cardsPerPlayer: 3 };
    const [a, pe] = s.roundOrder as [string, string];
    s = rig(s, { [a]: ['3D', 'KH', '6S'], [pe]: ['QC', 'JH', '2D'] }, '4S');
    s = act(act(s, { type: 'bet', playerId: a, bet: 1 }), { type: 'bet', playerId: pe, bet: 0 });
    s = act(s, { type: 'play', playerId: a, cardId: '3D' });
    expect(chooseBotCard(getPlayerView(s, pe))).toBe('2D');
  });
});
