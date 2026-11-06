import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  type Card,
  type TrucoRoomView,
  type TrucoView,
  TRUCO_ONZE,
  TRUCO_TARGET,
  formatMoney,
  trucoCallName,
} from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { haptic, sfx } from '../../lib/sound';
import { actions, useClient } from '../../lib/store';
import { CardBack, PlayingCard } from '../cards/PlayingCard';
import { ChatPanel } from '../ChatPanel';
import { Hand } from '../table/Hand';
import { WaitingBanner } from '../table/Overlays';
import { ReactionBubbles, ReactionPicker } from '../table/Reactions';
import { TableMenu } from '../table/TableMenu';
import { type Point, seatPoint, tableGeometry, tiltFor, trickPoint, useElementSize } from '../table/geometry';
import { Button } from '../ui/Button';
import { LeaveDialog } from '../ui/LeaveDialog';

const TEAM_STYLE = {
  us: { label: 'Nós', dot: 'bg-gold-400', text: 'text-gold-300', ring: 'ring-gold-400/70' },
  them: { label: 'Eles', dot: 'bg-sky-400', text: 'text-sky-300', ring: 'ring-sky-400/70' },
} as const;

function teamStyle(game: TrucoView, team: 0 | 1) {
  return team === game.myTeam ? TEAM_STYLE.us : TEAM_STYLE.them;
}

/** Sons e vibração da mesa de truco. */
function useTrucoEffects(room: TrucoRoomView) {
  const game = room.game;
  const prev = useRef<TrucoView | null>(null);
  const myTurn = !!game && game.actorId === room.youId;

  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    if (!game || !before) return;
    if (game.handNumber !== before.handNumber) sfx.deal(game.seats.length * 3);
    if (game.table.length > before.table.length) sfx.play();
    if (game.request && game.request.value !== before.request?.value) {
      sfx.special();
      haptic([60, 40, 60]);
    }
    if (game.rounds.length > before.rounds.length) {
      const last = game.rounds[game.rounds.length - 1]!;
      if (last.result === game.myTeam) sfx.trickWon();
      else sfx.collect();
    }
    if (game.phase === 'gameOver' && before.phase !== 'gameOver') {
      if (game.winnerTeam === game.myTeam) sfx.win();
      else sfx.lose();
    }
  }, [game]);

  useEffect(() => {
    if (!myTurn) return;
    sfx.turn();
    haptic(40);
  }, [myTurn]);
}

