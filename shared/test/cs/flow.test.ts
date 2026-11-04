import { describe, expect, it } from 'vitest';
import {
  cursorFree,
  initialFlow,
  needsLockClick,
  reduceFlow,
  simPaused,
  type FlowEvent,
  type FlowState,
} from '../../src/cs/flow.js';

const playing: FlowState = { overlay: 'none', map: false, locked: true, phase: 'live', ended: false, lockFailed: false };
const send = (state: FlowState, event: FlowEvent) => reduceFlow(state, event);

describe('initialFlow', () => {
  it('starts in the buy phase with the market open and the cursor free', () => {
    const s = initialFlow();
    expect(s.overlay).toBe('buy');
    expect(s.phase).toBe('buy');
    expect(cursorFree(s)).toBe(true);
    expect(s.locked).toBe(false);
  });
});

describe('new round while playing with the mouse locked', () => {
  it('opens the market and frees the mouse, and the lock loss never opens the pause menu', () => {
    const over = send(playing, { type: 'phase', phase: 'over', ended: false });
    expect(over.state.overlay).toBe('none');

    const buy = send(over.state, { type: 'phase', phase: 'buy', ended: false });
    expect(buy.state.overlay).toBe('buy');
    expect(buy.effects).toEqual(['releaseLock']);

    const lost = send(buy.state, { type: 'lock', locked: false });
    expect(lost.state.overlay).toBe('buy');
    expect(lost.effects).toEqual([]);
    expect(cursorFree(lost.state)).toBe(true);
  });

  it('ignores a repeated phase event', () => {
    const buy = send(send(playing, { type: 'phase', phase: 'buy', ended: false }).state, { type: 'phase', phase: 'buy', ended: false });
    expect(buy.effects).toEqual([]);
    expect(buy.state.overlay).toBe('buy');
  });
});

describe('round going live', () => {
  const buying: FlowState = { ...initialFlow(), locked: false };

  it('closes the market without asking for a lock, then waits for a click', () => {
    const live = send(buying, { type: 'phase', phase: 'live', ended: false });
    expect(live.state.overlay).toBe('none');
    expect(live.effects).toEqual([]);
    expect(needsLockClick(live.state)).toBe(true);
    expect(simPaused(live.state)).toBe(true);
  });

  it('does not pause the simulation in multiplayer while waiting for the click', () => {
    const live = send(buying, { type: 'phase', phase: 'live', ended: false });
    expect(simPaused(live.state, false)).toBe(false);
  });

  it('keeps the lock if the player already closed the market and locked the mouse', () => {
    const closed = send(buying, { type: 'click', target: 'close-buy' }).state;
    const locked = send(closed, { type: 'lock', locked: true }).state;
    const live = send(locked, { type: 'phase', phase: 'live', ended: false }).state;
    expect(live.locked).toBe(true);
    expect(simPaused(live)).toBe(false);
  });
});

describe('losing the lock', () => {
  it('opens the pause menu when the player presses Esc during play', () => {
    const lost = send(playing, { type: 'lock', locked: false });
    expect(lost.state.overlay).toBe('pause');
    expect(simPaused(lost.state)).toBe(true);
  });

  it('opens the pause menu when the lock is lost in the buy phase with the market closed', () => {
    const state: FlowState = { ...playing, phase: 'buy' };
    expect(send(state, { type: 'lock', locked: false }).state.overlay).toBe('pause');
  });

  it('does nothing when the mouse was not locked', () => {
    const state: FlowState = { ...playing, locked: false };
    expect(send(state, { type: 'lock', locked: false }).state.overlay).toBe('none');
  });

  it('releases a lock that arrives while a menu is open', () => {
    const state: FlowState = { ...initialFlow(), locked: false };
    const arrived = send(state, { type: 'lock', locked: true });
    expect(arrived.effects).toEqual(['releaseLock']);
  });
});

describe('pause menu', () => {
  const paused = send(playing, { type: 'lock', locked: false }).state;

  it('resumes by asking for the lock', () => {
    const r = send(paused, { type: 'click', target: 'resume' });
    expect(r.state.overlay).toBe('none');
    expect(r.effects).toEqual(['requestLock']);
  });

  it('resumes with Esc as well, without asking for the lock (Esc is not a user activation)', () => {
    const r = send(paused, { type: 'key', key: 'escape' });
    expect(r.state.overlay).toBe('none');
    expect(r.effects).toEqual([]);
    expect(needsLockClick(r.state)).toBe(true);
  });

  it('keeps the pause menu closed after Esc even when the lock loss arrives first', () => {
    const lostFirst = send(playing, { type: 'lock', locked: false }).state;
    const r = send(lostFirst, { type: 'key', key: 'escape' });
    expect(r.state.overlay).toBe('none');
    expect(r.effects).toEqual([]);
  });

  it('opens when Esc is pressed with nothing open and the mouse free', () => {
    const state: FlowState = { ...playing, locked: false };
    expect(send(state, { type: 'key', key: 'escape' }).state.overlay).toBe('pause');
  });
});

