import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  type Card,
  type DuvidoRoomView,
  type DuvidoView,
  RANK_PLURAL_PT,
  cardCounts,
  cardId,
  cardStrength,
  claimLabel,
  formatMoney,
} from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { haptic, sfx } from '../../lib/sound';
import { actions, useClient } from '../../lib/store';
import { CardBack, PlayingCard } from '../cards/PlayingCard';
import { ChatPanel } from '../ChatPanel';
import { WaitingBanner } from '../table/Overlays';
import { ReactionBubbles, ReactionPicker } from '../table/Reactions';
import { TableMenu } from '../table/TableMenu';
import { type Point, seatPoint, tableGeometry, useElementSize } from '../table/geometry';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/** Sons e vibração da mesa. */
function useDuvidoEffects(room: DuvidoRoomView) {
  const game = room.game;
  const prev = useRef<DuvidoView | null>(null);
  const myTurn = !!game && game.actorId === room.youId;

  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    if (!game || !before) return;
    if (game.round !== before.round) sfx.deal(game.seats.filter((s) => !s.out).length * 5);
    if (game.pile.length > before.pile.length) sfx.play();
    if (game.reveal && !before.reveal) {
      sfx.special();
      haptic([60, 40, 60]);
    }
    if (game.phase === 'gameOver' && before.phase !== 'gameOver') {
      if (game.winnerId === room.youId) sfx.win();
      else sfx.lose();
    }
  }, [game, room.youId]);

  useEffect(() => {
    if (!myTurn) return;
    sfx.turn();
    haptic(40);
  }, [myTurn]);
}

