import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  type BingoRoomView,
  type BingoView,
  BINGO_BALLS,
  BINGO_LETTERS,
  BINGO_SHARE,
  CENTER,
  FREE,
  LINE_SHARE,
  formatMoney,
  splitByWeights,
} from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { haptic, sfx } from '../../lib/sound';
import { actions, useClient } from '../../lib/store';
import { ChatPanel } from '../ChatPanel';
import { CircleButton, SectionHeader, Symbols } from '../hub/IosKit';
import { TableMenu } from '../table/TableMenu';
import { LeaveDialog } from '../ui/LeaveDialog';
import { Modal } from '../ui/Modal';
import { VoiceButton } from '../VoiceButton';

const GLASS_BTN = 'glass-control grid size-11 place-items-center rounded-full text-lg';

/** Sons e vibração: bola nova, alguém cantou, fim. */
function useBingoEffects(room: BingoRoomView) {
  const game = room.game;
  const prev = useRef<BingoView | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    if (!game || !before) return;
    if (game.drawn.length > before.drawn.length) sfx.pop();
    if (game.lineWinnerId && !before.lineWinnerId) {
      sfx.trickWon();
      haptic(60);
    }
    if (game.phase === 'gameOver' && before.phase !== 'gameOver') {
      if (game.bingoWinnerId === room.youId) sfx.win();
      else sfx.lose();
    }
  }, [game, room.youId]);
  // Tem prêmio pra cantar: avisa no celular.
  const canClaim = !!game && (game.legal.canClaimLine || game.legal.canClaimBingo);
  useEffect(() => {
    if (!canClaim) return;
    sfx.turn();
    haptic([40, 30, 40]);
  }, [canClaim]);
}

/** A bola sorteada: esfera prateada, letra pequena em cima, número grande. */
function Ball({ n, size = 'lg' }: { n: number; size?: 'lg' | 'sm' }) {
  const letter = BINGO_LETTERS[Math.floor((n - 1) / 15)];
  const big = size === 'lg';
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full ${big ? 'size-36' : 'size-11'}`}
      style={{
        background: 'radial-gradient(circle at 32% 28%, #ffffff 0%, #e5e5ea 30%, #a1a1a6 72%, #636366 100%)',
        boxShadow: big
          ? 'inset 0 -10px 24px rgb(0 0 0 / 0.25), 0 24px 50px -18px rgb(0 0 0 / 0.75)'
          : 'inset 0 -3px 6px rgb(0 0 0 / 0.25), 0 6px 12px -6px rgb(0 0 0 / 0.6)',
      }}
      aria-label={`${letter} ${n}`}
    >
      <span
        className={`grid place-items-center rounded-full bg-white/90 text-[#1c1c1e] ${big ? 'size-24' : 'size-8'}`}
        style={{ boxShadow: 'inset 0 1px 2px rgb(0 0 0 / 0.15)' }}
      >
        <span className="flex flex-col items-center leading-none">
          <span className={`font-bold text-[#636366] ${big ? 'text-lg' : 'text-[8px]'}`}>{letter}</span>
          <span className={`font-black tracking-tight tabular-nums ${big ? 'text-5xl' : 'text-sm'}`}>{n}</span>
        </span>
      </span>
    </span>
  );
}

