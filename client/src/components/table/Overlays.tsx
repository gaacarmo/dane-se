import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { type PlayerView, type PublicPlayer, type RoomView, formatMoney, wordLetters } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { actions, useClient } from '../../lib/store';
import { PlayingCard } from '../cards/PlayingCard';
import { Button } from '../ui/Button';
import { Letters } from './Letters';

/** End-of-round overlay: who hit/missed, who got a letter, Pé tie penalty, eliminations. */
export function RoundSummary({ game }: { game: PlayerView }) {
  const r = game.lastRound;
  const show = game.phase === 'roundSummary' && r !== null;
  const word = wordLetters(game.settings.word);
  const name = (id: string) => (id === game.viewerId ? 'Você' : (game.players.find((p) => p.id === id)?.name ?? '?'));

  return (
    <AnimatePresence>
      {show && r && (
        <motion.div
          key={r.roundNumber}
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-felt-900/95 shadow-2xl ring-1 ring-gold-500/50"
            initial={{ y: 30, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            aria-live="polite"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <div className="w-9 shrink-0">
                <PlayingCard card={r.vira} />
              </div>
              <div>
                <h2 className="font-display text-xl text-gold-300">Fim da rodada {r.roundNumber}</h2>
                <p className="text-xs text-stone-400">
                  {r.cardsPerPlayer} {r.cardsPerPlayer === 1 ? 'carta' : 'cartas'} · Pé: {name(r.dealerId)}
                </p>
              </div>
            </div>

            <ul className="divide-y divide-white/5 px-2">
              {r.results.map((res) => {
                const player = game.players.find((p) => p.id === res.playerId);
                return (
                  <li key={res.playerId} className="flex items-center gap-2 px-2 py-2">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                      style={{ background: avatarColor(res.playerId) }}
                    >
                      {initial(player?.name ?? '?')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{name(res.playerId)}</div>
                      <div className="text-xs text-stone-400">
                        pediu {res.bet} · fez {res.tricksWon}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {res.hitBet ? (
                        <span className="rounded bg-felt-600 px-1.5 py-0.5 text-xs font-bold text-white">✓ acertou</span>
                      ) : (
                        <span className="rounded bg-wine-700 px-1.5 py-0.5 text-xs font-bold text-white">✗ errou</span>
                      )}
                      <Letters word={word} lost={res.lettersAfter} compact />
                    </div>
                    {res.gainedLetter && (
                      <span className="w-12 text-right text-xs font-bold text-card-red">
                        +{word[res.lettersAfter - 1] ?? ''}
                        {res.eliminated && <span className="block">FORA!</span>}
                      </span>
                    )}
                    {!res.gainedLetter && <span className="w-12" />}
                  </li>
                );
              })}
            </ul>

            {(r.allTricksTied || r.voided) && (
              <div className="space-y-1 border-t border-white/10 px-4 py-3 text-sm">
                {r.allTricksTied && (
                  <p className="text-gold-300">
                    🤝 Todas as vazas empataram!{' '}
                    {r.dealerTiePenalty
                      ? `O Pé (${name(r.dealerId)}) leva uma letra de castigo.`
                      : `O Pé (${name(r.dealerId)}) já tinha errado, então leva só uma letra.`}
                  </p>
                )}
                {r.voided && (
                  <p className="text-gold-300">
                    😮 Todo mundo seria eliminado ao mesmo tempo — rodada anulada, ninguém leva letra. Repete a rodada!
                  </p>
                )}
              </div>
            )}

            <motion.div
              className="h-1 bg-gold-400"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 6, ease: 'linear' }}
            />
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GameOver({ room }: { room: RoomView }) {
  const game = room.game;
  const { profile } = useClient();
  if (room.status !== 'finished' || !game) return null;
  const winner = game.players.find((p) => p.id === game.winnerId);
  const isHost = room.hostId === room.youId;
  const youWon = game.winnerId === room.youId;
  const payout = room.results?.find((r) => r.playerId === room.youId);
  // Winner first, then whoever lasted longest; players knocked out in the same round share a place.
  const outRound = (p: PublicPlayer) => p.eliminatedInRound ?? Number.MAX_SAFE_INTEGER;
  const byLasted = (a: PublicPlayer, b: PublicPlayer) => outRound(b) - outRound(a) || a.letters - b.letters;
  const standings = [...game.players].sort(byLasted);
  const place = (p: PublicPlayer) => 1 + standings.filter((q) => byLasted(q, p) < 0).length;

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
        transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.6 }}
      >
        <motion.div
          className="text-6xl"
          animate={{ rotate: [0, -10, 10, -6, 0], y: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, repeatDelay: 0.6 }}
        >
          👑
        </motion.div>
        <h2 className="mt-2 font-display text-3xl gold-text">
          {winner ? (youWon ? 'Você venceu!' : `${winner.name} venceu!`) : 'Fim de jogo'}
        </h2>
        <p className="mt-1 text-sm text-stone-300">Depois de {game.roundNumber} rodadas.</p>

        {room.results && (
          <div className="mt-3 space-y-1 rounded-xl bg-black/25 p-3 text-left text-sm">
            {room.results.map((res) => (
              <div key={res.playerId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-stone-400">{res.place}º</span>{' '}
                  {res.playerId === room.youId ? 'Você' : res.name}
                </span>
                <span
                  className={`font-bold ${
                    res.amount > 0 ? 'text-emerald-300' : res.amount < 0 ? 'text-red-300' : 'text-stone-400'
                  }`}
                >
                  {res.amount > 0 ? `+${formatMoney(res.amount)}` : res.amount < 0 ? formatMoney(res.amount) : '—'}
                </span>
              </div>
            ))}
            {payout && profile && (
              <p className="border-t border-white/10 pt-2 text-xs text-stone-400">
                Saldo agora: <span className="font-semibold text-stone-200">{formatMoney(profile.balance)}</span>
              </p>
            )}
          </div>
        )}

        <ol className="mt-4 space-y-1.5 text-left">
          {standings.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg bg-black/25 px-3 py-1.5">
              <span className="w-5 text-stone-400">{place(p)}º</span>
              <span className="min-w-0 flex-1 truncate">{p.id === room.youId ? 'Você' : p.name}</span>
              <Letters word={wordLetters(game.settings.word)} lost={p.letters} compact />
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-col gap-2">
          {isHost ? (
            <Button onClick={() => actions.rematch()}>Jogar de novo</Button>
          ) : (
            <p className="text-sm text-stone-400">Aguardando o anfitrião chamar a revanche…</p>
          )}
          <Button variant="ghost" onClick={() => actions.leave()}>
            Sair
          </Button>
        </div>
      </motion.section>
    </motion.div>
  );
}

/** A disconnected player's turn: countdown until the bot plays, host can skip. */
export function WaitingBanner({ room }: { room: RoomView }) {
  const waiting = room.waitingFor;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waiting]);

  const who = waiting && room.members.find((m) => m.id === waiting.playerId);
  const seconds = waiting ? Math.max(0, Math.ceil((waiting.deadline - now) / 1000)) : 0;

  return (
    <AnimatePresence>
      {waiting && who && (
        <motion.div
          className="absolute inset-x-0 top-2 z-40 flex justify-center px-3"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          role="status"
        >
          <div className="flex items-center gap-3 rounded-xl bg-black/85 px-4 py-2 text-sm shadow-xl ring-1 ring-gold-500/50">
            <span className="size-2.5 animate-pulse rounded-full bg-gold-400" />
            <span>
              Aguardando <strong>{who.name}</strong> reconectar… o bot joga em {seconds}s
            </span>
            {room.hostId === room.youId && (
              <button
                onClick={() => actions.skipWaiting()}
                className="min-h-9 rounded-lg bg-gold-400 px-3 font-semibold text-wood-900"
              >
                Pular
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
