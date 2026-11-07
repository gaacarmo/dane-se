import { shuffle } from '../../rng.js';
import {
  BINGO_BALLS,
  BINGO_MAX_PLAYERS,
  BINGO_MIN_PLAYERS,
  type BingoSettings,
  hasLine,
  isFull,
  makeCard,
} from './rules.js';

export interface BingoPlayer {
  id: string;
  name: string;
  /** Bots cantam sozinhos, uma bola depois de completar (os humanos têm essa vantagem). */
  isBot?: boolean;
}

export type BingoPrize = 'line' | 'bingo';

export type BingoPhase = 'playing' | 'gameOver';

export interface BingoGameState {
  settings: BingoSettings;
  players: BingoPlayer[];
  rng: number;
  cards: Record<string, number[]>;
  /** Bolas já sorteadas, na ordem. */
  drawn: number[];
  /** Bolas que ainda vão sair, já embaralhadas. */
  pool: number[];
  lineWinnerId: string | null;
  bingoWinnerId: string | null;
  phase: BingoPhase;
}

export type BingoAction =
  | { type: 'draw' }
  /** Cantar "Linha!" ou "Bingo!": só vale se a cartela tiver mesmo. */
  | { type: 'claim'; playerId: string; prize: BingoPrize };

export type BingoError = 'WRONG_PHASE' | 'UNKNOWN_PLAYER' | 'INVALID_PLAYER_COUNT' | 'INVALID_ACTION';

export type BingoResult = { ok: true; state: BingoGameState } | { ok: false; error: BingoError };

const ok = (state: BingoGameState): BingoResult => ({ ok: true, state });
const fail = (error: BingoError): BingoResult => ({ ok: false, error });

export function drawnSet(state: BingoGameState): Set<number> {
  return new Set(state.drawn);
}

export function createBingoGame(
  players: readonly { id: string; name: string; isBot?: boolean }[],
  seed: number,
  settings: BingoSettings,
): BingoResult {
  if (players.length < BINGO_MIN_PLAYERS || players.length > BINGO_MAX_PLAYERS) return fail('INVALID_PLAYER_COUNT');
  let rng = seed | 0;
  const cards: Record<string, number[]> = {};
  for (const p of players) {
    const made = makeCard(rng);
    rng = made.rng;
    cards[p.id] = made.card;
  }
  const balls = shuffle(
    Array.from({ length: BINGO_BALLS }, (_, i) => i + 1),
    rng,
  );
  return ok({
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name, ...(p.isBot ? { isBot: true } : {}) })),
    rng: balls.state,
    cards,
    drawn: [],
    pool: balls.items,
    lineWinnerId: null,
    bingoWinnerId: null,
    phase: 'playing',
  });
}

/** O jogador pode cantar esse prêmio agora? (prêmio em aberto e a cartela tem o padrão) */
export function canClaim(state: BingoGameState, playerId: string, prize: BingoPrize): boolean {
  if (state.phase !== 'playing') return false;
  const card = state.cards[playerId];
  if (!card) return false;
  const drawn = drawnSet(state);
  if (prize === 'bingo') return state.bingoWinnerId === null && isFull(card, drawn);
  return state.lineWinnerId === null && hasLine(card, drawn);
}

function award(state: BingoGameState, playerId: string, prize: BingoPrize): BingoGameState {
  if (prize === 'line') return { ...state, lineWinnerId: playerId };
  // Cartela cheia tem linha: se a Linha ainda estava em aberto, leva as duas.
  return {
    ...state,
    bingoWinnerId: playerId,
    lineWinnerId: state.lineWinnerId ?? playerId,
    phase: 'gameOver',
  };
}

/** Quem pode cantar (na ordem dos lugares), sem esperar ninguém apertar botão. */
function autoClaims(state: BingoGameState, who: (p: BingoPlayer) => boolean): BingoGameState {
  let s = state;
  for (const p of s.players) {
    if (!who(p) || s.phase !== 'playing') continue;
    if (canClaim(s, p.id, 'bingo')) s = award(s, p.id, 'bingo');
    else if (canClaim(s, p.id, 'line')) s = award(s, p.id, 'line');
  }
  return s;
}

function draw(state: BingoGameState): BingoResult {
  if (state.phase !== 'playing') return fail('WRONG_PHASE');
  // Os bots cantam o que completaram na bola anterior.
  let s = autoClaims(state, (p) => !!p.isBot);
  if (s.phase !== 'playing') return ok(s);
  if (s.pool.length === 0) {
    // Acabaram as bolas e ninguém cantou: o juiz confere as cartelas.
    s = autoClaims(s, () => true);
    return ok(s);
  }
  return ok({ ...s, drawn: [...s.drawn, s.pool[0]!], pool: s.pool.slice(1) });
}

function claim(state: BingoGameState, playerId: string, prize: BingoPrize): BingoResult {
  if (state.phase !== 'playing') return fail('WRONG_PHASE');
  if (!state.players.some((p) => p.id === playerId)) return fail('UNKNOWN_PLAYER');
  if (prize !== 'line' && prize !== 'bingo') return fail('INVALID_ACTION');
  if (!canClaim(state, playerId, prize)) return fail('INVALID_ACTION');
  return ok(award(state, playerId, prize));
}

export function applyBingoAction(state: BingoGameState, action: BingoAction): BingoResult {
  switch (action.type) {
    case 'draw':
      return draw(state);
    case 'claim':
      return claim(state, action.playerId, action.prize);
    default:
      return fail('INVALID_ACTION');
  }
}