/** A sua cartela: números marcados em prata, o centro livre e as linhas fechadas em destaque. */
function Card({ card, drawn, lines, last }: { card: number[]; drawn: Set<number>; lines: number[][]; last: number | null }) {
  const inLine = new Set(lines.flat());
  return (
    <section className="glass p-3" aria-label="Sua cartela">
      <div className="mb-2 grid grid-cols-5 gap-1.5">
        {BINGO_LETTERS.map((l) => (
          <span key={l} className="silver-text text-center text-2xl font-black">
            {l}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {card.map((n, i) => {
          const free = i === CENTER && n === FREE;
          const marked = free || drawn.has(n);
          const isLast = n === last;
          return (
            <motion.span
              key={i}
              initial={false}
              animate={isLast ? { scale: [1, 1.18, 1] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
              className={`grid aspect-square place-items-center rounded-[0.8rem] text-[clamp(1rem,5vw,1.5rem)] font-bold tabular-nums transition-colors ${
                marked ? 'tint-fill' : 'bg-ios-fill text-ios-label'
              } ${inLine.has(i) ? 'outline-[3px] outline-offset-2 outline-ios-green' : ''}`}
              aria-label={free ? 'Livre' : `${n}${marked ? ', marcado' : ''}`}
            >
              {free ? '★' : n}
            </motion.span>
          );
        })}
      </div>
    </section>
  );
}

/** "Linha!" e "Bingo!": só acendem quando a sua cartela tem mesmo. */
function ClaimButtons({ game, pot }: { game: BingoView; pot: number }) {
  const [busy, setBusy] = useState(false);
  const [bingoShare, lineShare] = splitByWeights(pot, [BINGO_SHARE, LINE_SHARE]);
  const name = (id: string | null) => (id === game.viewerId ? 'Você' : (game.seats.find((s) => s.id === id)?.name ?? ''));
  const claim = async (prize: 'line' | 'bingo') => {
    setBusy(true);
    await actions.claim(prize);
    setBusy(false);
  };
  const button = (prize: 'line' | 'bingo', label: string, can: boolean, winnerId: string | null, share: number) => (
    <motion.button
      type="button"
      disabled={!can || busy}
      onClick={() => void claim(prize)}
      animate={can ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={can ? { repeat: Infinity, duration: 0.9 } : {}}
      className="tint-fill min-h-[58px] flex-1 rounded-[1.4rem] px-3 text-center transition active:scale-[0.97]"
    >
      <span className="block text-[20px] leading-tight font-black">{label}</span>
      <span className="block text-[12px] font-semibold opacity-75">
        {winnerId ? `Já foi: ${name(winnerId)}` : pot > 0 ? formatMoney(share) : prize === 'line' ? '30% do pote' : '70% do pote'}
      </span>
    </motion.button>
  );
  return (
    <div className="flex gap-3">
      {button('line', 'Linha!', game.legal.canClaimLine, game.lineWinnerId, lineShare!)}
      {button('bingo', 'Bingo!', game.legal.canClaimBingo, game.bingoWinnerId, bingoShare!)}
    </div>
  );
}

/** Todas as 75 bolas, por letra, com as que já saíram acesas. */
function Board({ drawn }: { drawn: Set<number> }) {
  return (
    <section>
      <SectionHeader>Bolas que já saíram</SectionHeader>
      <div className="glass space-y-1.5 p-3">
        {BINGO_LETTERS.map((l, row) => (
          <div key={l} className="flex items-center gap-1">
            <span className="silver-text w-5 shrink-0 text-center text-sm font-black">{l}</span>
            <div className="grid flex-1 grid-cols-15 gap-[3px]">
              {Array.from({ length: 15 }, (_, i) => {
                const n = row * 15 + i + 1;
                const on = drawn.has(n);
                return (
                  <span
                    key={n}
                    className={`grid aspect-square place-items-center rounded-full text-[9px] font-bold tabular-nums ${
                      on ? 'bg-ios-blue text-ios-on-tint' : 'text-ios-label-3'
                    }`}
                  >
                    {n}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Players({ room, game }: { room: BingoRoomView; game: BingoView }) {
  const sorted = [...game.seats].sort((a, b) => a.missing - b.missing);
  return (
    <section>
      <SectionHeader>Quem está perto</SectionHeader>
      <ul className="glass overflow-hidden">
        {sorted.map((s, i) => {
          const member = room.members.find((m) => m.id === s.id);
          return (
            <li key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-ios-separator' : ''}`}>
              <span
                aria-hidden
                className={`grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white ${member?.connected === false ? 'opacity-50' : ''}`}
                style={{ background: avatarColor(s.id) }}
              >
                {initial(s.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px]">
                  {s.name}
                  {s.id === room.youId && <span className="text-ios-label-2"> (você)</span>}
                </span>
                <span className="block text-[13px] text-ios-label-2">
                  {s.missing === 0 ? 'Cartela cheia!' : s.missing === 1 ? 'Falta 1 número' : `Faltam ${s.missing} números`}
                </span>
              </span>
              {game.bingoWinnerId === s.id && <span className="rounded-full bg-ios-green/20 px-2 py-0.5 text-[12px] font-bold text-ios-green">Bingo</span>}
              {game.lineWinnerId === s.id && game.bingoWinnerId !== s.id && (
                <span className="rounded-full bg-ios-blue/20 px-2 py-0.5 text-[12px] font-bold text-ios-blue">Linha</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Fim de jogo: quem levou o quê, a cartela vencedora e o que fazer agora. */
function GameOver({ room, game }: { room: BingoRoomView; game: BingoView }) {
  const { profile } = useClient();
  // Dá pra fechar e ficar olhando a mesa final; a revanche e o "Sair" continuam no menu.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (room.status !== 'finished') setDismissed(false);
  }, [room.status]);
  const open = room.status === 'finished' && !dismissed;
  const isHost = room.hostId === room.youId;
  const name = (id: string | null) => (id === room.youId ? 'Você' : (game.seats.find((s) => s.id === id)?.name ?? '?'));
  const mine = room.results?.find((r) => r.playerId === room.youId);
  const drawn = new Set(game.drawn);
  return (
    <Modal open={open} onClose={() => setDismissed(true)} title="Fim de jogo" followAppearance>
      <div className="space-y-4 text-center">
        <p className="text-6xl">{game.bingoWinnerId === room.youId ? '🏆' : '🎟️'}</p>
        <h3 className="silver-text text-[28px] font-bold tracking-tight">
          {game.bingoWinnerId === room.youId ? 'Bingo! Você ganhou' : `${name(game.bingoWinnerId)} fez Bingo`}
        </h3>
        <div className="glass overflow-hidden text-left">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[17px]">Bingo</span>
            <span className="text-[17px] text-ios-label-2">{name(game.bingoWinnerId)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-ios-separator px-4 py-3">
            <span className="text-[17px]">Linha</span>
            <span className="text-[17px] text-ios-label-2">{name(game.lineWinnerId)}</span>
          </div>
          {mine && !room.money.practice && (
            <div className="flex items-center justify-between border-t border-ios-separator px-4 py-3">
              <span className="text-[17px]">Você recebeu</span>
              <span className={`text-[17px] font-semibold ${mine.amount > 0 ? 'text-ios-green' : 'text-ios-label-2'}`}>
                {mine.amount > 0 ? `+${formatMoney(mine.amount)}` : '—'}
              </span>
            </div>
          )}
        </div>
        {game.winnerCard && (
          <div className="mx-auto grid max-w-[11rem] grid-cols-5 gap-1">
            {game.winnerCard.map((n, i) => (
              <span key={i} className={`grid aspect-square place-items-center rounded-md text-[10px] font-bold ${n === FREE || drawn.has(n) ? 'tint-fill' : 'bg-ios-fill'}`}>
                {n === FREE ? '★' : n}
              </span>
            ))}
          </div>
        )}
        {profile && !room.money.practice && <p className="text-[13px] text-ios-label-2">Saldo agora: {formatMoney(profile.balance)}</p>}
        <div className="space-y-2">
          {isHost ? (
            <button type="button" onClick={() => actions.rematch()} className="tint-fill min-h-[50px] w-full rounded-full text-[17px] font-semibold">
              Jogar de novo
            </button>
          ) : (
            <p className="text-[15px] text-ios-label-2">Esperando o anfitrião chamar a revanche…</p>
          )}
          <button type="button" onClick={() => actions.leave()} className="glass-control min-h-[50px] w-full rounded-full text-[17px] font-semibold text-ios-blue">
            Sair
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Mesa de bingo, no visual iOS do hub (vidro, prata, claro e escuro). */
export function BingoScreen({ room, onHelp }: { room: BingoRoomView; onHelp: () => void }) {
  const game = room.game!;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useBingoEffects(room);
  const drawn = new Set(game.drawn);
  const recent = game.drawn.slice(-7, -1).reverse();
  const pot = room.money.practice ? 0 : room.money.pot;

  return (
    <main className="ios-hub relative min-h-full">
      <div className="ios-wallpaper" aria-hidden />
      <div className="relative z-10 mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-10 lg:max-w-5xl">
        <nav className="relative z-40 flex items-center justify-between py-2">
          <CircleButton label="Menu" onClick={() => setMenuOpen(true)}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M5 7h14M5 12h14M5 17h14" />
            </svg>
          </CircleButton>
          <div className="flex items-center gap-2">
            <VoiceButton buttonClassName={GLASS_BTN} />
            <ChatPanel room={room} opensDown className="relative z-40" buttonClassName={GLASS_BTN} />
            <CircleButton label="Regras" onClick={onHelp}>
              {Symbols.question}
            </CircleButton>
          </div>
        </nav>

        <header className="mt-2 mb-5 flex items-end justify-between gap-3">
          <h1 className="silver-text text-[34px] leading-none font-bold tracking-tight">Bingo</h1>
          <p className="text-right text-[13px] leading-tight text-ios-label-2">
            {pot > 0 ? (
              <>
                Pote <span className="font-semibold text-ios-label tabular-nums">{formatMoney(pot)}</span>
              </>
            ) : (
              'Treino'
            )}
            <br />
            Linha 30% · Bingo 70%
          </p>
        </header>

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
          <div className="space-y-5">
            {/* A bola da vez, com as anteriores ao lado. */}
            <section className="glass flex items-center gap-4 p-4" aria-live="polite">
              <AnimatePresence mode="popLayout" initial={false}>
                {game.lastBall ? (
                  <motion.span
                    key={game.lastBall}
                    initial={{ y: -80, rotate: -120, opacity: 0 }}
                    animate={{ y: 0, rotate: 0, opacity: 1 }}
                    exit={{ x: 60, opacity: 0, scale: 0.5 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                  >
                    <Ball n={game.lastBall} />
                  </motion.span>
                ) : (
                  <span className="grid size-36 shrink-0 place-items-center rounded-full bg-ios-fill text-center text-[13px] text-ios-label-2">
                    Sorteando…
                  </span>
                )}
              </AnimatePresence>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ios-label-2">
                  Bola {game.drawn.length} de {BINGO_BALLS}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recent.map((n) => (
                    <Ball key={n} n={n} size="sm" />
                  ))}
                </div>
              </div>
            </section>

            {!game.isSpectator && (
              <>
                <Card card={game.card} drawn={drawn} lines={game.myLines} last={game.lastBall} />
                <ClaimButtons game={game} pot={pot} />
              </>
            )}
          </div>

          <div className="mt-6 space-y-6 lg:mt-0">
            <Players room={room} game={game} />
            <Board drawn={drawn} />
          </div>
        </div>
      </div>

      <TableMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onHelp={onHelp}
        onLeave={() => {
          setMenuOpen(false);
          setConfirmLeave(true);
        }}
        followAppearance
        tableSettings={false}
      />
      <LeaveDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        followAppearance
        message="Sua cartela continua no jogo, mas ninguém canta por você: só ganha se voltar pelo mesmo link e cantar antes dos outros."
      />
      <GameOver room={room} game={game} />
    </main>
  );
}
