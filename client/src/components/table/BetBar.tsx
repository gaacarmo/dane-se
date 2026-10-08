import { motion } from 'framer-motion';
import { useState } from 'react';
import type { PlayerView } from '@dane-se/shared';

/** Number buttons 0..N. The Pé's forbidden number is disabled and explained. */
export function BetBar({ game, compact, onBet }: { game: PlayerView; compact?: boolean; onBet: (bet: number) => void }) {
  const [sent, setSent] = useState<number | null>(null);
  const n = game.cardsPerPlayer;
  const forbidden = game.dealerForbiddenBet;

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="mx-auto w-full max-w-md space-y-2 px-3"
    >
      {!compact && (
        <p className="text-center text-sm text-stone-200">
          Quantas vazas você vai fazer?
          {game.blindRound && <span className="block text-xs text-stone-400">Rodada cega: olhe as cartas dos outros!</span>}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: n + 1 }, (_, bet) => {
          const legal = game.legalBets.includes(bet);
          const isForbidden = bet === forbidden;
          return (
            <button
              key={bet}
              type="button"
              disabled={!legal || sent !== null}
              onClick={() => {
                setSent(bet);
                onBet(bet);
                setTimeout(() => setSent(null), 1500);
              }}
              title={isForbidden ? `O Pé não pode pedir ${bet}: a soma dos palpites ficaria igual a ${n}.` : undefined}
              aria-label={isForbidden ? `${bet} (proibido para o Pé)` : `Palpite ${bet}`}
              className={`relative rounded-xl font-black shadow-lg transition active:scale-95 ${compact ? 'size-11 text-xl' : 'size-14 text-2xl'} ${
                isForbidden
                  ? 'bg-black/40 text-stone-500 line-through ring-2 ring-card-red/70'
                  : sent === bet
                    ? 'bg-gold-300 text-wood-900'
                    : 'bg-gradient-to-b from-gold-300 to-gold-500 text-wood-900 ring-1 ring-gold-300'
              } disabled:cursor-not-allowed`}
            >
              {bet}
              {isForbidden && (
                <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-card-red text-xs text-white" aria-hidden>
                  ⛔
                </span>
              )}
            </button>
          );
        })}
      </div>
      {forbidden !== null && compact && (
        <p className="text-center text-[11px] text-stone-200">
          Pé não pode pedir <strong>{forbidden}</strong> (soma daria {n})
        </p>
      )}
      {forbidden !== null && !compact && (
        <p className="rounded-lg bg-wine-800/80 px-3 py-2 text-center text-xs text-stone-100 ring-1 ring-card-red/50">
          <strong>Você é o Pé.</strong> Não pode pedir <strong>{forbidden}</strong>: os palpites somariam{' '}
          <strong>{n}</strong> e todo mundo poderia acertar. Alguém sempre tem que errar!
        </p>
      )}
    </motion.div>
  );
}
