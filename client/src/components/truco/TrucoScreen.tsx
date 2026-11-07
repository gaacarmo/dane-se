import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
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
import { CircleButton, Symbols } from '../hub/IosKit';
import { LeaveDialog } from '../ui/LeaveDialog';
import { Modal } from '../ui/Modal';
import { VoiceButton } from '../VoiceButton';

/** Nós em laranja, eles em ciano: as cores de sistema do iOS, que mudam no claro e no escuro. */
const TEAM_STYLE = {
  us: { label: 'Nós', dot: 'bg-ios-orange', text: 'text-ios-orange', ring: 'ring-ios-orange' },
  them: { label: 'Eles', dot: 'bg-ios-cyan', text: 'text-ios-cyan', ring: 'ring-ios-cyan' },
} as const;

const GLASS_BTN = 'glass-control grid size-11 place-items-center rounded-full text-lg';

/** Botões no padrão iOS: prata (principal), vidro (secundário) e vermelho (aumentar). */
function Btn({
  tone = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'danger' }) {
  const look =
    tone === 'primary' ? 'tint-fill' : tone === 'danger' ? 'bg-ios-red text-white disabled:opacity-50' : 'glass-control text-ios-blue disabled:opacity-50';
  return (
    <button
      type="button"
      className={`min-h-12 rounded-full px-4 text-[17px] font-semibold transition active:scale-[0.97] ${look} ${className}`}
      {...props}
    />
  );
}

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

  // A mesa treme quando alguém grita truco (ou aumenta).
  const shake = useAnimationControls();
  const callValue = game.phase === 'truco' ? game.request?.value : undefined;
  useEffect(() => {
    if (callValue) void shake.start({ x: [0, -9, 9, -7, 7, -3, 3, 0], transition: { delay: 0.18, duration: 0.45 } });
  }, [callValue, shake]);

  const hidden = game.special === 'ferro';
  const handCards = game.hand.flatMap((h) => (h.card ? [h.card] : []));

  return (
    <main className="ios-hub relative flex h-dvh flex-col overflow-hidden">
      <div className="ios-wallpaper" aria-hidden />

      <nav className="relative z-40 flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <CircleButton label="Menu" onClick={() => setMenuOpen(true)}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </CircleButton>
        <h1 className="silver-text text-[22px] leading-none font-bold tracking-tight">Truco</h1>
        <div className="flex items-center gap-2">
          <VoiceButton buttonClassName={GLASS_BTN} />
          <ChatPanel room={room} opensDown className="relative z-40" buttonClassName={GLASS_BTN} />
          <CircleButton label="Regras" onClick={onHelp}>
            {Symbols.question}
          </CircleButton>
        </div>
      </nav>
      <TrucoHud game={game} />

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

      <motion.div
        ref={tableRef}
        animate={shake}
        className="relative z-10 min-h-0 flex-1"
        style={{ '--table-card-w': `${geometry.tableCardW}px` } as React.CSSProperties}
      >
        {size.width > 0 && (
          <>
            {/* A mesa: borda de metal escovado e tampo grafite, pra as cartas brancas saltarem. */}
            <div
              className="ios-table-rim absolute rounded-[50%]"
              style={{
                left: geometry.center.x - geometry.rx - 12,
                top: geometry.center.y - geometry.ry - 12,
                width: (geometry.rx + 12) * 2,
                height: (geometry.ry + 12) * 2,
              }}
            >
              <div className="ios-table-top absolute inset-[12px] rounded-[50%]" />
            </div>

            {/* O camarão da casa, estampado no meio do tampo, atrás da vira. */}
            <span
              aria-hidden
              className="pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 -rotate-12 select-none"
              style={{
                left: geometry.center.x + geometry.tableCardW * 0.9,
                top: geometry.center.y - geometry.tableCardW * 0.5,
                fontSize: Math.min(geometry.rx, geometry.ry) * 0.62,
                lineHeight: 1,
                filter: 'drop-shadow(0 6px 10px rgb(0 0 0 / 0.35))',
              }}
            >
              🦐
            </span>

            {/* Vira no meio da mesa, com a manilha embaixo. */}
            <div
              className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
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
              <span className="rounded-full bg-black/45 px-3 py-1 text-[12px] font-semibold text-white/75 ring-1 ring-white/15">
                Manilha <strong className="text-[15px] text-white">{game.manilha}</strong>
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
        <ReactionPicker ios />
        <WaitingBanner room={room} ios />
        <TrucoCallBanner game={game} />
        <HandSummary game={game} />
      </motion.div>

      <div className="relative z-20">
        {game.partnerHand && game.phase === 'maoDeOnze' && <PartnerHand game={game} cards={game.partnerHand.cards} />}
        <TrucoActions game={game} youId={youId} />

        {!game.isSpectator &&
          (hidden ? (
            <HiddenHand game={game} />
          ) : (
            <div className="relative">
              <Hand
                cards={handCards}
                manilhaRank={game.manilha}
                canPlay={game.legal.canPlay}
                dimmed={!game.legal.canPlay}
                onPlay={(id) => actions.play(id)}
                dealDelays={[]}
              />
              {game.legal.canSwap && <SwapButton key={handCards.map((c) => `${c.rank}${c.suit}`).join(',')} />}
            </div>
          ))}
      </div>

      <LeaveDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        followAppearance
        message="Um bot vai jogar no seu lugar. Você pode voltar pelo mesmo link enquanto a partida durar."
      />
      <TrucoGameOver room={room} />
    </main>
  );
}

/** Placar das duplas, quanto a mão vale e as vazas já jogadas, numa cápsula só. */
function TrucoHud({ game }: { game: TrucoView }) {
  const themTeam = game.myTeam === 0 ? 1 : 0;
  return (
    <header className="relative z-30 px-3 pt-2 pb-1">
      <div
        className="glass mx-auto grid w-full max-w-[22rem] grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5"
        role="group"
        aria-label={`Placar: nós ${game.scores[game.myTeam]}, eles ${game.scores[themTeam]}, a mão vale ${game.value}`}
      >
        <TeamScore label="Nós" score={game.scores[game.myTeam]} other={game.scores[themTeam]} tone="us" />
        <HandValue game={game} />
        <TeamScore label="Eles" score={game.scores[themTeam]} other={game.scores[game.myTeam]} tone="them" />
      </div>
    </header>
  );
}

const SCORE_TONE = {
  us: { text: 'text-ios-orange', bar: 'bg-ios-orange' },
  them: { text: 'text-ios-cyan', bar: 'bg-ios-cyan' },
} as const;

/** Uma dupla: nome, pontos e uma régua de 12 tracinhos até a vitória (espelhada pra eles). */
function TeamScore({ label, score, other, tone }: { label: string; score: number; other: number; tone: 'us' | 'them' }) {
  const style = SCORE_TONE[tone];
  const mirrored = tone === 'them';
  const leading = score > other;
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${mirrored ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-baseline gap-1.5 ${mirrored ? 'flex-row-reverse' : ''}`}>
        <span className="text-[13px] font-semibold text-ios-label-2">{label}</span>
        <motion.strong
          key={score}
          initial={{ scale: 1.5, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          className={`text-[30px] leading-none font-bold tracking-tight tabular-nums ${style.text} ${leading ? '' : 'opacity-80'}`}
        >
          {score}
        </motion.strong>
      </div>
      <div className={`flex gap-[2px] ${mirrored ? 'flex-row-reverse' : ''}`} aria-hidden>
        {Array.from({ length: TRUCO_TARGET }, (_, i) => {
          const on = i < score;
          return (
            <span
              key={i}
              className={`h-1.5 w-[5px] rounded-full transition-colors duration-300 ${on ? style.bar : 'bg-ios-fill-strong'} ${
                i === TRUCO_ONZE ? (mirrored ? 'mr-[3px]' : 'ml-[3px]') : ''
              }`}
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
        className={`text-[11px] leading-none font-semibold whitespace-nowrap ${
          raised ? 'text-ios-red' : game.special !== 'none' ? 'text-ios-orange' : 'text-ios-label-2'
        }`}
      >
        {caption}
      </span>
      <motion.span
        key={game.value}
        initial={{ scale: 1.8, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 14 }}
        className={`grid h-8 min-w-8 place-items-center rounded-full px-2 text-[17px] font-bold tabular-nums ${
          raised ? 'bg-ios-red text-white' : 'bg-ios-fill-strong text-ios-label'
        }`}
        aria-label={`A mão vale ${game.value}`}
      >
        {game.value}
      </motion.span>
      <RoundDots game={game} />
    </div>
  );
}

/** As três vazas: laranja (nós), ciano (eles), cinza (cangou), vazada (falta jogar). */
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
              ? 'bg-transparent ring-1 ring-ios-label-2'
              : 'bg-transparent ring-1 ring-ios-separator'
            : r === 'tie'
              ? 'bg-ios-label-3'
              : r === game.myTeam
                ? 'bg-ios-orange'
                : 'bg-ios-cyan';
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
        className={`relative grid size-12 place-items-center rounded-full text-[19px] font-semibold text-white transition ${
          acting ? `ring-[3px] ${style.ring} scale-110` : 'ring-2 ring-ios-separator'
        } ${connected ? '' : 'opacity-50'}`}
        style={{ background: avatarColor(seat.id) }}
      >
        {initial(seat.name)}
        <span className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-[var(--ios-base)] ${style.dot}`} />
      </div>
      <span className="glass-control max-w-full truncate rounded-full px-2.5 py-0.5 text-[12px] font-semibold text-ios-label">
        {isYou ? 'Você' : seat.name}
        {seat.isDealer && <span className="ml-1 text-ios-label-2">· pé</span>}
      </span>
      {seat.swapped && (
        <span className="glass-control rounded-full px-2 py-0.5 text-[11px] font-semibold text-ios-label-2">🤡 trocou</span>
      )}
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
        <Btn className="flex-1" disabled={busy} onClick={() => void send('accept')}>
          Jogar a mão
        </Btn>
        <Btn tone="secondary" className="flex-1" disabled={busy} onClick={() => void send('run')}>
          Correr
        </Btn>
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
        <span className="flex min-h-11 flex-1 items-center justify-center gap-2 text-[15px] text-ios-label-2">
          <span className="size-2 animate-pulse rounded-full bg-ios-orange" aria-hidden />
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
        <Btn className="flex-1" disabled={busy} onClick={() => void send('accept')}>
          Aceitar
        </Btn>
        {legal.canRaise && legal.nextValue && (
          <Btn tone="danger" className="flex-1" disabled={busy} onClick={() => void send('truco')}>
            {trucoCallName(legal.nextValue)}!
          </Btn>
        )}
        <Btn tone="secondary" className="flex-1" disabled={busy} onClick={() => void send('run')}>
          Correr
        </Btn>
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
          className="min-h-12 rounded-full bg-ios-red px-8 text-[19px] font-bold tracking-tight text-white shadow-[0_10px_24px_-10px_rgb(255_59_48/0.8)] disabled:opacity-50"
        >
          {trucoCallName(legal.nextValue)}!
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
      className="glass glass-thick relative z-30 mx-auto w-[calc(100%-1.5rem)] max-w-md p-4"
    >
      <p className="text-[17px] font-semibold text-ios-label">{title}</p>
      <p className="mt-0.5 mb-3 text-[13px] leading-snug text-ios-label-2">{text}</p>
      <div className="flex gap-2">{children}</div>
    </motion.section>
  );
}

