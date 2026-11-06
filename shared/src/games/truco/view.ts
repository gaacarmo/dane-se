import { type Card, type Rank } from '../danese/cards.js';
import {
  type TrucoGameState,
  type TrucoHandResult,
  type TrucoPhase,
  type TrucoPlayedCard,
  type TrucoRequest,
  type TrucoRoundRecord,
  type TrucoSpecialHand,
  canAskTruco,
  canDecideOnze,
  canRaiseTruco,
  hiddenCardId,
  trucoActorId,
} from './game.js';
import { type TrucoSettings, type TrucoTeam, nextTrucoValue } from './rules.js';

export interface TrucoSeatView {
  id: string;
  name: string;
  team: TrucoTeam;
  /** Quantas cartas ainda tem na mão. */
  cardCount: number;
  isDealer: boolean;
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
  table: TrucoPlayedCard[];
  rounds: TrucoRoundRecord[];
  hand: TrucoHandCard[];
  /** Mão de onze: as cartas do parceiro, que a dupla com 11 pode ver. */
  partnerHand: { playerId: string; cards: Card[] } | null;
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
};

export function getTrucoView(state: TrucoGameState, viewerId: string | null): TrucoView {
  const me = state.players.find((p) => p.id === viewerId);
  const myTeam: TrucoTeam = me?.team ?? 0;
  const dealerId = state.players[state.dealerIndex]?.id;

  const ownHand = me ? (state.hands[me.id] ?? []) : [];
  const hand: TrucoHandCard[] =
    state.special === 'ferro'
      ? ownHand.map((_, i) => ({ id: hiddenCardId(i), card: null }))
      : ownHand.map((c) => ({ id: `${c.rank}${c.suit}`, card: c }));

  let partnerHand: TrucoView['partnerHand'] = null;
  if (me && state.special === 'onze' && state.players.length === 4 && state.scores[me.team] === 11) {
    const partner = state.players.find((p) => p.team === me.team && p.id !== me.id);
    if (partner) partnerHand = { playerId: partner.id, cards: [...(state.hands[partner.id] ?? [])] };
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
    })),
    vira: state.vira,
    manilha: state.manilha,
    value: state.value,
    special: state.special,
    request: state.request,
    actorId: trucoActorId(state),
    turnPlayerId: state.turnPlayerId,
    table: [...state.table],
    rounds: state.rounds.map((r) => ({ cards: [...r.cards], result: r.result })),
    hand,
    partnerHand,
    onzeDeciderId: state.onzeDeciderId,
    legal,
    lastHand: state.lastHand,
    winnerTeam: state.winnerTeam,
  };
}
