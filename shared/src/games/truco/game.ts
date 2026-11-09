import { shuffle } from '../../rng.js';
import { type Card, type Rank, cardId, createDeck } from '../danese/cards.js';
import {
  TRUCO_COVERED_STRENGTH,
  TRUCO_ONZE,
  TRUCO_ONZE_VALUE,
  TRUCO_PLAYER_COUNTS,
  TRUCO_TARGET,
  type TrucoRoundResult,
  type TrucoSettings,
  type TrucoTeam,
  nextTrucoValue,
  otherTeam,
  teamOfSeat,
  trucoHandWinner,
  trucoManilha,
  trucoStrength,
} from './rules.js';

export interface TrucoPlayer {
  id: string;
  name: string;
  team: TrucoTeam;
  /** Bot posto pelo anfitrião: na mão de onze, quem decide é um humano da dupla, se houver. */
  isBot?: boolean;
}

export interface TrucoPlayedCard {
  playerId: string;
  card: Card;
  /**
   * Jogada encoberta (escondida): vale menos que qualquer carta e ninguém além de
   * quem jogou vê qual era. Só a partir da segunda vaza.
   */
  covered?: boolean;
}

/** Um pedido de truco (ou aumento) esperando resposta da outra dupla. */
export interface TrucoRequest {
  byPlayerId: string;
  byTeam: TrucoTeam;
  /** Quanto a mão passa a valer se aceitarem. */
  value: number;
  /** Quem responde: o adversário seguinte na ordem (ou quem pediu, num aumento). */
  responderId: string;
}

/**
 * - `playing`: alguém precisa jogar uma carta (ou pedir truco).
 * - `truco`: um pedido espera aceitar / correr / aumentar.
 * - `maoDeOnze`: a dupla com 11 decide se joga a mão.
 * - `roundEnd`: pausa curta pra todo mundo ver a vaza.
 * - `handEnd`: placar da mão antes da próxima.
 */
export type TrucoPhase = 'playing' | 'truco' | 'maoDeOnze' | 'roundEnd' | 'handEnd' | 'gameOver';

/** Mão normal, mão de onze (uma dupla com 11) ou mão de ferro (as duas com 11: cartas viradas). */
export type TrucoSpecialHand = 'none' | 'onze' | 'ferro';

export interface TrucoHandResult {
  /** Dupla que pontuou, ou null quando ninguém pontuou (tudo empatado). */
  team: TrucoTeam | null;
  points: number;
  reason: 'rounds' | 'run' | 'tie' | 'onzeRun';
  /** Quem correu (no `run` e no `onzeRun`). */
  ranPlayerId: string | null;
}

export interface TrucoRoundRecord {
  cards: TrucoPlayedCard[];
  result: TrucoRoundResult;
}

export interface TrucoGameState {
  settings: TrucoSettings;
  players: TrucoPlayer[];
  scores: [number, number];
  rng: number;
  handNumber: number;
  /** Assento do pé (quem deu as cartas). A mão começa pelo assento seguinte. */
  dealerIndex: number;
  vira: Card;
  manilha: Rank;
  hands: Record<string, Card[]>;
  /** O resto do baralho depois de dar as cartas e a vira (de onde saem as trocas). */
  stock: Card[];
  /** Regra da casa: quem trocou os 3 palhaços nesta mão. */
  swapped: string[];
  /** Cartas da vaza em andamento, na ordem jogada. */
  table: TrucoPlayedCard[];
  /** Vazas já fechadas nesta mão. */
  rounds: TrucoRoundRecord[];
  roundLeaderId: string;
  turnPlayerId: string;
  /** Quanto a mão vale agora. */
  value: number;
  /** Dupla que fez o último pedido aceito (só a outra pode aumentar). */
  lastRaiseTeam: TrucoTeam | null;
  request: TrucoRequest | null;
  special: TrucoSpecialHand;
  /**
   * Mão de onze: quem a mesa espera (um humano da dupla com 11, se houver). Os
   * dois parceiros podem responder; este é só quem o relógio e os bots seguem.
   */
  onzeDeciderId: string | null;
  phase: TrucoPhase;
  lastHand: TrucoHandResult | null;
  winnerTeam: TrucoTeam | null;
}

