import { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type PokerRoomView, type PokerView, formatMoney } from '@dane-se/shared';
import { actions, useClient } from '../../lib/store';
import { Button } from '../ui/Button';
import { CardFace } from './CardFace';

function Overlay({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-3 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {children}
    </motion.div>
  );
}

const nameOf = (game: PokerView, id: string, youId: string) =>
  id === youId ? 'Você' : (game.seats.find((s) => s.id === id)?.name ?? '?');

/** Between-hands result: winners, showdown cards and the rebuy call to action. */
export function PokerHandSummary({ game, youId }: { game: PokerView; youId: string }) {
  const h = game.lastHand;
  const show = game.phase === 'summary' && !!h;
  const myChips = h?.stacks.find((s) => s.playerId === youId)?.chips ?? null;

  return (
    <AnimatePresence>
      {show && h && (
        <Overlay key={h.handNumber}>
          <motion.section
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-felt-900/95 shadow-2xl ring-1 ring-gold-500/50"
            initial={{ y: 30, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            aria-live="polite"
          >
            <div className="flex items-baseline justify-between border-b border-white/10 px-4 py-3">
              <h2 className="font-display text-xl text-gold-300">Fim da mão {h.handNumber}</h2>
              <span className="text-xs text-stone-400">
                {h.endedBy === 'fold' ? 'todos desistiram' : 'showdown'} · pote {formatMoney(h.pot)}
              </span>
            </div>

            <div className="space-y-2 px-4 py-3">
              {h.winners.map((w) => (
                <div key={w.playerId} className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-white">
                    🏆 {nameOf(game, w.playerId, youId)}
                  </span>
                  <span className="font-mono font-bold text-emerald-300">+{formatMoney(w.amount)}</span>
                </div>
              ))}
            </div>

            {h.revealed && h.revealed.length > 0 && (
              <div className="space-y-2 border-t border-white/10 px-4 py-3">
                {h.revealed.map((r) => (
                  <div key={r.playerId} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 truncate text-xs text-stone-300">
                      {nameOf(game, r.playerId, youId)}
                    </span>
                    <div className="flex gap-1.5">
                      {r.cards.map((c, i) => (
                        <CardFace key={`${c.rank}${c.suit}-${i}`} card={c} className="w-9" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {game.canRebuy && myChips !== null && myChips < game.settings.minBuyIn && (
              <div className="space-y-2 border-t border-white/10 bg-wine-800/40 px-4 py-3">
                <p className="text-sm text-stone-200">
                  Sua banca acabou! Recarregue agora para continuar na próxima mão.
                </p>
                <Button className="w-full" onClick={() => void actions.rebuy()}>
                  💰 Recarregar {formatMoney(game.rebuyAmount)}
                </Button>
              </div>
            )}

            <motion.div
              className="h-1 bg-gold-400"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 6, ease: 'linear' }}
            />
          </motion.section>
        </Overlay>
      )}
    </AnimatePresence>
  );
}

/** End of the cash-game session: final stacks and a rematch. */
export function PokerGameOver({ room }: { room: PokerRoomView }) {
  const game = room.game;
  const { profile } = useClient();
  if (room.status !== 'finished' || !game) return null;
  const youWon = game.winnerId === room.youId;
  const winner = game.seats.find((s) => s.id === game.winnerId);
  const isHost = room.hostId === room.youId;
  const results = room.results ?? [];

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.section
        className="w-full max-w-sm rounded-2xl bg-felt-900 p-5 text-center shadow-2xl ring-2 ring-gold-400"
        initial={{ scale: 0.6, rotate: -4 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
      >
        <div className="text-5xl" aria-hidden>
          {youWon ? '🏆' : '🃏'}
        </div>
        <h2 className="mt-1 font-display text-2xl text-gold-300">
          {youWon ? 'Você levou a mesa!' : winner ? `${winner.name} levou a mesa` : 'Fim de jogo'}
        </h2>

        <ul className="mt-4 space-y-1 text-left text-sm">
          {results.map((r) => (
            <li key={r.playerId} className="flex items-center justify-between rounded-lg bg-black/25 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="mr-2 text-stone-400">{r.place}º</span>
                {r.playerId === room.youId ? 'Você' : r.name}
              </span>
              <span className="font-mono font-bold text-gold-300">{formatMoney(r.amount)}</span>
            </li>
          ))}
        </ul>

        {profile && (
          <p className="mt-3 text-xs text-stone-400">
            Seu saldo na carteira: <span className="font-bold text-stone-200">{formatMoney(profile.balance)}</span>
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {isHost ? (
            <Button className="w-full" onClick={() => actions.rematch()}>
              Revanche
            </Button>
          ) : (
            <p className="text-sm text-stone-300">Aguardando o anfitrião…</p>
          )}
          <Button variant="ghost" className="w-full" onClick={() => actions.leave()}>
            Sair da sala
          </Button>
        </div>
      </motion.section>
    </motion.div>
  );
}