export function DuvidoScreen({ room, onHelp }: { room: DuvidoRoomView; onHelp: () => void }) {
  const game = room.game!;
  const youId = room.youId;
  const [tableRef, size] = useElementSize<HTMLDivElement>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useDuvidoEffects(room);

  const geometry = tableGeometry(size);
  const n = game.seats.length;
  const myIndex = Math.max(0, game.seats.findIndex((s) => s.id === youId));
  const seatK = (i: number) => (i - myIndex + n) % n;
  const seatPoints = new Map<string, Point>(game.seats.map((s, i) => [s.id, seatPoint(seatK(i), n, geometry, size)]));

  return (
    <div className="room-bg relative flex h-dvh flex-col overflow-hidden">
      <DuvidoHud game={game} onMenu={() => setMenuOpen(true)} />
      <ChatPanel room={room} opensDown className="absolute top-14 right-2 z-40" />
      <TableMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onHelp={onHelp}
        onLeave={() => {
          setMenuOpen(false);
          setConfirmLeave(true);
        }}
      />

      <div ref={tableRef} className="relative min-h-0 flex-1">
        {size.width > 0 && (
          <>
            <div
              className="table-rim absolute rounded-[50%]"
              style={{
                left: geometry.center.x - geometry.rx - 12,
                top: geometry.center.y - geometry.ry - 12,
                width: (geometry.rx + 12) * 2,
                height: (geometry.ry + 12) * 2,
              }}
            >
              <div className="table-felt absolute inset-[12px] rounded-[50%]" />
            </div>

            <Pile game={game} center={geometry.center} cardW={geometry.tableCardW} />

            {game.seats.map((s) => (
              <DuvidoSeat
                key={s.id}
                game={game}
                seat={s}
                point={seatPoints.get(s.id)!}
                isYou={s.id === youId}
                connected={room.members.find((m) => m.id === s.id)?.connected ?? true}
              />
            ))}
          </>
        )}

        <ReactionBubbles seats={seatPoints} />
        <ReactionPicker />
        <WaitingBanner room={room} />
        <RevealOverlay game={game} />
        <DuvidoGameOver room={room} />
      </div>

      {!game.isSpectator && <MyHand game={game} />}

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Sair da partida?">
        <p className="text-stone-300">Um bot vai jogar no seu lugar. Você pode voltar pelo mesmo link enquanto a partida durar.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
            Ficar
          </Button>
          <Button variant="danger" onClick={() => actions.leave()}>
            Sair
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** Topo: o valor da rodada em destaque, o curinga e quantas cartas já estão na mesa. */
function DuvidoHud({ game, onMenu }: { game: DuvidoView; onMenu: () => void }) {
  const onTable = game.pile.reduce((sum, p) => sum + p.count, 0);
  return (
    <header className="safe-top relative z-30 flex items-start gap-2 px-2 pb-1.5">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Menu"
        className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-black/40 text-lg text-stone-200 ring-1 ring-white/10"
      >
        ☰
      </button>
      <div className="mx-auto flex w-full max-w-[22rem] items-center gap-3 rounded-[1.4rem] bg-black/45 px-3.5 py-2 shadow-[0_12px_30px_-14px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.12)] ring-1 ring-white/10 backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-stone-400">Mesa de</p>
          <motion.p
            key={`${game.round}-${game.value}`}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            className="font-display text-[1.6rem] leading-none text-gold-300"
          >
            {RANK_PLURAL_PT[game.value]}
          </motion.p>
        </div>
        {/* A carta mostrada é a vira; o curinga é o valor logo acima dela. */}
        <div
          className="flex items-center gap-1.5 rounded-xl bg-white/8 px-2 py-1 ring-1 ring-white/10"
          title={`Vira ${game.vira.rank}: o curinga é o valor logo acima, ${game.manilha}. Curinga vale como qualquer valor.`}
          aria-label={`Vira ${game.vira.rank}, curinga ${game.manilha}`}
        >
          <span className="flex flex-col items-center">
            <span className="w-6">
              <PlayingCard card={game.vira} />
            </span>
            <span className="text-[9px] leading-none text-stone-400">vira</span>
          </span>
          <span aria-hidden className="text-sm text-stone-500">→</span>
          <span className="text-[11px] leading-tight text-stone-300">
            Curinga
            <strong className="block text-xl leading-none text-gold-300">{game.manilha}</strong>
          </span>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold text-stone-400">Na mesa</p>
          <p className="text-xl leading-none font-bold text-white tabular-nums">{onTable}</p>
        </div>
      </div>
      <span className="w-10 shrink-0" />
    </header>
  );
}

/** As cartas jogadas, viradas, no meio da mesa, e o que a última jogada diz ser. */
function Pile({ game, center, cardW }: { game: DuvidoView; center: Point; cardW: number }) {
  const total = game.pile.reduce((sum, p) => sum + p.count, 0);
  const last = game.lastPlay;
  const lastName = last ? game.seats.find((s) => s.id === last.playerId)?.name : null;
  const shown = Math.min(total, 12);
  return (
    <div
      className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
      style={{ left: center.x, top: center.y }}
    >
      <div className="relative" style={{ width: cardW * 1.3, height: cardW * 1.5 }}>
        {total === 0 ? (
          <div className="absolute inset-0 grid place-items-center rounded-lg border-2 border-dashed border-white/15 text-center text-[11px] text-stone-400">
            Ninguém jogou ainda
          </div>
        ) : (
          Array.from({ length: shown }, (_, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{ width: cardW, left: cardW * 0.15, top: 0 }}
              initial={{ y: 60, opacity: 0, rotate: 0 }}
              animate={{ y: -i * 1.2, opacity: 1, rotate: ((i * 37) % 21) - 10 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
              <CardBack />
            </motion.div>
          ))
        )}
      </div>
      {last && lastName && (
        <motion.span
          key={game.pile.length}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-full bg-black/65 px-3 py-1 text-sm font-semibold text-white ring-1 ring-gold-500/40"
        >
          {lastName}: {claimLabel(last.count, game.value)}
        </motion.span>
      )}
    </div>
  );
}

/** O pote de balas: doces que sobram e a chance da apimentada no próximo castigo. */
function CandyJar({ candies, out, compact = false }: { candies: number; out: boolean; compact?: boolean }) {
  if (out) {
    return <span className="rounded-full bg-red-900/70 px-2 py-0.5 text-[11px] font-bold text-red-100">🌶️ fora</span>;
  }
  const danger = candies <= 2;
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
        danger ? 'bg-red-500/25 text-red-100 ring-red-300/40' : 'bg-black/55 text-stone-100 ring-white/10'
      }`}
      title={`Chance da apimentada no próximo castigo: 1 em ${candies}`}
    >
      🍬 {candies}
      {!compact && <span className="font-normal text-stone-300">· 1 em {candies}</span>}
    </span>
  );
}

function DuvidoSeat({
  game,
  seat,
  point,
  isYou,
  connected,
}: {
  game: DuvidoView;
  seat: DuvidoView['seats'][number];
  point: Point;
  isYou: boolean;
  connected: boolean;
}) {
  const acting = game.actorId === seat.id;
  // Durante o "Duvido!" o resultado do pote ainda é surpresa: mostra como estava antes.
  const suspense = game.phase !== 'playing' && game.reveal?.punishedId === seat.id;
  const out = seat.out && !suspense;
  const candies = suspense && !seat.out ? seat.candies + 1 : seat.candies;
  return (
    <div
      className={`absolute z-30 flex w-[110px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${out ? 'opacity-45 grayscale' : ''}`}
      style={{ left: point.x, top: point.y }}
    >
      {!isYou && seat.cardCount > 0 && (
        <div className="flex">
          {Array.from({ length: seat.cardCount }, (_, i) => (
            <CardBack key={i} className={i > 0 ? '-ml-3' : ''} style={{ width: 20 }} />
          ))}
        </div>
      )}
      <div
        className={`relative grid size-12 place-items-center rounded-2xl text-lg font-bold text-white ring-2 transition ${
          acting ? 'scale-110 shadow-[0_0_24px_-2px_rgb(255_210_120/0.6)] ring-gold-400' : 'ring-white/15'
        } ${connected ? '' : 'opacity-50'}`}
        style={{ background: avatarColor(seat.id) }}
      >
        {initial(seat.name)}
      </div>
      <span className="max-w-full truncate rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
        {isYou ? 'Você' : seat.name}
      </span>
      <CandyJar candies={candies} out={out} compact />
    </div>
  );
}

/** Sua mão: toque pra escolher até 3 cartas, depois jogue (ou grite Duvido!). */
function MyHand({ game }: { game: DuvidoView }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { legal } = game;
  const me = game.seats.find((s) => s.id === game.viewerId);

  // Nova rodada ou mão mudou: limpa a seleção.
  const handKey = game.hand.map(cardId).join(',');
  useEffect(() => setPicked([]), [handKey, game.round]);

  if (!me || me.out) {
    // A notícia de que saiu só aparece depois que o pote abre na tela.
    if (me && game.phase !== 'playing' && game.reveal?.punishedId === me.id) return <div className="safe-bottom min-h-12" />;
    return (
      <div className="safe-bottom px-3 pt-2 text-center text-sm text-stone-400">
        {me?.out ? 'Você pegou a apimentada. Assista o resto da mesa!' : 'Você está assistindo.'}
      </div>
    );
  }

  const sorted = [...game.hand].sort((a, b) => cardStrength(a, game.manilha) - cardStrength(b, game.manilha));
  const toggle = (id: string) => {
    if (!legal.canPlay) return;
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < legal.maxCards ? [...p, id] : p));
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    setPicked([]);
  };
  const lastName = game.lastPlay ? game.seats.find((s) => s.id === game.lastPlay!.playerId)?.name : null;

  return (
    <div className="safe-bottom relative z-30 px-3">
      {(legal.canPlay || legal.canDoubt) && (
        <div className="mb-2 flex gap-2">
          {legal.canDoubt && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              disabled={busy}
              onClick={() => void run(() => actions.action('doubt'))}
              className="min-h-12 flex-1 rounded-2xl bg-gradient-to-b from-red-500 to-wine-700 px-3 font-display text-xl font-bold text-white shadow-[0_10px_24px_-10px_rgb(220_40_40/0.9)] ring-2 ring-red-300/50 disabled:opacity-60"
            >
              Duvido!
              {lastName && <span className="block text-[11px] font-sans font-semibold text-red-100">de {lastName}</span>}
            </motion.button>
          )}
          {legal.canPlay && (
            <button
              type="button"
              disabled={busy || picked.length === 0}
              onClick={() => void run(() => actions.playCards(picked))}
              className="min-h-12 flex-1 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 px-3 text-base font-bold text-wood-900 shadow-[0_3px_0_#8a6a20] transition active:translate-y-[2px] disabled:from-stone-500 disabled:to-stone-600 disabled:text-stone-300 disabled:shadow-none"
            >
              {picked.length === 0 ? `Escolha até ${legal.maxCards} cartas` : `Jogar como ${claimLabel(picked.length, game.value)}`}
            </button>
          )}
        </div>
      )}
      {!legal.canPlay && !legal.canDoubt && game.phase === 'playing' && (
        <p className="mb-2 text-center text-sm text-stone-400">
          Vez de {game.seats.find((s) => s.id === game.actorId)?.name ?? '…'}
        </p>
      )}
      {legal.canDoubt && !legal.canPlay && (
        <p className="mb-2 text-center text-xs text-stone-400">Sem cartas na mão: só dá pra duvidar.</p>
      )}

      <div className="flex min-h-[calc(var(--card-w)*1.4+0.75rem)] justify-center pt-3 pb-2" role="group" aria-label="Sua mão">
        {sorted.map((card, i) => {
          const id = cardId(card);
          const on = picked.includes(id);
          const good = cardCounts(card, game.value, game.manilha);
          return (
            <motion.button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={!legal.canPlay}
              onClick={() => toggle(id)}
              className={`relative shrink-0 rounded-[7.2%/5.15%] ${i > 0 ? '-ml-[calc(var(--card-w)*0.28)]' : ''}`}
              style={{ width: 'var(--card-w)', zIndex: on ? 20 : i }}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: on ? -22 : 0, opacity: 1, rotate: (i - (sorted.length - 1) / 2) * 4 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              <PlayingCard card={card} highlight={card.rank === game.manilha} />
              {good && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white shadow">
                  vale
                </span>
              )}
              {on && <span className="pointer-events-none absolute inset-0 rounded-[7.2%/5.15%] ring-4 ring-gold-400" />}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** "Duvido!": desvira as cartas, mostra o veredito e depois a bala tirada do pote. */
function RevealOverlay({ game }: { game: DuvidoView }) {
  const r = game.reveal;
  const [showJar, setShowJar] = useState(false);
  const key = r ? `${game.round}-${r.doubterId}` : '';
  useEffect(() => {
    setShowJar(false);
    if (!r) return;
    const t = setTimeout(() => setShowJar(true), 1600);
    return () => clearTimeout(t);
  }, [key, r]);
  if (!r || (game.phase !== 'reveal' && game.phase !== 'gameOver')) return null;

  const name = (id: string) => (id === game.viewerId ? 'Você' : (game.seats.find((s) => s.id === id)?.name ?? '?'));
  const punished = name(r.punishedId);
  return (
    <AnimatePresence>
      <motion.div
        key={key}
        className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
          <motion.p
            initial={{ scale: 0.4, rotate: -8 }}
            animate={{ scale: 1, rotate: -3 }}
            transition={{ type: 'spring', stiffness: 320, damping: 14 }}
            className="font-display text-5xl font-black text-white drop-shadow-[0_5px_0_rgb(120_20_30)]"
          >
            Duvido!
          </motion.p>
          <p className="text-sm text-stone-200">
            {name(r.doubterId)} duvidou de {name(r.playerId)}: {claimLabel(r.cards.length, game.value)}
          </p>
          <div className="flex justify-center gap-2">
            {r.cards.map((card: Card, i: number) => {
              const good = cardCounts(card, game.value, game.manilha);
              return (
                <motion.div
                  key={cardId(card)}
                  className="w-16"
                  initial={{ rotateY: 180, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.25, duration: 0.35 }}
                >
                  <PlayingCard card={card} highlight={card.rank === game.manilha} />
                  <span className={`mt-1 block text-xs font-bold ${good ? 'text-emerald-300' : 'text-red-300'}`}>{good ? 'vale' : 'não vale'}</span>
                </motion.div>
              );
            })}
          </div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + r.cards.length * 0.25 }}
            className={`rounded-full px-4 py-1.5 text-lg font-bold ${r.truthful ? 'bg-emerald-600/80 text-white' : 'bg-red-700/85 text-white'}`}
          >
            {r.truthful ? 'Era verdade!' : 'Era mentira!'}
          </motion.p>
          <AnimatePresence>
            {showJar && (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                className={`w-full rounded-2xl p-4 shadow-2xl ring-2 ${
                  r.spicy ? 'bg-red-800/95 ring-red-300' : 'bg-felt-900/95 ring-gold-400/60'
                }`}
              >
                <motion.p
                  className="text-6xl"
                  animate={r.spicy ? { rotate: [0, -12, 12, -8, 0], scale: [1, 1.2, 1] } : { y: [0, -6, 0] }}
                  transition={{ duration: 0.7 }}
                >
                  {r.spicy ? '🌶️' : '🍬'}
                </motion.p>
                <p className="mt-1 text-lg font-bold text-white">
                  {r.spicy ? `Apimentada! ${punished === 'Você' ? 'Você está fora.' : `${punished} está fora.`}` : 'Ufa, era doce.'}
                </p>
                {!r.spicy && (
                  <p className="text-sm text-stone-200">
                    {punished === 'Você' ? 'Você ficou' : `${punished} ficou`} com {r.candiesLeft}{' '}
                    {r.candiesLeft === 1 ? 'bala' : 'balas'}: a próxima é 1 em {r.candiesLeft}.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {!showJar && (
            <p className="text-sm text-stone-300">
              {punished} tira uma bala do pote…
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function DuvidoGameOver({ room }: { room: DuvidoRoomView }) {
  const game = room.game;
  const { profile } = useClient();
  // Espera o pote da última bala aparecer antes do placar final.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (room.status !== 'finished') return setReady(false);
    const t = setTimeout(() => setReady(true), 3200);
    return () => clearTimeout(t);
  }, [room.status]);
  if (room.status !== 'finished' || !game || !ready) return null;
  const youWon = game.winnerId === room.youId;
  const winner = game.seats.find((s) => s.id === game.winnerId);
  const isHost = room.hostId === room.youId;
  const payout = room.results?.find((r) => r.playerId === room.youId);

  return (
    <motion.div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.section
        className="w-full max-w-sm rounded-2xl bg-felt-900 p-5 text-center shadow-2xl ring-2 ring-gold-400"
        initial={{ scale: 0.6, rotate: -4 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
      >
        <div className="text-6xl">{youWon ? '🏆' : '🌶️'}</div>
        <h2 className="mt-2 font-display text-3xl gold-text">{youWon ? 'Você venceu!' : `${winner?.name ?? 'Alguém'} venceu!`}</h2>
        <p className="mt-1 text-sm text-stone-300">Depois de {game.round} rodadas de blefe.</p>
        {payout && !room.money.practice && (
          <p className="mt-3 rounded-xl bg-black/25 p-3 text-sm">
            {payout.amount > 0 ? <span className="font-bold text-emerald-300">+{formatMoney(payout.amount)}</span> : <span className="text-stone-400">Sem prêmio</span>}
            {profile && <span className="block pt-1 text-xs text-stone-400">Saldo agora: {formatMoney(profile.balance)}</span>}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {isHost ? <Button onClick={() => actions.rematch()}>Jogar de novo</Button> : <p className="text-sm text-stone-400">Aguardando o anfitrião chamar a revanche…</p>}
          <Button variant="ghost" onClick={() => actions.leave()}>
            Sair
          </Button>
        </div>
      </motion.section>
    </motion.div>
  );
}
