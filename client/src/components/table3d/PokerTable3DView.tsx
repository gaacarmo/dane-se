import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  type PokerCard,
  type PokerRoomView,
  type PokerSeatView,
  type RoomMember,
  bigBlind,
  formatMoney,
  pokerCardId,
} from '@dane-se/shared';
import { pokerCardTexture } from '../../lib/cardTextures';
import { CARD_H, CARD_W, Card3D } from './Card3D';
import { Scene3D, TABLE_Y, seatPosition } from './Scene3D';
import { WatchSwitcher, useWatchedSeat } from './WatchSwitcher';
import { Bubble, Reactions3D, VIRA_LEAN, useContactShadow, useNow, useReactionSound } from './Table3DView';

const TOP = TABLE_Y + 0.006;
const BUBBLE_MS = 6000;
/** The five community cards stand in a row in the middle, leaning back like the vira so they read from any seat. */
const BOARD_SCALE = 1.05;
const BOARD_GAP = 0.2;
const BOARD_Z = 0.12;

/** A card that pops up when it appears (new street). */
function PopIn({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (g) g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, 1, 9, dt));
  });
  return (
    <group ref={ref} scale={0.01}>
      {children}
    </group>
  );
}

/** One community card propped up on a thin base, facing the viewer. */
function BoardCard({ card, x }: { card: PokerCard; x: number }) {
  const shadow = useContactShadow();
  const face = useMemo(() => pokerCardTexture(card), [card]);
  const lift = (CARD_H / 2) * Math.sin(VIRA_LEAN) + 0.004;
  return (
    <group position={[x, TOP, BOARD_Z]} scale={BOARD_SCALE}>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.3, 0.32]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      <PopIn>
        <mesh position={[0, 0.006, (CARD_H / 2) * Math.cos(VIRA_LEAN) + 0.004]}>
          <boxGeometry args={[CARD_W + 0.03, 0.012, 0.028]} />
          <meshStandardMaterial color="#5a3a1f" roughness={0.6} />
        </mesh>
        <group position={[0, lift, 0]} rotation={[-(Math.PI / 2 - VIRA_LEAN), 0, 0]}>
          <Card3D card={null} face={face} />
        </group>
      </PopIn>
    </group>
  );
}

