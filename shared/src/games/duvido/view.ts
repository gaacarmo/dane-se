import { type Card, type Rank } from '../danese/cards.js';
import {
  type DuvidoGameState,
  type DuvidoPhase,
  type DuvidoReveal,
  canDoubt,
  canPlayCards,
  duvidoActorId,
  lastPlay,
} from './game.js';
import { DUVIDO_MAX_PLAY, type DuvidoSettings } from './rules.js';

export interface DuvidoSeatView {
  id: string;
  name: string;
  /** Cartas na mão (só a quantidade: o resto é segredo). */
  cardCount: number;
  /** Balas no pote: a chance de pegar a apimentada no próximo castigo é 1 em `candies`. */
  candies: number;
  out: boolean;
}

/** Uma jogada como a mesa vê: quem jogou e quantas cartas (viradas). */
export interface DuvidoPileView {
  playerId: string;
  count: number;
}

export interface DuvidoView {
  viewerId: string | null;
  isSpectator: boolean;
  settings: DuvidoSettings;
  phase: DuvidoPhase;
  round: number;
  vira: Card;
  value: Rank;
  manilha: Rank;
  seats: DuvidoSeatView[];
  /** As jogadas da rodada, viradas pra baixo. */
  pile: DuvidoPileView[];
  /** A jogada que pode ser duvidada agora. */
  lastPlay: DuvidoPileView | null;
  turnPlayerId: string;
  actorId: string | null;
  /** Sua mão (vazia pra espectadores). */
  hand: Card[];
  legal: { canPlay: boolean; maxCards: number; canDoubt: boolean };
  /** Depois de um "Duvido!": as cartas desviradas e o castigo. */
  reveal: DuvidoReveal | null;
  /** Quem saiu, em ordem. */
  outOrder: string[];
  winnerId: string | null;
}

export function getDuvidoView(state: DuvidoGameState, viewerId: string | null): DuvidoView {
  const me = state.players.find((p) => p.id === viewerId);
  const hand = me && !me.out ? [...(state.hands[me.id] ?? [])] : [];
  const last = lastPlay(state);
  const canPlay = !!me && canPlayCards(state, me.id);
  return {
    viewerId,
    isSpectator: !me,
    settings: state.settings,
    phase: state.phase,
    round: state.round,
    vira: state.vira,
    value: state.value,
    manilha: state.manilha,
    seats: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: p.out ? 0 : (state.hands[p.id]?.length ?? 0),
      candies: p.candies,
      out: p.out,
    })),
    pile: state.pile.map((pl) => ({ playerId: pl.playerId, count: pl.cards.length })),
    lastPlay: last ? { playerId: last.playerId, count: last.cards.length } : null,
    turnPlayerId: state.turnPlayerId,
    actorId: duvidoActorId(state),
    hand,
    legal: {
      canPlay,
      maxCards: canPlay ? Math.min(DUVIDO_MAX_PLAY, hand.length) : 0,
      canDoubt: !!me && canDoubt(state, me.id),
    },
    reveal: state.reveal,
    outOrder: [...state.outOrder],
    winnerId: state.winnerId,
  };
}