export function TrucoScreen({ room, onHelp }: { room: TrucoRoomView; onHelp: () => void }) {
  const game = room.game!;
  const youId = room.youId;
  const [tableRef, size] = useElementSize<HTMLDivElement>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useTrucoEffects(room);

  const geometry = tableGeometry(size);
  const n = game.seats.length;
  const myIndex = Math.max(0, game.seats.findIndex((s) => s.id === youId));
  const seatK = (i: number) => (i - myIndex + n) % n;
  const seatPoints = new Map<string, Point>(game.seats.map((s, i) => [s.id, seatPoint(seatK(i), n, geometry, size)]));
  const trickSpots = new Map<string, Point>(game.seats.map((s, i) => [s.id, trickPoint(seatK(i), n, geometry)]));

  const hidden = game.special === 'ferro';
  const handCards = game.hand.flatMap((h) => (h.card ? [h.card] : []));

  return (
    <div className="room-bg relative flex h-dvh flex-col overflow-hidden">
      <TrucoHud game={game} onMenu={() => setMenuOpen(true)} />
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

      <div
        ref={tableRef}
        className="relative min-h-0 flex-1"
        style={{ '--table-card-w': `${geometry.tableCardW}px` } as React.CSSProperties}
      >
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

            {/* Vira no meio da mesa, com a manilha embaixo. */}
            <div
              className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: geometry.center.x, top: geometry.center.y }}
            >
              <div className="relative" style={{ width: geometry.tableCardW }}>
                <CardBack className="absolute top-0 -left-[30%] -rotate-6 opacity-90" style={{ width: geometry.tableCardW }} />
                <motion.div
                  key={game.handNumber}
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.35 }}
                  className="relative"
                >
                  <PlayingCard card={game.vira} />
                </motion.div>
              </div>
              <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-semibold text-stone-200 ring-1 ring-gold-500/40">
                Manilha <strong className="text-sm text-gold-300">{game.manilha}</strong>
              </span>
            </div>

            {/* Cartas da vaza em andamento. */}
            <AnimatePresence>
              {game.table.map((p) => {
                const spot = trickSpots.get(p.playerId)!;
                return (
                  <motion.div
                    key={`${game.handNumber}-${game.rounds.length}-${p.playerId}`}
                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: spot.x, top: spot.y, width: geometry.tableCardW }}
                    initial={{ opacity: 0, scale: 0.6, y: 40 }}
                    animate={{ opacity: 1, scale: 1, y: 0, rotate: tiltFor(p.playerId) }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  >
                    <PlayingCard card={p.card} highlight={p.card.rank === game.manilha} />
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {game.seats.map((s) => (
              <TrucoSeat
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
        <TrucoCallBanner game={game} />
        <HandSummary game={game} />
        <TrucoGameOver room={room} />
      </div>

      {game.partnerHand && game.phase === 'maoDeOnze' && <PartnerHand game={game} cards={game.partnerHand.cards} />}
      <TrucoActions game={game} youId={youId} />

      {!game.isSpectator &&
        (hidden ? (
          <HiddenHand game={game} />
        ) : (
          <Hand
            cards={handCards}
            manilhaRank={game.manilha}
            canPlay={game.legal.canPlay}
            dimmed={!game.legal.canPlay}
            onPlay={(id) => actions.play(id)}
            dealDelays={[]}
          />
        ))}

      <LeaveDialog open={confirmLeave} onClose={() => setConfirmLeave(false)} message="Um bot vai jogar no seu lugar. Você pode voltar pelo mesmo link enquanto a partida durar." />
    </div>
  );
}

/** Placar das duplas, quanto a mão vale e as vazas já jogadas, numa cápsula só. */
function TrucoHud({ game, onMenu }: { game: TrucoView; onMenu: () => void }) {
  const themTeam = game.myTeam === 0 ? 1 : 0;
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
      <div
        className="mx-auto grid w-full max-w-[22rem] grid-cols-[1fr_auto_1fr] items-center rounded-[1.4rem] bg-black/45 px-3.5 py-2 shadow-[0_12px_30px_-14px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.12)] ring-1 ring-white/10 backdrop-blur-xl"
        role="group"
        aria-label={`Placar: nós ${game.scores[game.myTeam]}, eles ${game.scores[themTeam]}, a mão vale ${game.value}`}
      >
        <TeamScore label="Nós" score={game.scores[game.myTeam]} other={game.scores[themTeam]} tone="us" />
        <HandValue game={game} />
        <TeamScore label="Eles" score={game.scores[themTeam]} other={game.scores[game.myTeam]} tone="them" />
      </div>
      <span className="w-10 shrink-0" />
    </header>
  );
}

const SCORE_TONE = {
  us: { text: 'text-gold-300', bar: 'bg-gold-400', glow: 'shadow-[0_0_8px_rgb(232_198_106/0.7)]' },
  them: { text: 'text-sky-300', bar: 'bg-sky-400', glow: 'shadow-[0_0_8px_rgb(56_189_248/0.7)]' },
} as const;

/** Uma dupla: nome, pontos e uma régua de 12 tracinhos até a vitória (espelhada pra eles). */
function TeamScore({ label, score, other, tone }: { label: string; score: number; other: number; tone: 'us' | 'them' }) {
  const style = SCORE_TONE[tone];
  const mirrored = tone === 'them';
  const leading = score > other;
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${mirrored ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-baseline gap-1.5 ${mirrored ? 'flex-row-reverse' : ''}`}>
        <span className="text-[11px] font-semibold text-stone-400">{label}</span>
        <motion.strong
          key={score}
          initial={{ scale: 1.5, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          className={`font-display text-[1.75rem] leading-none tabular-nums ${style.text} ${leading ? '' : 'opacity-85'}`}
        >
          {score}
        </motion.strong>
      </div>
      <div className={`flex gap-[2px] ${mirrored ? 'flex-row-reverse' : ''}`} aria-hidden>
        {Array.from({ length: TRUCO_TARGET }, (_, i) => {
          const on = i < score;
          const isLast = i === score - 1;
          return (
            <span
              key={i}
              className={`h-1.5 w-[5px] rounded-full transition-colors duration-300 ${on ? style.bar : 'bg-white/12'} ${
                isLast ? style.glow : ''
              } ${i === TRUCO_ONZE ? (mirrored ? 'mr-[3px]' : 'ml-[3px]') : ''}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/** O meio do placar: quanto a mão vale (e o pedido que levou a isso) e as três vazas. */
function HandValue({ game }: { game: TrucoView }) {
  const raised = game.value > 1 && game.special === 'none';
  const caption =
    game.special === 'onze' ? 'Mão de onze' : game.special === 'ferro' ? 'Mão de ferro' : raised ? trucoCallName(game.value) : 'Vale';
  return (
    <div className="flex flex-col items-center gap-1 px-3">
      <span
        className={`text-[10px] leading-none font-bold whitespace-nowrap ${
          raised ? 'text-red-300' : game.special !== 'none' ? 'text-amber-300' : 'text-stone-400'
        }`}
      >
        {caption}
      </span>
      <motion.span
        key={game.value}
        initial={{ scale: 1.8, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 14 }}
        className={`grid h-8 min-w-8 place-items-center rounded-full px-2 text-base font-black tabular-nums ${
          raised
            ? 'bg-gradient-to-b from-red-500 to-wine-700 text-white shadow-[0_4px_14px_-4px_rgb(220_40_40/0.9)] ring-1 ring-red-300/50'
            : 'bg-white/10 text-stone-100 ring-1 ring-white/15'
        }`}
        aria-label={`A mão vale ${game.value}`}
      >
        {game.value}
      </motion.span>
      <RoundDots game={game} />
    </div>
  );
}

/** As três vazas: dourada (nós), azul (eles), cinza (cangou), vazada (falta jogar). */
function RoundDots({ game }: { game: TrucoView }) {
  const playing = game.rounds.length;
  return (
    <span className="flex gap-1" aria-label="Vazas desta mão">
      {[0, 1, 2].map((i) => {
        const r = game.rounds[i]?.result;
        const label = r === undefined ? 'falta jogar' : r === 'tie' ? 'cangou' : r === game.myTeam ? 'nossa' : 'deles';
        const color =
          r === undefined
            ? i === playing && game.phase !== 'handEnd'
              ? 'bg-transparent ring-1 ring-white/50'
              : 'bg-transparent ring-1 ring-white/15'
            : r === 'tie'
              ? 'bg-stone-400'
              : r === game.myTeam
                ? 'bg-gold-400'
                : 'bg-sky-400';
        return <span key={i} title={`${i + 1}ª vaza: ${label}`} className={`size-2 rounded-full ${color}`} />;
      })}
    </span>
  );
}

function TrucoSeat({
  game,
  seat,
  point,
  isYou,
  connected,
}: {
  game: TrucoView;
  seat: TrucoView['seats'][number];
  point: Point;
  isYou: boolean;
  connected: boolean;
}) {
  const style = teamStyle(game, seat.team);
  const acting = game.actorId === seat.id;
  return (
    <div
      className="absolute z-30 flex w-[100px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: point.x, top: point.y }}
    >
      {!isYou && seat.cardCount > 0 && (
        <div className="flex">
          {Array.from({ length: seat.cardCount }, (_, i) => (
            <CardBack key={i} className={i > 0 ? '-ml-3' : ''} style={{ width: 22 }} />
          ))}
        </div>
      )}
      <div
        className={`relative grid size-12 place-items-center rounded-2xl text-lg font-bold text-white ring-2 transition ${
          acting ? `${style.ring} scale-110 shadow-[0_0_24px_-2px_rgb(255_210_120/0.6)]` : 'ring-white/15'
        } ${connected ? '' : 'opacity-50'}`}
        style={{ background: avatarColor(seat.id) }}
      >
        {initial(seat.name)}
        <span className={`absolute -right-1 -bottom-1 size-3.5 rounded-full ring-2 ring-black/60 ${style.dot}`} />
      </div>
      <span className="max-w-full truncate rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
        {isYou ? 'Você' : seat.name}
        {seat.isDealer && <span className="ml-1 text-gold-300">· pé</span>}
      </span>
    </div>
  );
}

/** Botões de truco, aceitar, correr e aumentar. Só aparecem quando valem algo. */
function TrucoActions({ game, youId }: { game: TrucoView; youId: string }) {
  const [busy, setBusy] = useState(false);
  const { legal } = game;
  const send = async (type: 'truco' | 'accept' | 'run') => {
    setBusy(true);
    await actions.action(type);
    setBusy(false);
  };

  if (game.phase === 'maoDeOnze' && legal.canAccept) {
    const partner = game.partnerHand ? game.seats.find((s) => s.id === game.partnerHand!.playerId)?.name : null;
    return (
      <ActionPanel
        title="Mão de onze"
        text={`Vocês estão com 11${partner ? `: olhe as cartas de ${partner} e decidam juntos` : ''}. Jogar vale 3 pontos; correr dá 1 ponto pra eles. Nesta mão ninguém pede truco.`}
      >
        <Button className="flex-1" disabled={busy} onClick={() => void send('accept')}>
          Jogar a mão
        </Button>
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => void send('run')}>
          Correr
        </Button>
      </ActionPanel>
    );
  }

  if (game.phase === 'maoDeOnze' && !game.isSpectator) {
    // A outra dupla espera a decisão da dupla com 11.
    const deciders = game.seats.filter((s) => s.team !== game.myTeam).map((s) => s.name);
    return (
      <ActionPanel
        title="Mão de onze"
        text={`${deciders.join(' e ')} ${deciders.length > 1 ? 'estão' : 'está'} com 11 e ${
          deciders.length > 1 ? 'decidem' : 'decide'
        } se joga a mão. Se correr, vocês ganham 1 ponto; se jogar, vale 3.`}
      >
        <span className="flex min-h-11 flex-1 items-center justify-center gap-2 text-sm text-stone-300">
          <span className="size-2 animate-pulse rounded-full bg-amber-300" aria-hidden />
          Esperando a decisão
        </span>
      </ActionPanel>
    );
  }

  if (game.phase === 'truco' && legal.canAccept && game.request) {
    const asker = game.seats.find((s) => s.id === game.request!.byPlayerId)?.name ?? 'Alguém';
    return (
      <ActionPanel
        title={`${asker} pediu ${trucoCallName(game.request.value)}!`}
        text={`Aceitar faz a mão valer ${game.request.value}. Correr dá ${game.value} ${game.value === 1 ? 'ponto' : 'pontos'} pra eles.`}
      >
        <Button className="flex-1" disabled={busy} onClick={() => void send('accept')}>
          Aceitar
        </Button>
        {legal.canRaise && legal.nextValue && (
          <Button variant="danger" className="flex-1" disabled={busy} onClick={() => void send('truco')}>
            {trucoCallName(legal.nextValue)}!
          </Button>
        )}
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => void send('run')}>
          Correr
        </Button>
      </ActionPanel>
    );
  }

  if (legal.canAskTruco && legal.nextValue) {
    return (
      <div className="relative z-30 flex justify-center px-3 pt-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          disabled={busy}
          onClick={() => void send('truco')}
          className="min-h-11 rounded-full bg-gradient-to-b from-red-500 to-wine-700 px-6 font-display text-xl font-bold tracking-wide text-white shadow-[0_10px_24px_-10px_rgb(220_40_40/0.9)] ring-2 ring-red-300/50"
        >
          {trucoCallName(legal.nextValue).toUpperCase()}!
        </motion.button>
      </div>
    );
  }
  return null;
}

function ActionPanel({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="relative z-30 mx-3 rounded-2xl bg-felt-900/90 p-3 shadow-xl ring-1 ring-gold-500/40 backdrop-blur"
    >
      <p className="font-display text-lg text-gold-300">{title}</p>
      <p className="mb-2 text-xs text-stone-300">{text}</p>
      <div className="flex gap-2">{children}</div>
    </motion.section>
  );
}

/** Mão de onze: a dupla com 11 vê as cartas do parceiro antes de decidir. */
function PartnerHand({ game, cards }: { game: TrucoView; cards: Card[] }) {
  const name = game.seats.find((s) => s.id === game.partnerHand?.playerId)?.name ?? 'parceiro';
  return (
    <div className="relative z-30 mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-black/40 p-2 ring-1 ring-white/10">
      <span className="text-xs text-stone-300">
        Cartas de <strong className="text-white">{name}</strong>
      </span>
      <div className="flex gap-1">
        {cards.map((c) => (
          <PlayingCard key={`${c.rank}${c.suit}`} card={c} highlight={c.rank === game.manilha} style={{ width: 40 }} />
        ))}
      </div>
    </div>
  );
}

/** Mão de ferro: as cartas vêm viradas e você escolhe no escuro. */
function HiddenHand({ game }: { game: TrucoView }) {
  return (
    <div className="flex min-h-[calc(var(--card-w)*1.4+2.25rem)] flex-col items-center pt-3 pb-3">
      <p className="mb-2 text-xs text-stone-300">Mão de ferro: ninguém vê as próprias cartas.</p>
      <div className="flex gap-2">
        {game.hand.map((h) => (
          <motion.button
            key={h.id}
            type="button"
            whileTap={{ scale: 0.95 }}
            disabled={!game.legal.canPlay}
            onClick={() => void actions.play(h.id)}
            className={game.legal.canPlay ? '' : 'opacity-60'}
            style={{ width: 'var(--card-w)' }}
          >
            <CardBack />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/** O grito de truco no meio da mesa, pra todo mundo ver. */
function TrucoCallBanner({ game }: { game: TrucoView }) {
  const request = game.phase === 'truco' ? game.request : null;
  const asker = request ? game.seats.find((s) => s.id === request.byPlayerId) : null;
  return (
    <AnimatePresence>
      {request && asker && (
        <motion.div
          key={request.value}
          className="pointer-events-none absolute inset-x-0 top-[18%] z-40 flex flex-col items-center"
          initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: -3 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 14 }}
        >
          <span className="font-display text-6xl font-black tracking-wide text-white drop-shadow-[0_6px_0_rgb(120_20_30)] [-webkit-text-stroke:2px_rgb(160_30_40)]">
            {trucoCallName(request.value).toUpperCase()}!
          </span>
          <span className="mt-1 rounded-full bg-black/60 px-3 py-1 text-sm text-stone-200">
            {asker.id === game.viewerId ? 'Você pediu' : `${asker.name} pediu`}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Resultado da mão, enquanto a próxima não é dada. */
function HandSummary({ game }: { game: TrucoView }) {
  const last = game.lastHand;
  const show = game.phase === 'handEnd' && last;
  let text = '';
  if (last) {
    const ran = game.seats.find((s) => s.id === last.ranPlayerId);
    const who = last.team === null ? null : last.team === game.myTeam ? 'Nós' : 'Eles';
    if (last.reason === 'tie') text = 'Tudo cangado: ninguém pontua.';
    else if (last.reason === 'run' || last.reason === 'onzeRun')
      text = `${ran?.id === game.viewerId ? 'Você correu' : `${ran?.name ?? 'Alguém'} correu`}. ${who} +${last.points}`;
    else text = `${who} ${last.team === game.myTeam ? 'levamos' : 'levaram'} a mão: +${last.points}`;
  }
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center px-4"
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <span
            className={`rounded-2xl bg-black/75 px-4 py-2.5 text-center text-base font-semibold shadow-xl ring-1 backdrop-blur ${
              last!.team === game.myTeam ? 'text-gold-200 ring-gold-400/50' : 'text-sky-200 ring-sky-400/40'
            }`}
          >
            {text}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TrucoGameOver({ room }: { room: TrucoRoomView }) {
  const game = room.game;
  const { profile } = useClient();
  if (room.status !== 'finished' || !game || game.winnerTeam === null) return null;
  const youWon = game.winnerTeam === game.myTeam;
  const isHost = room.hostId === room.youId;
  const winners = game.seats.filter((s) => s.team === game.winnerTeam).map((s) => (s.id === room.youId ? 'Você' : s.name));
  const payout = room.results?.find((r) => r.playerId === room.youId);

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
        transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.4 }}
      >
        <div className="text-6xl">{youWon ? '🏆' : '🫠'}</div>
        <h2 className="mt-2 font-display text-3xl gold-text">{youWon ? 'Vocês venceram!' : 'Não foi dessa vez'}</h2>
        <p className="mt-1 text-sm text-stone-300">
          {winners.join(' e ')} · {game.scores[game.winnerTeam]} × {game.scores[game.winnerTeam === 0 ? 1 : 0]}
        </p>
        {payout && !room.money.practice && (
          <p className="mt-3 rounded-xl bg-black/25 p-3 text-sm">
            {payout.amount > 0 ? (
              <span className="font-bold text-emerald-300">+{formatMoney(payout.amount)}</span>
            ) : (
              <span className="text-stone-400">Sem prêmio</span>
            )}
            {profile && <span className="block pt-1 text-xs text-stone-400">Saldo agora: {formatMoney(profile.balance)}</span>}
          </p>
        )}
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