export type TrucoAction =
  | { type: 'play'; playerId: string; cardId: string; covered?: boolean }
  /** Pede truco na sua vez, ou aumenta quando é você quem responde. */
  | { type: 'truco'; playerId: string }
  /** Aceita o pedido (ou, na mão de onze, topa jogar). */
  | { type: 'accept'; playerId: string }
  /** Corre do pedido (ou, na mão de onze, entrega a mão). */
  | { type: 'run'; playerId: string }
  /** Regra da casa: troca 3 palhaços (Q, J, K) por 3 cartas novas do baralho. */
  | { type: 'swap'; playerId: string }
  | { type: 'collectRound' }
  | { type: 'nextHand' };

export type TrucoError =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_PLAYER_COUNT'
  | 'INVALID_ACTION'
  | 'ILLEGAL_RAISE';

export type TrucoResult = { ok: true; state: TrucoGameState } | { ok: false; error: TrucoError };

const ok = (state: TrucoGameState): TrucoResult => ({ ok: true, state });
const fail = (error: TrucoError): TrucoResult => ({ ok: false, error });

/** Id de uma carta escondida da mão de ferro: `X0`, `X1`, `X2` pela posição na mão. */
export function hiddenCardId(index: number): string {
  return `X${index}`;
}

function seatOf(state: TrucoGameState, playerId: string): number {
  return state.players.findIndex((p) => p.id === playerId);
}

function nextSeat(state: TrucoGameState, seat: number): number {
  return (seat + 1) % state.players.length;
}

function teamOf(state: TrucoGameState, playerId: string): TrucoTeam {
  return state.players[seatOf(state, playerId)]!.team;
}

/** O adversário seguinte na ordem de jogo, a partir de `playerId`. */
function nextOpponent(state: TrucoGameState, playerId: string): string {
  const team = teamOf(state, playerId);
  let seat = seatOf(state, playerId);
  for (let i = 0; i < state.players.length; i++) {
    seat = nextSeat(state, seat);
    if (state.players[seat]!.team !== team) return state.players[seat]!.id;
  }
  return playerId;
}

/** Dá as cartas para a mão seguinte, com o pé no assento `dealerIndex`. */
function deal(state: TrucoGameState, dealerIndex: number): TrucoGameState {
  const shuffled = shuffle(createDeck(), state.rng);
  const deck = shuffled.items;
  const hands: Record<string, Card[]> = {};
  const n = state.players.length;
  // A mão (assento depois do pé) recebe primeiro.
  for (let k = 0; k < n; k++) {
    const p = state.players[(dealerIndex + 1 + k) % n]!;
    hands[p.id] = deck.slice(k * 3, k * 3 + 3);
  }
  const vira = deck[n * 3]!;
  const leader = state.players[(dealerIndex + 1) % n]!.id;

  const at11: TrucoTeam[] = ([0, 1] as const).filter((t) => state.scores[t] === TRUCO_ONZE);
  const special = at11.length === 2 ? 'ferro' : at11.length === 1 ? 'onze' : 'none';
  let onzeDeciderId: string | null = null;
  if (special === 'onze') {
    // A dupla com 11, na ordem da mão; a mesa espera o primeiro humano dela.
    const team = Array.from({ length: n }, (_, k) => state.players[(dealerIndex + 1 + k) % n]!).filter((p) => p.team === at11[0]);
    onzeDeciderId = (team.find((p) => !p.isBot) ?? team[0])!.id;
  }

  return {
    ...state,
    rng: shuffled.state,
    handNumber: state.handNumber + 1,
    dealerIndex,
    vira,
    manilha: trucoManilha(vira),
    hands,
    stock: deck.slice(n * 3 + 1),
    swapped: [],
    table: [],
    rounds: [],
    roundLeaderId: leader,
    turnPlayerId: onzeDeciderId ?? leader,
    value: special === 'onze' ? TRUCO_ONZE_VALUE : 1,
    lastRaiseTeam: null,
    request: null,
    special,
    onzeDeciderId,
    phase: special === 'onze' ? 'maoDeOnze' : 'playing',
  };
}

