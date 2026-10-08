import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { type PlayerView, type PublicPlayer, type RoomView, wordLetters } from '@dane-se/shared';
import { actions } from '../../lib/store';
import { useGameEffects } from '../../lib/useGameEffects';
import { Shrimp } from '../cards/Shrimp';
import { ChatPanel } from '../ChatPanel';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { BetBar } from './BetBar';
import { CenterPile } from './CenterPile';
import { DealAnimation, dealOrder, dealTiming } from './DealAnimation';
import { type Point, foreheadSpace, seatPoint, tableGeometry, trickPoint, useElementSize } from './geometry';
import { Hand } from './Hand';
import { Hud } from './Hud';
import { Letters } from './Letters';
import { MyStatus } from './MyStatus';
import { Scoreboard } from './Scoreboard';
import { ViraPanel } from './ViraPanel';
import { GameOver, RoundSummary, WaitingBanner } from './Overlays';
import { ReactionBubbles, ReactionPicker } from './Reactions';
import { Seat } from './Seat';
import { TableMenu } from './TableMenu';
import { TrickArea, TrickResultLabel } from './TrickArea';
import { Table3DView } from '../table3d/Table3DView';
import { usePrefs } from '../../lib/prefs';

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

/**
 * True while the cards of a freshly dealt round are flying out. Decided the
 * first time we see a round, so reloading mid-round doesn't replay the deal.
 */
function useDealing(roundKey: string, fresh: boolean, totalSeconds: number): boolean {
  const seen = useRef(new Map<string, boolean>());
  if (!seen.current.has(roundKey)) seen.current.set(roundKey, fresh);
  const [doneKey, setDoneKey] = useState<string | null>(null);

  useEffect(() => {
    if (!seen.current.get(roundKey)) return;
    const t = setTimeout(() => setDoneKey(roundKey), totalSeconds * 1000 + 300);
    return () => clearTimeout(t);
  }, [roundKey, totalSeconds]);

  return seen.current.get(roundKey)! && doneKey !== roundKey;
}

