import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { POKER_TURN_TIMEOUT_MS, type PokerCard, type PokerRoomView, bigBlind, formatMoney } from '@dane-se/shared';
import { usePrefs } from '../../lib/prefs';
import { actions } from '../../lib/store';
import { PokerTable3DView } from '../table3d/PokerTable3DView';
import { Table3DBoundary } from '../table3d/Table3DBoundary';
import { usePokerEffects } from '../../lib/useGameEffects';
import { ChatPanel } from '../ChatPanel';
import { WaitingBanner } from '../table/Overlays';
import { ReactionBubbles, ReactionPicker } from '../table/Reactions';
import { TableMenu } from '../table/TableMenu';
import { type Point, useElementSize } from '../table/geometry';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { CardFace } from './CardFace';
import { PokerControlBar } from './PokerActions';
import { PokerHud } from './PokerHud';
import { PokerGameOver, PokerHandSummary } from './PokerOverlays';
import { PokerSeat } from './PokerSeat';
import { ChipPile, chipCount } from './Chips';
import { pokerGeometry, pokerSeatPoint, betPoint, stackPoint } from './geometry';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Local, cosmetic countdown: the server clock is authoritative, this just mirrors it. */
function useTurnClock(actorId: string | null, active: boolean): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!actorId || !active) {
      setSecondsLeft(null);
      return;
    }
    const start = Date.now();
    setSecondsLeft(Math.ceil(POKER_TURN_TIMEOUT_MS / 1000));
    const timer = setInterval(() => {
      setSecondsLeft(Math.ceil(Math.max(0, POKER_TURN_TIMEOUT_MS - (Date.now() - start)) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [actorId, active]);
  return secondsLeft;
}

export function PokerScreen({ room, onHelp }: { room: PokerRoomView; onHelp: () => void }) {
  const game = room.game!;
  const youId = room.youId;
  const [tableRef, size] = useElementSize<HTMLDivElement>();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  usePokerEffects(room);
  const compact = useMediaQuery('(orientation: landscape) and (max-height: 500px)');
  const { view3d: wantsView3d } = usePrefs();
  const view3d = wantsView3d;

  const geometry = pokerGeometry(size, compact);
  const n = game.seats.length;
  const myIndex = Math.max(0, game.seats.findIndex((s) => s.id === youId));
  const seatK = (i: number) => (i - myIndex + n) % n;

  const seatPoints = new Map<string, Point>(
    game.seats.map((s, i) => [s.id, pokerSeatPoint(seatK(i), n, geometry, size)]),
  );

  const revealed = new Map<string, PokerCard[]>();
  const wonAmounts = new Map<string, number>();
  if (game.phase === 'summary' && game.lastHand) {
    for (const r of game.lastHand.revealed ?? []) revealed.set(r.playerId, r.cards);
    for (const w of game.lastHand.winners) wonAmounts.set(w.playerId, w.amount);
  }

  const actorMember = room.members.find((m) => m.id === game.actorId);
  const onTheClock = !!actorMember && !actorMember.autoPlay && actorMember.connected && game.handPhase === 'betting';
  const turnSecondsLeft = useTurnClock(game.actorId, onTheClock);

  const mySeat = game.seats.find((s) => s.id === youId);
  const unit = bigBlind(game.settings.minBuyIn);
  const totalBets = game.seats.reduce((sum, s) => sum + s.bet, 0);

  return (
    <div className="room-bg relative flex h-dvh flex-col overflow-hidden">
      <PokerHud game={game} youId={youId} onMenu={() => setMenuOpen(true)} />
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
        {view3d && (
          <Table3DBoundary>
            <PokerTable3DView room={room} />
          </Table3DBoundary>
        )}
        {view3d && game.hole.length === 2 && mySeat && !game.isSpectator && (
          <MyHoleCards cards={game.hole} folded={mySeat.folded} />
        )}
        {!view3d && size.width > 0 && (
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

            {/* Community cards + pot, centered on the felt. */}
            <div
              className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
              style={{ left: geometry.center.x, top: geometry.center.y }}
            >
              <span className="flex items-end gap-1.5">
                <ChipPile count={chipCount(game.pot - totalBets, unit, 18)} seed={3} />
                <span className="rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-gold-200 ring-1 ring-gold-500/30">
                  Pote {formatMoney(game.pot)}
                </span>
              </span>
              <div className="flex gap-1">
                {Array.from({ length: 5 }, (_, i) => {
                  const card = game.community[i];
                  return card ? (
                    <motion.div
                      key={`${i}-${card.rank}${card.suit}`}
                      initial={{ opacity: 0, scale: 0.5, y: -12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                    >
                      <CardFace card={card} style={{ width: geometry.boardCardW }} />
                    </motion.div>
                  ) : (
                    <div
                      key={`slot-${i}`}
                      className="rounded-md border border-white/10 bg-black/20"
                      style={{ width: geometry.boardCardW, height: geometry.boardCardW * 1.4 }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Each player's chips on the felt, just inside the rim. */}
            {game.seats.map((s, i) =>
              s.chips > 0 ? (
                <div
                  key={`stack-${s.id}`}
                  className="pointer-events-none absolute z-[4] -translate-x-1/2 -translate-y-full"
                  style={{ left: stackPoint(seatK(i), n, geometry).x, top: stackPoint(seatK(i), n, geometry).y }}
                >
                  <ChipPile count={chipCount(s.chips, unit * 5, 12)} size={14} seed={i} />
                </div>
              ) : null,
            )}

            {/* Street bets, between each seat and the pot. */}
            {game.seats.map((s, i) =>
              s.bet > 0 ? (
                <BetChip key={s.id} point={betPoint(seatK(i), n, geometry)} amount={s.bet} unit={unit} />
              ) : null,
            )}

            {size.width > 0 &&
              game.seats.map((s, i) => {
                const inHand =
                  game.handPhase !== null && !s.folded && (s.bet > 0 || s.allIn || s.chips > 0);
                const point = seatPoints.get(s.id)!;
                return (
                  <PokerSeat
                    key={s.id}
                    seat={s}
                    member={room.members.find((m) => m.id === s.id)}
                    point={point}
                    isYou={s.id === youId}
                    isActor={s.id === game.actorId}
                    hole={s.id === youId ? game.hole : []}
                    revealed={revealed.get(s.id) ?? null}
                    inHand={inHand}
                    holeCardW={geometry.holeCardW}
                    wonAmount={wonAmounts.get(s.id) ?? null}
                    cardsFirst={point.y >= geometry.center.y}
                  />
                );
              })}
          </>
        )}

        {!view3d && <ReactionBubbles seats={seatPoints} />}
        <ReactionPicker />
        <WaitingBanner room={room} />
        <PokerHandSummary game={game} youId={youId} />
        <PokerGameOver room={room} />
      </div>

      <PokerControlBar game={game} youId={youId} turnSecondsLeft={turnSecondsLeft} />

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Sair da partida?">
        <p className="text-stone-300">
          {mySeat && room.status === 'playing'
            ? 'Um bot vai jogar no seu lugar. Sua banca continua na mesa — e você pode voltar pelo mesmo link enquanto a partida durar.'
            : 'Você vai sair desta sala.'}
        </p>
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

function BetChip({ point, amount, unit }: { point: Point; amount: number; unit: number }) {
  return (
    <motion.div
      className="absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 items-end gap-1"
      style={{ left: point.x, top: point.y }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <ChipPile count={chipCount(amount, unit, 6)} size={13} perStack={3} />
      <span className="rounded-full bg-wood-900/90 px-2 py-0.5 font-mono text-[11px] font-bold text-gold-200 ring-1 ring-gold-500/40">
        {formatMoney(amount)}
      </span>
    </motion.div>
  );
}

/** First person: your two hole cards, large at the bottom of the table view. */
function MyHoleCards({ cards, folded }: { cards: PokerCard[]; folded: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-end ${folded ? 'opacity-45 grayscale' : ''}`}
      aria-label="Suas cartas"
    >
      {cards.map((c, i) => (
        <motion.div
          key={`${c.rank}${c.suit}`}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, type: 'spring', stiffness: 220, damping: 20 }}
          style={{ marginLeft: i === 0 ? 0 : -18, rotate: (i - 0.5) * 8 }}
        >
          <CardFace card={c} style={{ width: 'clamp(64px, 7vw + 3vh, 104px)' }} />
        </motion.div>
      ))}
    </div>
  );
}