/** Where a community card that hasn't been dealt yet goes. */
function EmptySlot({ x }: { x: number }) {
  return (
    <mesh position={[x, TOP + 0.001, BOARD_Z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[CARD_W * BOARD_SCALE * 0.9, CARD_H * BOARD_SCALE * 0.55]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.12} depthWrite={false} />
    </mesh>
  );
}

function SeatTag({
  seat,
  member,
  isYou,
  isActor,
  wonAmount,
}: {
  seat: PokerSeatView;
  member?: RoomMember;
  isYou: boolean;
  isActor: boolean;
  wonAmount: number | null;
}) {
  const out = seat.chips === 0 && seat.bet === 0 && !seat.allIn;
  return (
    <Html
      center
      position={[0, -0.34, 0.02]}
      distanceFactor={2.3}
      style={{ pointerEvents: 'none' }}
      zIndexRange={[10, 0]}
    >
      <div
        className={`flex flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-center whitespace-nowrap shadow-lg backdrop-blur-sm ${
          isActor ? 'bg-gold-500/90 text-wood-900 ring-2 ring-gold-300' : 'bg-black/60 text-white ring-1 ring-white/20'
        } ${seat.folded || out ? 'opacity-55' : ''}`}
      >
        <span className="flex items-center gap-1 text-sm leading-none font-bold">
          {isYou ? 'Você' : seat.name}
          {seat.isButton && <span className="rounded-full bg-paper px-1 text-[10px] font-black text-wood-900">D</span>}
          {seat.isSmallBlind && <span className="rounded bg-black/40 px-1 text-[10px] text-white">SB</span>}
          {seat.isBigBlind && <span className="rounded bg-black/40 px-1 text-[10px] text-white">BB</span>}
          {member && (member.isBot || member.autoPlay) && <span className="text-xs">🤖</span>}
          {member && !member.isBot && !member.connected && !member.autoPlay && <span className="text-xs">📵</span>}
        </span>
        <span className="flex items-center gap-1 text-[11px] leading-none">
          <span className="rounded bg-black/45 px-2 py-1 font-mono font-bold text-gold-200">
            {formatMoney(seat.chips)}
          </span>
          {seat.bet > 0 && (
            <span className="rounded bg-wood-900/90 px-1.5 py-1 font-mono font-bold text-gold-200 ring-1 ring-gold-500/50">
              Aposta {formatMoney(seat.bet)}
            </span>
          )}
          {seat.folded && <span className="rounded bg-black/45 px-1.5 py-1 font-black text-stone-300">DESISTIU</span>}
          {seat.allIn && <span className="rounded bg-wine-700 px-1.5 py-1 font-black text-white">ALL-IN</span>}
          {wonAmount !== null && (
            <span className="rounded bg-emerald-600 px-1.5 py-1 font-black text-white">+{formatMoney(wonAmount)}</span>
          )}
        </span>
      </div>
    </Html>
  );
}

/** Showdown: the player's two cards, face up and large, above their head. */
function RevealedCards({ cards }: { cards: PokerCard[] }) {
  return (
    <group position={[0, 0.42, 0.06]} scale={0.85}>
      {cards.map((c, i) => (
        <group
          key={pokerCardId(c)}
          position={[(i - 0.5) * (CARD_W + 0.02), 0, i * 0.002]}
          rotation={[0, 0, (0.5 - i) * 0.08]}
        >
          <Card3D card={null} face={pokerCardTexture(c)} />
        </group>
      ))}
    </group>
  );
}

/** Decorative chips (no numbers on the table, just the feel of it). */
const CHIP_COLORS = ['#c0392b', '#1f5fa8', '#1e7a4a', '#1b1b1f', '#f2ecdd'];
const CHIP_R = 0.036;
const CHIP_H = 0.01;

function ChipStack({ count, x, z, seed = 0 }: { count: number; x: number; z: number; seed?: number }) {
  return (
    <group position={[x, TOP, z]}>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          position={[Math.sin(i * 2.1 + seed) * 0.002, CHIP_H / 2 + i * CHIP_H, Math.cos(i * 1.7 + seed) * 0.002]}
          castShadow
        >
          <cylinderGeometry args={[CHIP_R, CHIP_R, CHIP_H * 0.92, 18]} />
          <meshStandardMaterial color={CHIP_COLORS[(i + seed) % CHIP_COLORS.length]} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** A small pile: up to `max` chips spread over a few stacks around (x, z). */
function ChipPile({
  count,
  x,
  z,
  seed = 0,
  perStack = 7,
}: {
  count: number;
  x: number;
  z: number;
  seed?: number;
  perStack?: number;
}) {
  const stacks = Math.ceil(count / perStack);
  return (
    <>
      {Array.from({ length: stacks }, (_, i) => {
        const a = seed + i * 2.4;
        const r = i === 0 ? 0 : CHIP_R * 2.3;
        return (
          <ChipStack
            key={i}
            count={Math.min(perStack, count - i * perStack)}
            x={x + Math.cos(a) * r}
            z={z + Math.sin(a) * r}
            seed={seed + i}
          />
        );
      })}
    </>
  );
}

/** How many decorative chips stand for an amount (the table gets busy fast otherwise). */
function chipsFor(amount: number, unit: number, max: number): number {
  if (amount <= 0) return 0;
  return Math.max(1, Math.min(max, Math.round(amount / unit)));
}

/** The player's two face-down cards, held up in front of their chest. */
function HeldCards() {
  return (
    <group position={[0.2, -0.2, 0.08]} scale={0.7} rotation={[0, 0, -0.12]}>
      {[0, 1].map((i) => (
        <group key={i} position={[(i - 0.5) * 0.07, 0, i * 0.003]} rotation={[0, 0, (0.5 - i) * 0.3]}>
          <Card3D card={null} />
        </group>
      ))}
    </group>
  );
}

/**
 * Texas Hold'em seen from your seat: the same cafeteria and characters as the Dane-se table, with the board propped
 * up in the middle. Action runs clockwise, so the next player sits to your left.
 */
export function PokerTable3DView({ room }: { room: PokerRoomView }) {
  const game = room.game!;
  const now = useNow(1000);
  useReactionSound();

  // The scene seats players counter-clockwise; poker deals clockwise, so it gets them in reverse.
  const ordered = useMemo(() => [...game.seats].reverse(), [game.seats]);
  const n = ordered.length;
  const me = game.seats.find((s) => s.id === room.youId);
  // Busted or watching: pick whose seat to watch from (only the camera moves; the view stays yours).
  const canWatch = game.isSpectator || !me || (me.chips === 0 && me.bet === 0 && !me.allIn);
  const candidates = game.seats
    .filter((s) => s.chips > 0 || s.bet > 0 || s.allIn || s.id === room.youId)
    .map((s) => ({ id: s.id, name: s.name }));
  const { watchedId, step } = useWatchedSeat(candidates, room.youId, canWatch);
  const youIndex = Math.max(
    0,
    ordered.findIndex((s) => s.id === watchedId),
  );

  const unit = bigBlind(game.settings.minBuyIn);
  const totalBets = game.seats.reduce((sum, s) => sum + s.bet, 0);
  const inHand = (s: PokerSeatView) => game.handPhase !== null && game.phase !== 'summary' && !s.folded;

  const revealed = new Map<string, PokerCard[]>();
  const won = new Map<string, number>();
  if (game.phase === 'summary' && game.lastHand) {
    for (const r of game.lastHand.revealed ?? []) revealed.set(r.playerId, r.cards);
    for (const w of game.lastHand.winners) won.set(w.playerId, w.amount);
  }

  const seats = ordered.map((s) => {
    const member = room.members.find((m) => m.id === s.id);
    const last = [...room.chat].reverse().find((m) => m.playerId === s.id);
    const shown = revealed.get(s.id);
    return {
      id: s.id,
      character: member?.character ?? 'carmelo',
      isTurn: s.id === game.actorId,
      handsOnTable: false,
      overhead: (
        <>
          <Reactions3D playerId={s.id} position={[0, 0.5, 0.05]} />
          <SeatTag
            seat={s}
            member={member}
            isYou={s.id === room.youId}
            isActor={s.id === game.actorId}
            wonAmount={won.get(s.id) ?? null}
          />
          {last && now - last.at < BUBBLE_MS && <Bubble key={last.id} text={last.text} />}
          {shown && shown.length === 2 ? <RevealedCards cards={shown} /> : inHand(s) && <HeldCards />}
        </>
      ),
    };
  });

  return (
    <div className="absolute inset-0">
      <Scene3D seats={seats} youIndex={youIndex} shareLook={watchedId === room.youId} focusId={game.actorId}>
        <Reactions3D playerId={watchedId} position={[0, 1.05, 1.15]} />

        {Array.from({ length: 5 }, (_, i) => {
          const x = (i - 2) * BOARD_GAP;
          const card = game.community[i];
          return card ? (
            <BoardCard key={`${game.handNumber}-${pokerCardId(card)}`} card={card} x={x} />
          ) : (
            <EmptySlot key={i} x={x} />
          );
        })}
        {/* Chips: each player's stack in front of them, their bet pushed forward, the pot by the board. */}
        {game.seats.map((s, i) => {
          const k = (ordered.findIndex((o) => o.id === s.id) - youIndex + n) % n;
          const { angle } = seatPosition(k, n);
          // Your own chips sit a little to the right, so your hole cards at the bottom don't hide them.
          const sideR = k === 0 ? 0.34 : 0.16;
          const side = { x: Math.cos(angle) * sideR, z: -Math.sin(angle) * sideR };
          const stackR = k === 0 ? 0.6 : 0.74;
          const betSide = k === 0 ? 0.2 : 0;
          return (
            <group key={s.id}>
              <ChipPile
                count={chipsFor(s.chips, unit * 5, 21)}
                x={Math.sin(angle) * stackR + side.x}
                z={Math.cos(angle) * stackR + side.z}
                seed={i * 3}
              />
              {s.bet > 0 && (
                <ChipPile
                  count={chipsFor(s.bet, unit, 8)}
                  x={Math.sin(angle) * 0.48 + Math.cos(angle) * betSide}
                  z={Math.cos(angle) * 0.48 - Math.sin(angle) * betSide}
                  seed={i * 5 + 1}
                  perStack={4}
                />
              )}
            </group>
          );
        })}
        <ChipPile count={chipsFor(game.pot - totalBets, unit, 24)} x={0} z={BOARD_Z + 0.3} seed={7} perStack={6} />
      </Scene3D>
      {canWatch && candidates.length > 1 && (
        <WatchSwitcher
          name={candidates.find((c) => c.id === watchedId)?.name ?? ''}
          isYou={watchedId === room.youId}
          onStep={step}
        />
      )}
    </div>
  );
}