export function createTrucoGame(
  players: readonly { id: string; name: string; isBot?: boolean }[],
  seed: number,
  settings: TrucoSettings,
): TrucoResult {
  if (!(TRUCO_PLAYER_COUNTS as readonly number[]).includes(players.length)) return fail('INVALID_PLAYER_COUNT');
  const base: TrucoGameState = {
    settings,
    players: players.map((p, seat) => ({ id: p.id, name: p.name, team: teamOfSeat(seat), ...(p.isBot ? { isBot: true } : {}) })),
    scores: [0, 0],
    rng: seed | 0,
    handNumber: 0,
    dealerIndex: 0,
    vira: { rank: '4', suit: 'D' },
    manilha: '5',
    hands: {},
    stock: [],
    swapped: [],
    table: [],
    rounds: [],
    roundLeaderId: players[0]!.id,
    turnPlayerId: players[0]!.id,
    value: 1,
    lastRaiseTeam: null,
    request: null,
    special: 'none',
    onzeDeciderId: null,
    phase: 'playing',
    lastHand: null,
    winnerTeam: null,
  };
  // O pé da primeira mão é o último assento: quem criou a sala começa jogando.
  return ok(deal(base, players.length - 1));
}

/** Soma os pontos da mão e decide se a partida acabou. */
function endHand(state: TrucoGameState, result: TrucoHandResult): TrucoGameState {
  const scores: [number, number] = [...state.scores];
  if (result.team !== null) scores[result.team] = Math.min(TRUCO_TARGET, scores[result.team] + result.points);
  const winner = scores[0] >= TRUCO_TARGET ? 0 : scores[1] >= TRUCO_TARGET ? 1 : null;
  return {
    ...state,
    scores,
    request: null,
    lastHand: result,
    winnerTeam: winner,
    phase: winner === null ? 'handEnd' : 'gameOver',
  };
}

/** Pode pedir truco agora? (sua vez de jogar, mão normal, sua dupla não fez o último pedido) */
export function canAskTruco(state: TrucoGameState, playerId: string): boolean {
  if (state.phase !== 'playing' || state.turnPlayerId !== playerId) return false;
  if (state.special !== 'none') return false;
  if (nextTrucoValue(state.value) === null) return false;
  return state.lastRaiseTeam !== teamOf(state, playerId);
}

/** Quem está respondendo um pedido pode aumentar? */
export function canRaiseTruco(state: TrucoGameState, playerId: string): boolean {
  if (state.phase !== 'truco' || !state.request || state.request.responderId !== playerId) return false;
  return nextTrucoValue(state.request.value) !== null;
}

function resolveCardId(state: TrucoGameState, playerId: string, rawId: string): Card | null {
  const hand = state.hands[playerId] ?? [];
  if (state.special === 'ferro' && /^X\d$/.test(rawId)) return hand[Number(rawId.slice(1))] ?? null;
  return hand.find((c) => cardId(c) === rawId) ?? null;
}

/**
 * Pode jogar encoberto? A partir da segunda vaza, na sua vez. Na mão de ferro não
 * (lá ninguém vê nem a própria carta).
 */
export function canCoverCard(state: TrucoGameState, playerId: string): boolean {
  return state.phase === 'playing' && state.turnPlayerId === playerId && state.rounds.length >= 1 && state.special !== 'ferro';
}

/** Força de uma carta na mesa: a encoberta perde pra todas. */
export function playedStrength(played: TrucoPlayedCard, manilha: Rank): number {
  return played.covered ? TRUCO_COVERED_STRENGTH : trucoStrength(played.card, manilha);
}

