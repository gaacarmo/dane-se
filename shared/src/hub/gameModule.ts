import type { Money } from './money.js';
import type { Entry, Payout } from './payout.js';

/** Registry id of a game. Rooms carry one of these. */
export type GameType = 'danese' | 'poker';

/** A seat as seen by the engine (no wallet, no socket). */
export interface GamePlayer {
  id: string;
  name: string;
}

/** Errors an engine may return. A superset of the Dane-se errors. */
export type EngineError =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_BET'
  | 'ILLEGAL_RAISE'
  | 'CARD_NOT_IN_HAND'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_PLAYER_COUNT'
  | 'INVALID_ACTION'
  | 'NOT_ENOUGH_CHIPS';

export type EngineResult<S> = { ok: true; state: S } | { ok: false; error: EngineError };

/** Which automatic transition an engine is waiting for (drives server timers). */
export type AutoDelay = 'trickPause' | 'roundSummary' | 'betweenHands';

export interface AutoStep<Action> {
  delay: AutoDelay;
  action: Action;
}

export interface BotStep<Action> {
  action: Action;
  /** The advanced RNG state (engines never touch Math.random). */
  rng: number;
}

/**
 * The contract between the generic room layer and one game engine. Engines are
 * pure and live in `shared/`; the room layer never inspects engine state
 * directly, it only calls these methods. `viewFor` is the single door through
 * which game data reaches a client.
 */
export interface GameModule<Settings, State, Action, View> {
  readonly id: GameType;
  /** pt-BR display name. */
  readonly name: string;
  /** pt-BR one-liner shown on the hub card. */
  readonly description: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Cheapest buy-in the hub allows for this game. */
  readonly minEntry: Money;
  readonly defaultEntry: Money;
  /** Suggested buy-ins shown as buttons when creating a room. */
  readonly entryOptions: readonly Money[];

  /** Validates untrusted client settings; null means "invalid". */
  validateSettings(raw: unknown): Settings | null;
  /** The buy-in this settings object charges per player. */
  entryFor(settings: Settings): Money;

  create(players: readonly GamePlayer[], settings: Settings, seed: number): EngineResult<State>;
  apply(state: State, action: Action): EngineResult<State>;

  /** The ONLY game data a client ever receives. */
  viewFor(state: State, viewerId: string | null): View;

  /** Bot move for `playerId`, or null when it is not a bot's turn. Advances the RNG. */
  botAction(state: State, playerId: string, rng: number): BotStep<Action> | null;

  /** Who must act right now (for timers/reconnect), or null while a timer runs. */
  actorId(state: State): string | null;

  /** The automatic transition the engine is waiting for, or null. */
  auto(state: State): AutoStep<Action> | null;

  /** Builds a card-play action from an untrusted payload (blind round ignores it). */
  playAction(state: State, playerId: string, rawCardId: unknown): { ok: true; action: Action } | { ok: false; error: EngineError };

  /** Builds a bet/call/raise action from an untrusted payload. */
  betAction(state: State, playerId: string, rawBet: unknown): { ok: true; action: Action } | { ok: false; error: EngineError };

  /**
   * Builds a command-style action (fold/check/call/all-in) from an untrusted
   * payload. Optional: engines without named commands never receive the
   * `game:action` event. Only the builder runs here — turn/phase checks stay in
   * `apply`, so the room layer maps a malformed payload (INVALID_ACTION) to
   * INVALID_PAYLOAD but passes real engine errors through.
   */
  commandAction?(state: State, playerId: string, raw: unknown): { ok: true; action: Action } | { ok: false; error: EngineError };

  /**
   * The forced action when a connected player's turn times out (check when it
   * is free, otherwise fold). Presence also enables the server turn timer.
   */
  timeoutAction?(state: State, playerId: string): Action | null;

  /**
   * Builds a rebuy action plus the money it costs. The room layer charges the
   * wallet before applying it (and refunds if the apply fails). Optional:
   * engines without rebuys never receive the rebuy command.
   */
  rebuyAction?(
    state: State,
    playerId: string,
    rawAmount: unknown,
  ): { ok: true; action: Action; cost: Money } | { ok: false; error: EngineError };

  isFinished(state: State): boolean;
  winnerId(state: State): string | null;

  /** Pure payout computation. Must sum to the pot (see assertConservation). */
  settle(state: State, entries: readonly Entry[]): Payout[];
}
