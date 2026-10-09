import { type PokerCard } from './cards.js';
import {
  type HandSummary,
  type PokerGameState,
  type PokerHandPhase,
  type PokerStatus,
  type PokerStreet,
} from './game.js';
import { type PokerSettings } from './rules.js';

export type PokerViewPhase = PokerStreet | 'summary' | 'finished';

export interface PokerSeatView {
  id: string;
  name: string;
  /** Chips in front (not counting the street bet already on the table). */
  chips: number;
  /** Chips committed this street. */
  bet: number;
  folded: boolean;
  allIn: boolean;
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

export interface PokerLegalView {
  canCheck: boolean;
  canCall: boolean;
  /** What a call would cost (capped at the player's stack). */
  callAmount: number;
  canRaise: boolean;
  /** Cheapest legal raise-to this street (or 0 when only all-in is possible). */
  minRaiseTo: number;
  /** Highest legal raise-to (their whole stack). */
  maxRaiseTo: number;
  allInPossible: boolean;
  /** Amount still owed to match the current bet. */
  toCall: number;
}

/** Everything one client may know. Hidden cards are filtered here. */
export interface PokerView {
  viewerId: string | null;
  isSpectator: boolean;
  settings: PokerSettings;
  status: PokerStatus;
  /** What the table looks like: the current street, "summary", or "finished". */
  phase: PokerViewPhase;
  handPhase: PokerHandPhase | null;
  handNumber: number;
  buttonId: string | null;
  actorId: string | null;
  pot: number;
  currentBet: number;
  community: PokerCard[];
  seats: PokerSeatView[];
  /** The viewer's own hole cards (empty for spectators). */
  hole: PokerCard[];
  legal: PokerLegalView;
  /** True between hands for the viewer (the room still charges the wallet). */
  canRebuy: boolean;
  rebuyAmount: number;
  lastHand: HandSummary | null;
  winnerId: string | null;
}

export function getPokerView(state: PokerGameState, viewerId: string | null): PokerView {
  const hand = state.hand;
  const isPlayer = viewerId !== null && state.players.some((p) => p.id === viewerId);
  const phase: PokerViewPhase =
    state.status === 'finished'
      ? 'finished'
      : hand && hand.phase === 'done'
        ? 'summary'
        : hand
          ? hand.street
          : 'finished';
  const actorId = state.status === 'hand' && hand && hand.phase === 'betting' ? hand.actor : null;

  const seats = state.players.map((p): PokerSeatView => {
    const s = hand?.seats[p.id];
    return {
      id: p.id,
      name: p.name,
      chips: s ? s.stack : p.stack,
      bet: s ? s.streetBet : 0,
      folded: s ? s.folded : false,
      allIn: s ? s.allIn : false,
      isButton: hand ? p.id === hand.buttonId : false,
      isSmallBlind: hand ? p.id === hand.sbId : false,
      isBigBlind: hand ? p.id === hand.bbId : false,
    };
  });

  const seat = hand?.seats[viewerId ?? ''];
  const myTurn = state.status === 'hand' && hand?.phase === 'betting' && hand.actor === viewerId && !!seat;

  let legal: PokerLegalView = {
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canRaise: false,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    allInPossible: false,
    toCall: 0,
  };
  if (myTurn && hand) {
    const toCall = Math.max(0, hand.currentBet - seat!.streetBet);
    const maxRaiseTo = seat!.streetBet + seat!.stack;
    const minRaiseTo = hand.currentBet + hand.minRaise;
    const canAct = !seat!.folded && !seat!.allIn;
    legal = {
      canCheck: canAct && toCall === 0,
      canCall: canAct && toCall > 0 && toCall <= seat!.stack,
      callAmount: Math.min(toCall, seat!.stack),
      canRaise: canAct && seat!.stack > 0 && minRaiseTo <= maxRaiseTo,
      minRaiseTo: minRaiseTo <= maxRaiseTo ? minRaiseTo : 0,
      maxRaiseTo,
      allInPossible: canAct && seat!.stack > 0,
      toCall,
    };
  }

  return {
    viewerId,
    isSpectator: !isPlayer,
    settings: state.settings,
    status: state.status,
    phase,
    handPhase: hand ? hand.phase : null,
    handNumber: state.handNumber,
    buttonId: hand ? hand.buttonId : null,
    actorId,
    pot: hand ? hand.total : 0,
    currentBet: hand ? hand.currentBet : 0,
    community: hand ? [...hand.community] : [],
    seats,
    hole: seat ? [...hand!.hole[viewerId!]!] : [],
    legal,
    canRebuy: state.status === 'hand' && hand?.phase === 'done' && isPlayer,
    rebuyAmount: state.settings.entry,
    lastHand: state.lastHand,
    winnerId: state.winnerId,
  };
}