function play(state: TrucoGameState, playerId: string, rawId: string, covered = false): TrucoResult {
  if (state.phase !== 'playing') return fail('WRONG_PHASE');
  if (state.turnPlayerId !== playerId) return fail('NOT_YOUR_TURN');
  if (covered && !canCoverCard(state, playerId)) return fail('INVALID_ACTION');
  const card = resolveCardId(state, playerId, rawId);
  if (!card) return fail('CARD_NOT_IN_HAND');

  const hand = state.hands[playerId]!.filter((c) => c !== card);
  const table = [...state.table, covered ? { playerId, card, covered: true } : { playerId, card }];
  const next: TrucoGameState = { ...state, hands: { ...state.hands, [playerId]: hand }, table };
  if (table.length < state.players.length) {
    return ok({ ...next, turnPlayerId: state.players[nextSeat(state, seatOf(state, playerId))]!.id });
  }
  // Todo mundo jogou: pausa pra mostrar a vaza.
  return ok({ ...next, phase: 'roundEnd' });
}

/** Fecha a vaza da mesa e decide se a mão acabou. */
function collectRound(state: TrucoGameState): TrucoResult {
  if (state.phase !== 'roundEnd') return fail('WRONG_PHASE');
  let best = -Infinity;
  for (const p of state.table) best = Math.max(best, playedStrength(p, state.manilha));
  const top = state.table.filter((p) => playedStrength(p, state.manilha) === best);
  const topTeams = new Set(top.map((p) => teamOf(state, p.playerId)));
  const result: TrucoRoundResult = topTeams.size === 1 ? [...topTeams][0]! : 'tie';
  const rounds = [...state.rounds, { cards: state.table, result }];

  const winner = trucoHandWinner(rounds.map((r) => r.result));
  const next: TrucoGameState = { ...state, rounds, table: [] };
  if (winner !== undefined) {
    return ok(
      endHand(next, {
        team: winner,
        points: winner === null ? 0 : state.value,
        reason: winner === null ? 'tie' : 'rounds',
        ranPlayerId: null,
      }),
    );
  }
  // Quem jogou a maior carta (a primeira, se cangou) começa a próxima vaza.
  const leader = top[0]!.playerId;
  return ok({ ...next, phase: 'playing', roundLeaderId: leader, turnPlayerId: leader });
}

function askTruco(state: TrucoGameState, playerId: string): TrucoResult {
  if (state.phase === 'truco') return raise(state, playerId);
  if (state.phase !== 'playing') return fail('WRONG_PHASE');
  if (state.turnPlayerId !== playerId) return fail('NOT_YOUR_TURN');
  if (!canAskTruco(state, playerId)) return fail('ILLEGAL_RAISE');
  const value = nextTrucoValue(state.value)!;
  return ok({
    ...state,
    phase: 'truco',
    request: { byPlayerId: playerId, byTeam: teamOf(state, playerId), value, responderId: nextOpponent(state, playerId) },
  });
}

/** Quem responde aceita o pedido atual e já devolve um aumento. */
function raise(state: TrucoGameState, playerId: string): TrucoResult {
  const request = state.request!;
  if (request.responderId !== playerId) return fail('NOT_YOUR_TURN');
  const value = nextTrucoValue(request.value);
  if (value === null) return fail('ILLEGAL_RAISE');
  return ok({
    ...state,
    value: request.value,
    lastRaiseTeam: request.byTeam,
    request: { byPlayerId: playerId, byTeam: teamOf(state, playerId), value, responderId: request.byPlayerId },
  });
}

/** Mão de onze: qualquer um da dupla com 11 pode decidir (eles veem as cartas um do outro). */
export function canDecideOnze(state: TrucoGameState, playerId: string): boolean {
  if (state.phase !== 'maoDeOnze' || !state.onzeDeciderId) return false;
  const me = state.players.find((p) => p.id === playerId);
  return !!me && me.team === teamOf(state, state.onzeDeciderId);
}

