import type { RoundPhase } from './sim.js';

export type Overlay = 'none' | 'buy' | 'pause';

export interface FlowState {
  overlay: Overlay;
  map: boolean;
  locked: boolean;
  phase: RoundPhase;
  ended: boolean;
  /** O navegador recusou o último pedido de travar o mouse. */
  lockFailed: boolean;
}

export type FlowEvent =
  | { type: 'phase'; phase: RoundPhase; ended: boolean }
  | { type: 'lock'; locked: boolean }
  | { type: 'lockError' }
  | { type: 'key'; key: 'buy' | 'map' | 'escape' }
  | { type: 'click'; target: 'resume' | 'close-buy' | 'close-map' | 'play' };

export type FlowEffect = 'requestLock' | 'releaseLock';

export interface FlowResult {
  state: FlowState;
  effects: FlowEffect[];
}

export function initialFlow(): FlowState {
  return { overlay: 'buy', map: false, locked: false, phase: 'buy', ended: false, lockFailed: false };
}

/** Algum menu, mapa ou tela de fim está aberto e o cursor precisa aparecer. */
export function cursorFree(s: FlowState): boolean {
  return s.ended || s.overlay !== 'none' || s.map;
}

export function needsLockClick(s: FlowState): boolean {
  return !cursorFree(s) && !s.locked;
}

/** No solo a simulação espera pela pausa ou pelo clique que trava o mouse; no multiplayer ela nunca para. */
export function simPaused(s: FlowState, solo = true): boolean {
  return solo && (s.overlay === 'pause' || (s.phase === 'live' && needsLockClick(s)));
}

const done = (state: FlowState, effects: FlowEffect[] = []): FlowResult => ({ state, effects });
const releaseIfLocked = (state: FlowState): FlowEffect[] => (state.locked ? ['releaseLock'] : []);
const afterClose = (next: FlowState): FlowResult => done(next, cursorFree(next) ? [] : ['requestLock']);

/**
 * Decide o que fazer com o mouse e os menus. É síncrona: o cliente executa os `effects` dentro do próprio gesto
 * (clique ou tecla), que é quando o navegador aceita travar o mouse.
 */
export function reduceFlow(state: FlowState, event: FlowEvent): FlowResult {
  switch (event.type) {
    case 'phase':
      return onPhase(state, event.phase, event.ended);
    case 'lock':
      return onLock(state, event.locked);
    case 'lockError':
      return done({ ...state, lockFailed: true });
    case 'key':
      return onKey(state, event.key);
    case 'click':
      return onClick(state, event.target);
  }
}

function onPhase(state: FlowState, phase: RoundPhase, ended: boolean): FlowResult {
  if (ended) {
    if (state.ended) return done(state);
    return done({ ...state, phase, ended: true, overlay: 'none', map: false }, releaseIfLocked(state));
  }
  if (phase === state.phase && !state.ended) return done(state);

  const next: FlowState = { ...state, phase, ended: false };
  if (phase === 'buy') {
    if (state.overlay === 'pause') return done(next);
    next.overlay = 'buy';
    return done(next, releaseIfLocked(state));
  }
  if (state.overlay === 'buy') next.overlay = 'none';
  return done(next);
}

function onLock(state: FlowState, locked: boolean): FlowResult {
  if (locked) {
    const next = { ...state, locked: true, lockFailed: false };
    return done(next, cursorFree(next) ? ['releaseLock'] : []);
  }
  const next = { ...state, locked: false };
  if (state.locked && !cursorFree(state)) next.overlay = 'pause';
  return done(next);
}

function onKey(state: FlowState, key: 'buy' | 'map' | 'escape'): FlowResult {
  if (state.ended) return done(state);
  switch (key) {
    case 'buy':
      if (state.phase !== 'buy' || state.overlay === 'pause') return done(state);
      if (state.overlay === 'buy') return afterClose({ ...state, overlay: 'none' });
      return done({ ...state, overlay: 'buy', map: false }, releaseIfLocked(state));
    case 'map':
      if (state.overlay === 'pause') return done(state);
      if (state.map) return afterClose({ ...state, map: false });
      return done({ ...state, map: true, overlay: 'none' }, releaseIfLocked(state));
    case 'escape':
      // Esc não conta como gesto do usuário: fecha sem pedir o lock e deixa o clique para voltar ao jogo.
      if (state.map) return done({ ...state, map: false });
      if (state.overlay !== 'none') return done({ ...state, overlay: 'none' });
      return done({ ...state, overlay: 'pause' }, releaseIfLocked(state));
  }
}

function onClick(state: FlowState, target: 'resume' | 'close-buy' | 'close-map' | 'play'): FlowResult {
  switch (target) {
    case 'resume':
      return state.overlay === 'pause' ? afterClose({ ...state, overlay: 'none' }) : done(state);
    case 'close-buy':
      return state.overlay === 'buy' ? afterClose({ ...state, overlay: 'none' }) : done(state);
    case 'close-map':
      return state.map ? afterClose({ ...state, map: false }) : done(state);
    case 'play':
      return done(state, needsLockClick(state) ? ['requestLock'] : []);
  }
}