export function GameScreen({ room, onHelp }: { room: RoomView; onHelp: () => void }) {
  const game = room.game!;
  const youId = room.youId;
  const [tableRef, size] = useElementSize<HTMLDivElement>();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useGameEffects(room);
  const compact = useMediaQuery('(orientation: landscape) and (max-height: 500px)');
  const seatScale = compact ? 0.8 : 1;
  const { view3d } = usePrefs();

  const geometry = tableGeometry(size, compact);
  const n = game.players.length;
  const myIndex = Math.max(0, game.players.findIndex((p) => p.id === youId));
  const extraTop = game.blindRound ? foreheadSpace(geometry) : 0;
  const seatIndex = (i: number) => (i - myIndex + n) % n;
  const seats = new Map<string, Point>(
    game.players.map((p, i) => [p.id, seatPoint(seatIndex(i), n, geometry, size, extraTop, seatScale)]),
  );
  const trickSpots = new Map<string, Point>(game.players.map((p, i) => [p.id, trickPoint(seatIndex(i), n, geometry)]));

  const roundKey = String(game.roundNumber);
  const order = dealOrder(game);
  const fresh = game.phase === 'betting' && game.players.every((p) => p.bet === null);
  const timingIfDealing = dealTiming(game.cardsPerPlayer, order.length, true);
  const dealing = useDealing(roundKey, fresh, timingIfDealing.total);
  const timing = dealing ? timingIfDealing : dealTiming(game.cardsPerPlayer, order.length, false);

  const myDealPos = order.indexOf(youId);
  const handDelays = dealing && myDealPos >= 0 ? game.hand.map((_, c) => timing.landAt(c, myDealPos)) : [];
  const word = wordLetters(game.settings.word);
  const me = game.players.find((p) => p.id === youId);
  const myTurn = game.turnPlayerId === youId;
  const canPlay = myTurn && game.phase === 'playing';
  const turnPlayer = game.players.find((p) => p.id === game.turnPlayerId);

  return (
    <div
      className="room-bg relative flex h-dvh flex-col overflow-hidden"
      style={
        {
          '--table-card-w': `${geometry.tableCardW}px`,
          '--seat-card-w': `${geometry.seatCardW}px`,
        } as React.CSSProperties
      }
    >
      <Hud game={game} showVira={compact} onMenu={() => setMenuOpen(true)} />
      <ChatPanel room={room} opensDown className="absolute top-14 right-2 z-40" />
      <TableMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onHelp={onHelp}
        onLeave={() => setConfirmLeave(true)}
      />

      <div ref={tableRef} className="relative min-h-0 flex-1">
        {view3d && <Table3DView room={room} />}
        {!view3d && size.width > 0 && (
          <>
            {/* The table: wooden rim + felt. */}
            <div
              className="table-rim absolute rounded-[50%]"
              style={{
                left: geometry.center.x - geometry.rx - 14,
                top: geometry.center.y - geometry.ry - 14,
                width: (geometry.rx + 14) * 2,
                height: (geometry.ry + 14) * 2,
              }}
            >
              <div className="table-felt absolute inset-[14px] rounded-[50%]" />
            </div>

            {/* Mascot printed on the felt, like a club logo. */}
            <Shrimp
              variant="mono"
              tone="#000"
              line="rgb(255 255 255 / 0.55)"
              title=""
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 opacity-20"
              style={{
                left: geometry.center.x + geometry.rx * 0.5,
                top: geometry.center.y + geometry.ry * 0.42,
                width: Math.min(64, geometry.rx * 0.32),
                rotate: '-12deg',
              }}
            />

            {!compact && (
              <CenterPile
                center={geometry.center}
                vira={game.vira}
                manilhaRank={game.manilhaRank}
                flipDelay={timing.total}
                roundKey={roundKey}
              />
            )}

            {game.players.map((p) => {
              const j = order.indexOf(p.id);
              // In compact mode your own info is shown in the bottom bar instead.
              if (compact && p.id === youId) return null;
              return (
                <Seat
                  key={p.id}
                  player={p}
                  member={room.members.find((m) => m.id === p.id)}
                  point={seats.get(p.id)!}
                  word={word}
                  isYou={p.id === youId}
                  isTurn={p.id === game.turnPlayerId && (game.phase === 'betting' || game.phase === 'playing')}
                  blindRound={game.blindRound}
                  fanLeft={seats.get(p.id)!.x > geometry.center.x + 1}
                  manilhaRank={game.manilhaRank}
                  dealDelay={j >= 0 ? timing.landAt(game.cardsPerPlayer - 1, j) : 0}
                  roundKey={roundKey}
                  scale={seatScale}
                />
              );
            })}

            <TrickArea game={game} youId={youId} seats={seats} spots={trickSpots} center={geometry.center} />
            <TrickResultLabel game={game} spots={trickSpots} center={geometry.center} />

            {dealing && (
              <DealAnimation
                order={order}
                cardsPerPlayer={game.cardsPerPlayer}
                from={geometry.center}
                seats={seats}
                timing={timing}
                roundKey={roundKey}
              />
            )}
          </>
        )}

        {!view3d && size.width > 0 && <ReactionBubbles seats={seats} />}
        {view3d && (
          <div
            className={`pointer-events-none absolute z-30 flex flex-col items-end gap-2 ${compact ? 'top-14 right-16' : 'top-32 right-2'}`}
          >
            {!compact && <Scoreboard room={room} />}
            <ViraPanel vira={game.vira} manilhaRank={game.manilhaRank} roundKey={game.roundNumber} />
          </div>
        )}
        {view3d && me && !game.isSpectator && !me.eliminated && <MyStatus game={game} me={me} word={word} compact={compact} />}
        <ReactionPicker atTop={compact} />
        <WaitingBanner room={room} />
        <RoundSummary game={game} />
        <GameOver room={room} />
      </div>

      <BottomPanel
        game={game}
        me={me}
        word={word}
        compact={compact}
        isSpectator={game.isSpectator || !me || me.eliminated}
        myTurn={myTurn}
        canPlay={canPlay}
        turnName={turnPlayer?.name}
        handDelays={handDelays}
        dealing={dealing}
        overlay={view3d}
      />

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Sair da partida?">
        <p className="text-stone-300">
          {me && !me.eliminated && room.status === 'playing'
            ? 'Um bot vai jogar no seu lugar. Você pode voltar pelo mesmo link enquanto a partida durar.'
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

function BottomPanel({
  game,
  me,
  word,
  compact,
  isSpectator,
  myTurn,
  canPlay,
  turnName,
  handDelays,
  dealing,
  overlay,
}: {
  game: PlayerView;
  me: PublicPlayer | undefined;
  word: string[];
  /** Short landscape screens: everything in one row, and your seat info lives here. */
  compact: boolean;
  isSpectator: boolean;
  myTurn: boolean;
  canPlay: boolean;
  turnName: string | undefined;
  handDelays: number[];
  dealing: boolean;
  /** First-person view: the panel floats over the bottom of the 3D scene. */
  overlay: boolean;
}) {
  const betting = game.phase === 'betting';
  let status: string;
  let hint = '';
  if (isSpectator) status = 'Você está assistindo 👀';
  else if (betting) status = myTurn ? 'Sua vez de palpitar!' : `Aguardando o palpite de ${turnName ?? '…'}`;
  else if (game.phase === 'playing') {
    status = myTurn ? 'Sua vez de jogar!' : `Vez de ${turnName ?? '…'}`;
    if (myTurn && !game.blindRound) hint = 'Toque duas vezes na carta ou arraste pra mesa';
  } else if (game.phase === 'trickEnd') status = 'Recolhendo a vaza…';
  else status = '';

  const statusEl = (
    <motion.p
      key={status}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`font-semibold ${compact ? 'text-xs' : 'px-3 pt-2 text-center text-sm'} ${myTurn ? 'text-gold-300' : 'text-stone-300'}`}
      role="status"
    >
      {status}
      {hint && !compact && <span className="block text-xs font-normal text-stone-400">{hint}</span>}
    </motion.p>
  );

  const betEl = !isSpectator && betting && myTurn && !dealing && (
    <BetBar game={game} compact={compact} onBet={(bet) => actions.bet(bet)} />
  );

  const handEl = isSpectator ? null : !game.blindRound ? (
    <Hand
      cards={game.hand}
      manilhaRank={game.manilhaRank}
      canPlay={canPlay}
      dimmed={!canPlay && !betting}
      onPlay={(id) => actions.play(id)}
      dealDelays={handDelays}
      peek={overlay}
    />
  ) : (
    <div
      className={`flex items-center justify-center px-3 ${
        // No hand to make room for (first person, or the bet bar is showing): don't reserve its height.
        overlay || betEl ? 'min-h-4 pb-3' : 'min-h-[calc(var(--card-w)*1.4+2.25rem)]'
      }`}
    >
      {canPlay ? (
        <Button className="text-lg" onClick={() => actions.play()}>
          🃏 Jogar a carta da testa
        </Button>
      ) : (
        !betEl && <p className="max-w-xs text-center text-xs text-stone-400">
          Rodada cega: sua carta está na sua testa. Você vê a de todo mundo, menos a sua!
        </p>
      )}
    </div>
  );

  const highlight = myTurn && !isSpectator && (betting || game.phase === 'playing');
  const panelStyle = overlay ? ({ '--card-w': 'clamp(46px, 6vh + 2.4vw, 84px)' } as React.CSSProperties) : undefined;
  const panelClass = overlay
    ? `safe-bottom pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/75 to-transparent pt-16 [&>*]:pointer-events-auto`
    : `safe-bottom relative z-20 shrink-0 transition-colors ${highlight ? 'bg-gold-500/15' : 'bg-black/30'}`;

  if (compact) {
    return (
      <div className={`${panelClass} flex items-end gap-2 px-2`} style={panelStyle}>
        <div className="w-32 shrink-0 space-y-1 pb-2">
          {statusEl}
          {me && !isSpectator && !overlay && (
            <div className="space-y-1">
              <Letters word={word} lost={me.letters} compact />
              <div className="flex gap-1 text-[11px] leading-none">
                <span className="rounded bg-black/55 px-1.5 py-1">🎯 {me.bet ?? '–'}</span>
                <span className="rounded bg-black/55 px-1.5 py-1">✋ {me.tricksWon}</span>
                {me.isDealer && <span className="rounded bg-paper px-1.5 py-1 font-black text-wood-900">PÉ</span>}
              </div>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">{handEl}</div>
        {betEl && <div className="max-w-[45%] shrink-0 pb-2">{betEl}</div>}
      </div>
    );
  }

  return (
    <div className={panelClass} style={panelStyle}>
      {statusEl}
      {betEl && <div className="pt-2">{betEl}</div>}
      {handEl}
    </div>
  );
}
