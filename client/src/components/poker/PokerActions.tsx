import { useEffect, useState, type ReactNode } from 'react';
import { POKER_TURN_TIMEOUT_MS, type PokerView, bigBlind, formatMoney } from '@dane-se/shared';
import { actions } from '../../lib/store';
import { Button } from '../ui/Button';

/** Bottom bar: whose turn it is, the five betting actions, and the raise slider. */
export function PokerControlBar({
  game,
  youId,
  turnSecondsLeft,
}: {
  game: PokerView;
  youId: string;
  /** Seconds until the server auto check/folds; null when nobody is on the clock. */
  turnSecondsLeft: number | null;
}) {
  const me = game.seats.find((s) => s.id === youId);
  const myTurn =
    game.handPhase === 'betting' && game.actorId === youId && !!me && !me.folded && !me.allIn && !game.isSpectator;
  const actor = game.seats.find((s) => s.id === game.actorId);
  const [raising, setRaising] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const legal = game.legal;

  useEffect(() => {
    setRaising(false);
  }, [myTurn, game.handNumber]);

  if (game.isSpectator) {
    return (
      <Shell>
        <p className="py-2 text-center text-sm text-stone-300">Você está assistindo 👀</p>
      </Shell>
    );
  }

  if (me && (me.folded || me.allIn) && game.handPhase === 'betting') {
    return (
      <Shell>
        <p className="py-2 text-center text-sm text-stone-300">
          {me.folded ? 'Você desistiu desta mão.' : 'Você está all-in! Aguardando as cartas…'}
        </p>
      </Shell>
    );
  }

  if (game.phase === 'summary' || game.phase === 'finished') {
    return (
      <Shell>
        <p className="py-2 text-center text-sm text-stone-300">
          {game.phase === 'finished' ? 'Fim de jogo.' : 'Fim da mão — aguardando a próxima…'}
        </p>
      </Shell>
    );
  }

  if (!myTurn) {
    return (
      <Shell>
        <div className="flex items-center justify-between gap-2 py-1">
          <p className="min-w-0 flex-1 truncate text-sm text-stone-300">
            Aguardando <span className="font-semibold text-stone-100">{actor?.name ?? '…'}</span>
          </p>
          {turnSecondsLeft !== null && (
            <span className="shrink-0 font-mono text-sm text-stone-400" aria-hidden>
              {turnSecondsLeft}s
            </span>
          )}
        </div>
        {turnSecondsLeft !== null && <TurnBar seconds={turnSecondsLeft} />}
      </Shell>
    );
  }

  const step = Math.max(1, bigBlind(game.settings.minBuyIn));
  const canRaise = legal.canRaise && legal.maxRaiseTo > legal.minRaiseTo;

  return (
    <Shell highlight>
      {turnSecondsLeft !== null && <TurnBar seconds={turnSecondsLeft} />}
      {raising && canRaise ? (
        <div className="space-y-2 py-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-stone-300">Aumentar para</span>
            <span className="font-mono font-bold text-gold-300">{formatMoney(raiseTo)}</span>
          </div>
          <input
            type="range"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            step={step}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            aria-label="Valor do aumento"
            className="h-11 w-full accent-gold-400"
          />
          <div className="flex flex-wrap gap-1.5">
            <Quick label="Mín" onClick={() => setRaiseTo(legal.minRaiseTo)} />
            <Quick label="½ pote" onClick={() => setRaiseTo(clampTarget(game.currentBet + Math.floor(game.pot / 2), legal.minRaiseTo, legal.maxRaiseTo, step))} />
            <Quick label="Pote" onClick={() => setRaiseTo(clampTarget(game.currentBet + game.pot, legal.minRaiseTo, legal.maxRaiseTo, step))} />
            <Quick label="Máx" onClick={() => setRaiseTo(legal.maxRaiseTo)} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRaising(false)}>
              Voltar
            </Button>
            <Button className="flex-1" onClick={() => void actions.bet(raiseTo)}>
              Aumentar p/ {formatMoney(raiseTo)}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 py-1">
          <Button variant="ghost" className="ring-1 ring-white/15" onClick={() => void actions.action('fold')}>
            Desistir
          </Button>
          {legal.canCheck ? (
            <Button variant="secondary" onClick={() => void actions.action('check')}>
              Passar
            </Button>
          ) : (
            <Button variant="secondary" disabled={!legal.canCall} onClick={() => void actions.action('call')}>
              {legal.canCall ? `Pagar ${formatMoney(legal.callAmount)}` : 'Pagar'}
            </Button>
          )}
          <Button
            disabled={!canRaise}
            onClick={() => {
              setRaiseTo(legal.minRaiseTo);
              setRaising(true);
            }}
          >
            Aumentar
          </Button>
          <Button variant="danger" disabled={!legal.allInPossible} onClick={() => void actions.action('allIn')}>
            All-in {me ? formatMoney(me.chips) : ''}
          </Button>
        </div>
      )}
    </Shell>
  );
}

function Quick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-lg bg-black/30 px-3 text-xs font-semibold text-stone-200 ring-1 ring-white/10 hover:ring-gold-400/60"
    >
      {label}
    </button>
  );
}

function TurnBar({ seconds }: { seconds: number }) {
  const total = Math.max(1, Math.ceil(POKER_TURN_TIMEOUT_MS / 1000));
  const pct = Math.max(0, Math.min(100, (seconds / total) * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-black/40">
      <div className="h-full bg-gold-400 transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  );
}

function clampTarget(v: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((v - min) / step) * step;
  return Math.min(Math.max(snapped, min), max);
}

function Shell({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return (
    <div className={`safe-bottom relative z-20 shrink-0 px-3 pb-2 ${highlight ? 'bg-gold-500/15' : 'bg-black/30'}`}>
      {children}
    </div>
  );
}
