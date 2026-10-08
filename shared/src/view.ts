import type { Card, Rank } from './cards.js';
import {
  type GameState,
  type Phase,
  type RoundSummary,
  type Trick,
  isBlindRound,
  legalBets,
  otherBetsSum,
} from './game.js';
import { type GameSettings, forbiddenDealerBet } from './rules.js';

export interface PublicPlayer {
  id: string;
  name: string;
  letters: number;
  eliminated: boolean;
  eliminatedInRound: number | null;
  isDealer: boolean;
  bet: number | null;
  tricksWon: number;
  cardCount: number;
  /** Blind round only: the card on this player's forehead. Always null for the viewer's own seat. */
  foreheadCard: Card | null;
}

/**
 * Everything one client is allowed to know. This is the ONLY game data the
 * server sends to clients, so hidden information is filtered here.
 */
export interface PlayerView {
  viewerId: string | null;
  isSpectator: boolean;
  settings: GameSettings;
  lives: number;
  phase: Phase;
  roundNumber: number;
  cardsPerPlayer: number;
  blindRound: boolean;
  dealerId: string;
  turnPlayerId: string | null;
  vira: Card;
  manilhaRank: Rank;
  players: PublicPlayer[];
  /** The viewer's own cards. Empty in the blind round (they can't see their own card). */
  hand: Card[];
  betsSum: number;
  /** Bets the viewer may place right now (empty if it's not their turn to bet). */
  legalBets: number[];
  /** When it's the Pé's turn to bet: the number they can't choose. */
  dealerForbiddenBet: number | null;
  trick: Trick;
  tricksPlayed: number;
  lastRound: RoundSummary | null;
  winnerId: string | null;
}

export function getPlayerView(state: GameState, viewerId: string | null): PlayerView {
  const blind = isBlindRound(state);
  const viewer = state.players.find((p) => p.id === viewerId);
  const playsThisRound = viewer && !viewer.eliminated && state.roundOrder.includes(viewer.id);

  const players = state.players.map((p): PublicPlayer => {
    const hand = state.hands[p.id] ?? [];
    const inRound = state.roundOrder.includes(p.id);
    return {
      id: p.id,
      name: p.name,
      letters: p.letters,
      eliminated: p.eliminated,
      eliminatedInRound: p.eliminatedInRound,
      isDealer: p.id === state.dealerId,
      bet: state.bets[p.id] ?? null,
      tricksWon: inRound ? (state.tricksWon[p.id] ?? 0) : 0,
      cardCount: inRound ? hand.length : 0,
      foreheadCard: blind && p.id !== viewerId && hand[0] ? { ...hand[0] } : null,
    };
  });

  const dealerTurnToBet = state.phase === 'betting' && state.turnPlayerId === state.dealerId;

  return {
    viewerId: viewerId,
    isSpectator: !playsThisRound,
    settings: state.settings,
    lives: state.lives,
    phase: state.phase,
    roundNumber: state.roundNumber,
    cardsPerPlayer: state.cardsPerPlayer,
    blindRound: blind,
    dealerId: state.dealerId,
    turnPlayerId: state.turnPlayerId,
    vira: state.vira,
    manilhaRank: state.manilhaRank,
    players,
    hand: playsThisRound && !blind ? (state.hands[viewer.id] ?? []).map((c) => ({ ...c })) : [],
    betsSum: Object.values(state.bets).reduce((a, b) => a + b, 0),
    legalBets: viewerId ? legalBets(state, viewerId) : [],
    dealerForbiddenBet: dealerTurnToBet
      ? forbiddenDealerBet(state.cardsPerPlayer, otherBetsSum(state, state.dealerId))
      : null,
    trick: state.trick,
    tricksPlayed: state.completedTricks.length,
    lastRound: state.lastRound,
    winnerId: state.winnerId,
  };
}
