import { type BingoGameState, type BingoPhase, canClaim, drawnSet } from './game.js';
import { type BingoSettings, completedLines, missingCount } from './rules.js';

export interface BingoSeatView {
  id: string;
  name: string;
  /** Quantos números faltam pra cartela cheia (a cartela em si é segredo de cada um). */
  missing: number;
}

export interface BingoView {
  viewerId: string | null;
  isSpectator: boolean;
  settings: BingoSettings;
  phase: BingoPhase;
  /** Sua cartela (25 números, linha a linha; 0 é o centro livre). Vazia pra espectadores. */
  card: number[];
  /** As linhas completas da sua cartela, pra destacar. */
  myLines: number[][];
  drawn: number[];
  lastBall: number | null;
  ballsLeft: number;
  seats: BingoSeatView[];
  lineWinnerId: string | null;
  bingoWinnerId: string | null;
  legal: { canClaimLine: boolean; canClaimBingo: boolean };
  /** No fim, a cartela de quem ganhou o Bingo (pra todo mundo conferir). */
  winnerCard: number[] | null;
}

export function getBingoView(state: BingoGameState, viewerId: string | null): BingoView {
  const drawn = drawnSet(state);
  const me = state.players.find((p) => p.id === viewerId);
  const card = me ? [...state.cards[me.id]!] : [];
  return {
    viewerId,
    isSpectator: !me,
    settings: state.settings,
    phase: state.phase,
    card,
    myLines: me ? completedLines(card, drawn) : [],
    drawn: [...state.drawn],
    lastBall: state.drawn.at(-1) ?? null,
    ballsLeft: state.pool.length,
    seats: state.players.map((p) => ({ id: p.id, name: p.name, missing: missingCount(state.cards[p.id]!, drawn) })),
    lineWinnerId: state.lineWinnerId,
    bingoWinnerId: state.bingoWinnerId,
    legal: {
      canClaimLine: !!me && canClaim(state, me.id, 'line'),
      canClaimBingo: !!me && canClaim(state, me.id, 'bingo'),
    },
    winnerCard: state.phase === 'gameOver' && state.bingoWinnerId ? [...state.cards[state.bingoWinnerId]!] : null,
  };
}