/** Mão de onze: a dupla com 11 vê as cartas do parceiro antes de decidir. */
function PartnerHand({ game, cards }: { game: TrucoView; cards: Card[] }) {
  const name = game.seats.find((s) => s.id === game.partnerHand?.playerId)?.name ?? 'parceiro';
  return (
    <div className="glass relative z-30 mx-auto mb-2 flex w-[calc(100%-1.5rem)] max-w-md items-center gap-3 rounded-2xl! p-2.5 pl-4">
      <span className="flex-1 text-[13px] text-ios-label-2">
        Cartas de <strong className="font-semibold text-ios-label">{name}</strong>
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
      <p className="mb-2 text-[13px] text-ios-label-2">Mão de ferro: ninguém vê as próprias cartas.</p>
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

/** Tempo mínimo do grito de truco na tela. */
const CALL_MIN_MS = 1700;

/**
 * O grito de truco: clarão vermelho, uma onda saindo do centro e as letras
 * caindo uma a uma na mesa, com um tranco no fim. Seis, nove e doze repetem,
 * cada vez mais forte.
 */
function TrucoCallBanner({ game }: { game: TrucoView }) {
  const live = game.phase === 'truco' ? game.request : null;
  // Os bots respondem em menos de um segundo: o grito fica na tela um tempo mínimo
  // mesmo depois de aceito ou corrido, senão a animação some no meio.
  const [request, setRequest] = useState<{ value: number; byPlayerId: string; at: number } | null>(null);
  useEffect(() => {
    if (live) setRequest({ value: live.value, byPlayerId: live.byPlayerId, at: Date.now() });
  }, [live?.value, live?.byPlayerId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!request || live?.value === request.value) return;
    const t = setTimeout(() => setRequest(null), Math.max(0, CALL_MIN_MS - (Date.now() - request.at)));
    return () => clearTimeout(t);
  }, [request, live?.value]);
  const asker = request ? game.seats.find((s) => s.id === request.byPlayerId) : null;
  const word = request ? `${trucoCallName(request.value).toUpperCase()}!` : '';
  // Quanto maior o pedido, maior o tranco.
  const power = request ? Math.min(1, request.value / 12) : 0;
  return (
    <AnimatePresence>
      {request && asker && (
        <motion.div key={request.value} className="pointer-events-none absolute inset-0 z-40" exit={{ opacity: 0, transition: { duration: 0.25 } }}>
          {/* Clarão. */}
          <motion.div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 32%, rgb(255 59 48 / 0.45), transparent 70%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.35] }}
            transition={{ duration: 0.7, times: [0, 0.2, 1] }}
          />
          {/* Ondas de choque. */}
          {[0, 0.12].map((delay) => (
            <motion.span
              key={delay}
              className="absolute top-[30%] left-1/2 size-32 rounded-full border-[3px] border-ios-red"
              style={{ x: '-50%', y: '-50%' }}
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 3.2 + power, opacity: 0 }}
              transition={{ delay, duration: 0.75, ease: 'easeOut' }}
            />
          ))}

          <div className="absolute inset-x-0 top-[30%] flex -translate-y-1/2 flex-col items-center">
            <motion.div
              className="flex items-center rounded-[2rem] bg-[var(--solid-surface)]/90 px-7 py-3 shadow-[0_24px_60px_-20px_rgb(255_59_48/0.7)] ring-1 ring-ios-red/40"
              initial={{ scale: 0.4, rotate: -10 }}
              animate={{ scale: [0.4, 1.12 + power * 0.1, 1], rotate: [-10, 3, -2] }}
              transition={{ duration: 0.5, times: [0, 0.6, 1], ease: 'easeOut' }}
            >
              {[...word].map((ch, i) => (
                <motion.span
                  key={i}
                  className="inline-block text-[44px] leading-none font-black tracking-tight text-ios-red"
                  initial={{ y: -70, opacity: 0, rotate: i % 2 ? 25 : -25, scale: 1.6 }}
                  animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
                  transition={{ delay: 0.05 + i * 0.045, type: 'spring', stiffness: 520, damping: 16 }}
                >
                  {ch}
                </motion.span>
              ))}
            </motion.div>
            <motion.span
              className="mt-2 rounded-full bg-[var(--solid-surface)]/85 px-3.5 py-1 text-[15px] font-semibold text-ios-label shadow-lg"
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35 + word.length * 0.045 }}
            >
              {asker.id === game.viewerId ? 'Você pediu' : `${asker.name} pediu`}
            </motion.span>
          </div>
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
            className={`glass glass-thick rounded-2xl! px-5 py-3 text-center text-[17px] font-semibold ${
              last!.team === null ? 'text-ios-label' : last!.team === game.myTeam ? 'text-ios-orange' : 'text-ios-cyan'
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
  // Dá pra fechar e olhar a mesa final; revanche e "Sair" continuam no menu.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (room.status !== 'finished') setDismissed(false);
  }, [room.status]);
  if (!game || game.winnerTeam === null) return null;
  const open = room.status === 'finished' && !dismissed;
  const youWon = game.winnerTeam === game.myTeam;
  const isHost = room.hostId === room.youId;
  const winners = game.seats.filter((s) => s.team === game.winnerTeam).map((s) => (s.id === room.youId ? 'Você' : s.name));
  const payout = room.results?.find((r) => r.playerId === room.youId);

  return (
    <Modal open={open} onClose={() => setDismissed(true)} title="Fim de jogo" followAppearance>
      <div className="space-y-4 text-center">
        <p className="text-6xl">{youWon ? '🏆' : '🫠'}</p>
        <h3 className="silver-text text-[28px] font-bold tracking-tight">{youWon ? 'Vocês venceram!' : 'Não foi dessa vez'}</h3>
        <div className="glass overflow-hidden text-left">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[17px]">Placar</span>
            <span className="text-[17px] font-semibold tabular-nums">
              <span className="text-ios-orange">{game.scores[game.myTeam]}</span>
              <span className="text-ios-label-3"> × </span>
              <span className="text-ios-cyan">{game.scores[game.myTeam === 0 ? 1 : 0]}</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-ios-separator px-4 py-3">
            <span className="text-[17px]">Venceu</span>
            <span className="truncate text-[17px] text-ios-label-2">{winners.join(' e ')}</span>
          </div>
          {payout && !room.money.practice && (
            <div className="flex items-center justify-between border-t border-ios-separator px-4 py-3">
              <span className="text-[17px]">Você recebeu</span>
              <span className={`text-[17px] font-semibold ${payout.amount > 0 ? 'text-ios-green' : 'text-ios-label-2'}`}>
                {payout.amount > 0 ? `+${formatMoney(payout.amount)}` : '—'}
              </span>
            </div>
          )}
        </div>
        {profile && !room.money.practice && <p className="text-[13px] text-ios-label-2">Saldo agora: {formatMoney(profile.balance)}</p>}
        <div className="space-y-2">
          {isHost ? (
            <Btn className="w-full" onClick={() => actions.rematch()}>
              Jogar de novo
            </Btn>
          ) : (
            <p className="text-[15px] text-ios-label-2">Esperando o anfitrião chamar a revanche…</p>
          )}
          <Btn tone="secondary" className="w-full" onClick={() => actions.leave()}>
            Sair
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Regra da casa: com 3 palhaços (Q, J, K) na mão, aparece do lado das cartas pra trocar as 3. */
function SwapButton() {
  const [busy, setBusy] = useState(false);
  return (
    <motion.button
      type="button"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.92 }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await actions.action('swap');
        setBusy(false);
      }}
      className="glass absolute top-1/2 right-[max(0.5rem,calc(50%-var(--card-w)*1.3-5.5rem))] z-30 flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-2xl! px-3 py-2 text-ios-label disabled:opacity-60"
      aria-label="Trocar os 3 palhaços por cartas novas"
    >
      <span className="text-2xl leading-none">🤡</span>
      <span className="text-[12px] leading-tight font-semibold">
        Trocar
        <br />3 palhaços
      </span>
    </motion.button>
  );
}