function accept(state: TrucoGameState, playerId: string): TrucoResult {
  if (state.phase === 'maoDeOnze') {
    if (!canDecideOnze(state, playerId)) return fail('NOT_YOUR_TURN');
    return ok({ ...state, phase: 'playing', turnPlayerId: state.roundLeaderId });
  }
  if (state.phase !== 'truco' || !state.request) return fail('WRONG_PHASE');
  if (state.request.responderId !== playerId) return fail('NOT_YOUR_TURN');
  // O jogo volta pra quem estava na vez (que continua precisando jogar uma carta).
  return ok({ ...state, phase: 'playing', value: state.request.value, lastRaiseTeam: state.request.byTeam, request: null });
}

function run(state: TrucoGameState, playerId: string): TrucoResult {
  if (state.phase === 'maoDeOnze') {
    if (!canDecideOnze(state, playerId)) return fail('NOT_YOUR_TURN');
    return ok(endHand(state, { team: otherTeam(teamOf(state, playerId)), points: 1, reason: 'onzeRun', ranPlayerId: playerId }));
  }
  if (state.phase !== 'truco' || !state.request) return fail('WRONG_PHASE');
  if (state.request.responderId !== playerId) return fail('NOT_YOUR_TURN');
  // Correu: quem pediu leva o que a mão valia antes do pedido.
  return ok(endHand(state, { team: state.request.byTeam, points: state.value, reason: 'run', ranPlayerId: playerId }));
}

/** Palhaços: as figuras do baralho (Dama, Valete e Rei), seja qual for o naipe. */
const PALHACOS: readonly Card['rank'][] = ['Q', 'J', 'K'];

/**
 * Regra da casa: com os 3 palhaços na mão (qualquer mistura de Q, J e K), dá
 * pra trocar as 3 cartas por outras do baralho, enquanto ainda não jogou
 * nenhuma nesta mão. Na mão de ferro não (ninguém vê as próprias cartas).
 */
export function canSwapPalhacos(state: TrucoGameState, playerId: string): boolean {
  if (state.special === 'ferro') return false;
  if (state.phase !== 'playing' && state.phase !== 'truco' && state.phase !== 'maoDeOnze') return false;
  const hand = state.hands[playerId] ?? [];
  return hand.length === 3 && hand.every((c) => PALHACOS.includes(c.rank)) && state.stock.length >= 3;
}

function swap(state: TrucoGameState, playerId: string): TrucoResult {
  if (!canSwapPalhacos(state, playerId)) return fail('INVALID_ACTION');
  return ok({
    ...state,
    hands: { ...state.hands, [playerId]: state.stock.slice(0, 3) },
    stock: state.stock.slice(3),
    swapped: state.swapped.includes(playerId) ? state.swapped : [...state.swapped, playerId],
  });
}

function nextHand(state: TrucoGameState): TrucoResult {
  if (state.phase !== 'handEnd') return fail('WRONG_PHASE');
  return ok(deal(state, nextSeat(state, state.dealerIndex)));
}

export function applyTrucoAction(state: TrucoGameState, action: TrucoAction): TrucoResult {
  if (state.phase === 'gameOver') return fail('WRONG_PHASE');
  if ('playerId' in action && seatOf(state, action.playerId) < 0) return fail('UNKNOWN_PLAYER');
  switch (action.type) {
    case 'play':
      return play(state, action.playerId, action.cardId, action.covered === true);
    case 'truco':
      return askTruco(state, action.playerId);
    case 'accept':
      return accept(state, action.playerId);
    case 'run':
      return run(state, action.playerId);
    case 'swap':
      return swap(state, action.playerId);
    case 'collectRound':
      return collectRound(state);
    case 'nextHand':
      return nextHand(state);
    default:
      return fail('INVALID_ACTION');
  }
}

/** Quem precisa agir agora (jogar, responder ou decidir a mão de onze), ou null durante pausas. */
export function trucoActorId(state: TrucoGameState): string | null {
  if (state.phase === 'playing') return state.turnPlayerId;
  if (state.phase === 'truco') return state.request?.responderId ?? null;
  if (state.phase === 'maoDeOnze') return state.onzeDeciderId;
  return null;
}
