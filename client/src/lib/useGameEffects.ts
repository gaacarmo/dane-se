import { useEffect, useRef } from 'react';
import type { DaneseRoomView } from '@dane-se/shared';
import { haptic, sfx } from './sound';

/**
 * Side effects driven by game state changes: sound effects, vibration, a
 * blinking tab title when it's your turn in the background, and keeping the
 * phone screen awake during a game.
 */
export function useGameEffects(room: DaneseRoomView): void {
  const game = room.game;
  const prev = useRef<DaneseRoomView | null>(null);
  const myTurn =
    !!game && game.turnPlayerId === room.youId && (game.phase === 'betting' || game.phase === 'playing');

  useEffect(() => {
    const before = prev.current?.game;
    prev.current = room;
    if (!game || !before) return;

    const sameRound = before.roundNumber === game.roundNumber;
    const sameTrick = sameRound && before.tricksPlayed === game.tricksPlayed;

    // New round dealt.
    if (!sameRound && game.phase === 'betting') {
      const alive = game.players.filter((p) => !p.eliminated).length;
      sfx.deal(game.cardsPerPlayer * alive);
    }

    // A card hit the table.
    if (sameTrick && game.trick.plays.length > before.trick.plays.length) sfx.play();

    // Trick decided: a little fanfare if you took it.
    if (game.phase === 'trickEnd' && before.phase !== 'trickEnd' && game.trick.result?.winnerId === room.youId) {
      sfx.trickWon();
    }

    // Trick collected.
    if (before.phase === 'trickEnd' && game.phase !== 'trickEnd') sfx.collect();

    // Round scored.
    const r = game.lastRound;
    if (r && r.roundNumber !== before.lastRound?.roundNumber) {
      const mine = r.results.find((x) => x.playerId === room.youId);
      if (mine?.gainedLetter) {
        sfx.letter();
        haptic([70, 50, 70]);
      }
    }

    // Game over.
    if (game.phase === 'gameOver' && before.phase !== 'gameOver') {
      if (game.winnerId === room.youId) sfx.win();
      else sfx.lose();
    }
  }, [room, game]);

  // Your turn: ding + buzz.
  useEffect(() => {
    if (!myTurn) return;
    sfx.turn();
    haptic(40);
  }, [myTurn]);

  // Blink the tab title while it's your turn and the tab is in the background.
  useEffect(() => {
    if (!myTurn) return;
    const original = 'Dane-se';
    let on = false;
    const timer = setInterval(() => {
      if (!document.hidden) {
        document.title = original;
        return;
      }
      on = !on;
      document.title = on ? '🔔 Sua vez!' : original;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [myTurn]);

  // Keep the screen on while the game is running (phones dim and lock otherwise).
  const playing = room.status === 'playing';
  useEffect(() => {
    if (!playing || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        // Denied (e.g. battery saver): not a problem.
      }
    };
    // The lock is dropped whenever the tab is hidden; take it again on return.
    const onVisible = () => document.visibilityState === 'visible' && void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [playing]);
}
