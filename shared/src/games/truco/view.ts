import { type Card, type Rank } from '../danese/cards.js';
import {
  type TrucoGameState,
  type TrucoHandResult,
  type TrucoPhase,
  type TrucoPlayedCard,
  type TrucoRequest,
  type TrucoSpecialHand,
  canAskTruco,
  canCoverCard,
  canDecideOnze,
  canSwapPalhacos,
  canRaiseTruco,
  hiddenCardId,
  trucoActorId,
} from './game.js';
import { type TrucoRoundResult as RoundResult, type TrucoSettings, type TrucoTeam, nextTrucoValue } from './rules.js';

/**
 * Uma carta na mesa como o cliente vê. A encoberta só mostra a carta pra quem
 * jogou; pros outros `card` vem null.
 */
export interface TrucoTableCard {
  playerId: string;
  card: Card | null;
  covered?: boolean;
}

export interface TrucoRoundView {
  cards: TrucoTableCard[];
  result: RoundResult;
}

export interface TrucoSeatView {
  id: string;
  name: string;
  team: TrucoTeam;
  /** Quantas cartas ainda tem na mão. */
  cardCount: number;
  isDealer: boolean;
  /** Regra da casa: trocou os 3 palhaços nesta mão. */
  swapped: boolean;
}

/** Uma carta na sua mão. Na mão de ferro ela vem virada (`card` null) e o id é a posição. */
export interface TrucoHandCard {
  id: string;
  card: Card | null;
}

export interface TrucoLegalView {
  canPlay: boolean;
  canAskTruco: boolean;
  /** Valor que o próximo pedido/aumento propõe (null quando já vale 12). */
  nextValue: number | null;
  canAccept: boolean;
  canRun: boolean;
  canRaise: boolean;
  /** Regra da casa: tem 3 palhaços e ainda pode trocar. */
  canSwap: boolean;
  /** Pode jogar uma carta encoberta (da segunda vaza em diante, na sua vez). */
  canCover: boolean;
}

/** Tudo que um cliente pode saber sobre a mesa de truco. */
export interface TrucoView {
  viewerId: string | null;
  isSpectator: boolean;
  settings: TrucoSettings;
  phase: TrucoPhase;
  handNumber: number;
  scores: [number, number];
  /** Dupla do jogador (0 para espectadores). */
  myTeam: TrucoTeam;
  seats: TrucoSeatView[];
  vira: Card;
  manilha: Rank;
  value: number;
  special: TrucoSpecialHand;
  request: TrucoRequest | null;
  actorId: string | null;
  turnPlayerId: string;
  table: TrucoTableCard[];
  rounds: TrucoRoundView[];
  hand: TrucoHandCard[];
  /** Mão de onze: as cartas dos parceiros, que o time com 11 pode ver (1 com 4 jogadores, 2 com 6). */
  partnerHands: { playerId: string; cards: Card[] }[];
  onzeDeciderId: string | null;
  legal: TrucoLegalView;
  lastHand: TrucoHandResult | null;
  winnerTeam: TrucoTeam | null;
}

const NO_LEGAL: TrucoLegalView = {
  canPlay: false,
  canAskTruco: false,
  nextValue: null,
  canAccept: false,
  canRun: false,
  canRaise: false,
  canSwap: false,
  canCover: false,
};

/** Esconde a carta encoberta de quem não jogou. */
function tableCard(p: TrucoPlayedCard, viewerId: string | null): TrucoTableCard {
  if (!p.covered) return { playerId: p.playerId, card: p.card };
  return { playerId: p.playerId, card: p.playerId === viewerId ? p.card : null, covered: true };
}

export function getTrucoView(state: TrucoGameState, viewerId: string | null): TrucoView {
  const me = state.players.find((p) => p.id === viewerId);
  const myTeam: TrucoTeam = me?.team ?? 0;
  const dealerId = state.players[state.dealerIndex]?.id;

  const ownHand = me ? (state.hands[me.id] ?? []) : [];
  const hand: TrucoHandCard[] =
    state.special === 'ferro'
      ? ownHand.map((_, i) => ({ id: hiddenCardId(i), card: null }))
      : ownHand.map((c) => ({ id: `${c.rank}${c.suit}`, card: c }));

  let partnerHands: TrucoView['partnerHands'] = [];
  if (me && state.special === 'onze' && state.scores[me.team] === 11) {
    partnerHands = state.players
      .filter((p) => p.team === me.team && p.id !== me.id)
      .map((p) => ({ playerId: p.id, cards: [...(state.hands[p.id] ?? [])] }));
  }

  let legal = NO_LEGAL;
  if (me) {
    const id = me.id;
    const inTruco = state.phase === 'truco' && state.request?.responderId === id;
    const inOnze = canDecideOnze(state, id);
    legal = {
      canPlay: state.phase === 'playing' && state.turnPlayerId === id,
      canAskTruco: canAskTruco(state, id),
      nextValue: inTruco ? nextTrucoValue(state.request!.value) : nextTrucoValue(state.value),
      canAccept: inTruco || inOnze,
      canRun: inTruco || inOnze,
      canRaise: canRaiseTruco(state, id),
      canSwap: canSwapPalhacos(state, id),
      canCover: canCoverCard(state, id),
    };
  }

  return {
    viewerId,
    isSpectator: !me,
    settings: state.settings,
    phase: state.phase,
    handNumber: state.handNumber,
    scores: [...state.scores],
    myTeam,
    seats: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      cardCount: state.hands[p.id]?.length ?? 0,
      isDealer: p.id === dealerId,
      swapped: state.swapped.includes(p.id),
    })),
    vira: state.vira,
    manilha: state.manilha,
    value: state.value,
    special: state.special,
    request: state.request,
    actorId: trucoActorId(state),
    turnPlayerId: state.turnPlayerId,
    table: state.table.map((p) => tableCard(p, viewerId)),
    rounds: state.rounds.map((r) => ({ cards: r.cards.map((p) => tableCard(p, viewerId)), result: r.result })),
    hand,
    partnerHands,
    onzeDeciderId: state.onzeDeciderId,
    legal,
    lastHand: state.lastHand,
    winnerTeam: state.winnerTeam,
  };
}