describe('market key', () => {
  const buyPhase: FlowState = { ...playing, phase: 'buy' };

  it('does nothing outside the buy phase', () => {
    const r = send(playing, { type: 'key', key: 'buy' });
    expect(r.state).toEqual(playing);
    expect(r.effects).toEqual([]);
  });

  it('opens the market, freeing the mouse, and closes it asking for the lock', () => {
    const open = send(buyPhase, { type: 'key', key: 'buy' });
    expect(open.state.overlay).toBe('buy');
    expect(open.effects).toEqual(['releaseLock']);
    const closed = send(open.state, { type: 'key', key: 'buy' });
    expect(closed.state.overlay).toBe('none');
    expect(closed.effects).toEqual(['requestLock']);
  });

  it('closes with the Pronto button asking for the lock, and with Esc without asking', () => {
    const open = send(buyPhase, { type: 'key', key: 'buy' }).state;
    expect(send(open, { type: 'click', target: 'close-buy' }).effects).toEqual(['requestLock']);
    const esc = send(open, { type: 'key', key: 'escape' });
    expect(esc.state.overlay).toBe('none');
    expect(esc.effects).toEqual([]);
  });
});

describe('map key', () => {
  it('opens the map freeing the mouse, and closes it asking for the lock', () => {
    const open = send(playing, { type: 'key', key: 'map' });
    expect(open.state.map).toBe(true);
    expect(open.effects).toEqual(['releaseLock']);
    expect(simPaused(open.state)).toBe(false);
    const closed = send(open.state, { type: 'key', key: 'map' });
    expect(closed.state.map).toBe(false);
    expect(closed.effects).toEqual(['requestLock']);
  });

  it('opening the map closes the market, and opening the market closes the map', () => {
    const withMap = send(initialFlow(), { type: 'key', key: 'map' }).state;
    expect(withMap.map).toBe(true);
    expect(withMap.overlay).toBe('none');
    const back = send(withMap, { type: 'key', key: 'buy' }).state;
    expect(back.map).toBe(false);
    expect(back.overlay).toBe('buy');
  });

  it('closing the map from the buy phase asks for the lock only through a gesture', () => {
    const withMap = send(initialFlow(), { type: 'key', key: 'map' }).state;
    expect(send(withMap, { type: 'key', key: 'map' }).effects).toEqual(['requestLock']);
    expect(send(withMap, { type: 'key', key: 'escape' }).effects).toEqual([]);
  });

  it('does not open over the pause menu', () => {
    const paused: FlowState = { ...playing, locked: false, overlay: 'pause' };
    expect(send(paused, { type: 'key', key: 'map' }).state.map).toBe(false);
  });
});

describe('end of the match', () => {
  it('frees the mouse and closes every overlay', () => {
    const ended = send({ ...playing, map: true }, { type: 'phase', phase: 'over', ended: true });
    expect(ended.state.overlay).toBe('none');
    expect(ended.state.map).toBe(false);
    expect(ended.state.ended).toBe(true);
    expect(cursorFree(ended.state)).toBe(true);
    expect(ended.effects).toEqual(['releaseLock']);
  });

  it('never asks for the lock afterwards', () => {
    const ended = send(playing, { type: 'phase', phase: 'over', ended: true }).state;
    for (const event of [
      { type: 'click', target: 'play' },
      { type: 'click', target: 'resume' },
      { type: 'key', key: 'escape' },
      { type: 'key', key: 'map' },
    ] as FlowEvent[]) {
      expect(send(ended, event).effects).not.toContain('requestLock');
    }
  });
});

describe('lock errors and the play click', () => {
  it('records a failure and clears it once the lock succeeds', () => {
    const waiting: FlowState = { ...playing, locked: false };
    const failed = send(waiting, { type: 'lockError' }).state;
    expect(failed.lockFailed).toBe(true);
    expect(send(failed, { type: 'lock', locked: true }).state.lockFailed).toBe(false);
  });

  it('asks for the lock when nothing is open, and does nothing when a menu is open', () => {
    const waiting: FlowState = { ...playing, locked: false };
    expect(send(waiting, { type: 'click', target: 'play' }).effects).toEqual(['requestLock']);
    expect(send(initialFlow(), { type: 'click', target: 'play' }).effects).toEqual([]);
  });
});

describe('preparation phase', () => {
  it('closes the market when the preparation starts and does not reopen it with B', () => {
    const prep = send(initialFlow(), { type: 'phase', phase: 'prep', ended: false });
    expect(prep.state.overlay).toBe('none');
    expect(prep.effects).toEqual([]);
    expect(send(prep.state, { type: 'key', key: 'buy' }).state.overlay).toBe('none');
  });

  it('keeps the lock through preparation into the live round', () => {
    const locked: FlowState = { ...initialFlow(), overlay: 'none', locked: true, phase: 'prep' };
    const live = send(locked, { type: 'phase', phase: 'live', ended: false });
    expect(live.state.locked).toBe(true);
    expect(simPaused(live.state)).toBe(false);
  });

  it('opens the pause menu when the lock is lost during the preparation', () => {
    const state: FlowState = { ...playing, phase: 'prep' };
    expect(send(state, { type: 'lock', locked: false }).state.overlay).toBe('pause');
  });

  it('frees the mouse and reopens the market when the next round starts', () => {
    const state: FlowState = { ...playing, phase: 'over' };
    const buy = send(state, { type: 'phase', phase: 'buy', ended: false });
    expect(buy.state.overlay).toBe('buy');
    expect(buy.effects).toEqual(['releaseLock']);
  });
});
