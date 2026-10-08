import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  type Card,
  type PlayerView,
  type PublicPlayer,
  type RoomMember,
  type RoomView,
  wordLetters,
} from '@dane-se/shared';
import { sfx } from '../../lib/sound';
import { useClient } from '../../lib/store';
import { Letters } from '../table/Letters';
import { Card3D } from './Card3D';
import { Scene3D, TABLE_Y, seatPosition } from './Scene3D';

const TOP = TABLE_Y + 0.006;
/** Played cards lie flat on an ellipse around the pile, all upright for the viewer so they can be read. */
const PLAY_RX = 0.62;
const PLAY_RZ = 0.4;
const LEAN = Math.PI / 2;
const CARD_SCALE = 2;

const BUBBLE_MS = 6000;

/** Emoji reactions floating up from a player's head (or from your hands). */
function Reactions3D({ playerId, position }: { playerId: string; position: [number, number, number] }) {
  const { reactions } = useClient();
  const mine = reactions.filter((r) => r.playerId === playerId);
  return (
    <>
      {mine.map((r, i) => (
        <Html
          key={r.id}
          center
          position={position}
          distanceFactor={2}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[30, 20]}
        >
          <span
            className="reaction-float block text-6xl drop-shadow-[0_4px_8px_rgb(0_0_0/0.6)] select-none"
            style={{ marginLeft: i * 22 }}
          >
            {r.emoji}
          </span>
        </Html>
      ))}
    </>
  );
}

/** Plays the pop sound for each new reaction, once for the whole table. */
function useReactionSound() {
  const { reactions } = useClient();
  const latest = reactions.at(-1)?.id;
  useEffect(() => {
    if (latest) sfx.pop();
  }, [latest]);
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Bubble({ text }: { text: string }) {
  return (
    <Html
      center
      position={[0.42, 0.42, 0.03]}
      distanceFactor={2}
      style={{ pointerEvents: 'none' }}
      zIndexRange={[20, 10]}
    >
      <div className="max-w-52 rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-sm leading-snug font-semibold break-words text-wood-900 shadow-xl">
        {text}
      </div>
    </Html>
  );
}

function NameTag({
  player,
  member,
  isYou,
  isTurn,
  word,
}: {
  player: PublicPlayer;
  member?: RoomMember;
  isYou: boolean;
  isTurn: boolean;
  word: string[];
}) {
  const out = player.eliminated;
  return (
    <Html center position={[0, -0.34, 0.02]} distanceFactor={2} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
      <div
        className={`flex flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-center whitespace-nowrap shadow-lg backdrop-blur-sm ${
          isTurn ? 'bg-gold-500/90 text-wood-900 ring-2 ring-gold-300' : 'bg-black/60 text-white ring-1 ring-white/20'
        } ${out ? 'opacity-50 grayscale' : ''}`}
      >
        <span className="flex items-center gap-1 text-sm leading-none font-bold">
          {isYou ? 'Você' : player.name}
          {player.isDealer && !out && (
            <span className="rounded bg-paper px-1 text-[10px] font-black text-wood-900">PÉ</span>
          )}
          {member && (member.isBot || member.autoPlay) && !out && <span className="text-xs">🤖</span>}
          {member && !member.isBot && !member.connected && !member.autoPlay && !out && (
            <span className="text-xs">📵</span>
          )}
          {out && (
            <span className="rounded border border-card-red px-1 text-[10px] font-black text-card-red">FORA</span>
          )}
        </span>
        <Letters word={word} lost={player.letters} compact />
        {!out && (
          <span className="flex gap-1 text-[11px] leading-none">
            <span className="rounded bg-black/40 px-1.5 py-0.5 text-white">🎯 {player.bet ?? '–'}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-white ${player.bet !== null && player.tricksWon > player.bet ? 'bg-wine-700' : 'bg-black/40'}`}
            >
              ✋ {player.tricksWon}
            </span>
          </span>
        )}
      </div>
    </Html>
  );
}

/** One card on the table: flies in from its player, then slides to the trick's winner and shrinks away. */
function TableCard({
  card,
  from,
  to,
  yaw,
  leavingTo,
  won,
  canceled,
  highlight,
}: {
  card: Card;
  from: THREE.Vector3;
  to: THREE.Vector3;
  yaw: number;
  leavingTo: THREE.Vector3 | null;
  won: boolean;
  canceled: boolean;
  highlight: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const pos = useRef(from.clone());
  const scale = useRef(0.6);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const target = leavingTo ?? to;
    const k = 1 - Math.exp(-(leavingTo ? 9 : 11) * dt);
    pos.current.lerp(target, k);
    const dist = pos.current.distanceTo(target);
    g.position.set(pos.current.x, pos.current.y + Math.min(0.5, dist) * 0.5, pos.current.z);
    const s = (leavingTo ? 0.3 : won ? 1.15 : 1) * CARD_SCALE;
    scale.current = THREE.MathUtils.damp(scale.current, s, 10, dt);
    g.scale.setScalar(scale.current);
  });
  return (
    <group ref={ref} position={from.toArray()}>
      <group>
        <group rotation={[-LEAN, 0, 0.05 * Math.sin(yaw * 3)]}>
          <Card3D card={card} highlight={highlight} dim={canceled} />
        </group>
      </group>
    </group>
  );
}

interface ShownCard {
  key: string;
  playerId: string;
  card: Card;
  leavingTo: string | null;
}

/** Keeps cards visible for a moment after the trick ends so they can slide to the winner. */
function useShownCards(game: PlayerView): ShownCard[] {
  const [shown, setShown] = useState<ShownCard[]>([]);
  const lastWinner = useRef<string | null>(null);
  const trickKey = `${game.roundNumber}-${game.tricksPlayed}`;
  if (game.trick.result?.winnerId) lastWinner.current = game.trick.result.winnerId;

  useEffect(() => {
    const current = game.trick.plays.map((p) => ({
      key: `${trickKey}-${p.playerId}`,
      playerId: p.playerId,
      card: p.card,
      leavingTo: null,
    }));
    setShown((prev) => {
      const keys = new Set(current.map((c) => c.key));
      const leaving = prev
        .filter((c) => !keys.has(c.key))
        .map((c) => ({
          ...c,
          leavingTo: c.leavingTo ?? lastWinner.current ?? 'center',
        }));
      return [...leaving, ...current];
    });
  }, [game.trick.plays, trickKey]);

  useEffect(() => {
    if (!shown.some((c) => c.leavingTo)) return;
    const t = setTimeout(() => setShown((prev) => prev.filter((c) => !c.leavingTo)), 650);
    return () => clearTimeout(t);
  }, [shown]);

  return shown;
}

function Pile({ game }: { game: PlayerView }) {
  const flip = useRef<THREE.Group>(null);
  const t0 = useRef(performance.now());
  const roundKey = game.roundNumber;
  useEffect(() => {
    t0.current = performance.now();
  }, [roundKey]);
  useFrame(() => {
    const g = flip.current;
    if (!g) return;
    const t = (performance.now() - t0.current) / 1000 - 0.9;
    g.rotation.y = Math.PI * (1 - THREE.MathUtils.smoothstep(t, 0, 0.6));
  });
  return (
    <group position={[0, TOP, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[-0.22, i * 0.0035, 0.01 * i]} rotation={[-Math.PI / 2, 0, 0.05 * i]}>
          <Card3D card={null} />
        </group>
      ))}
      <group position={[0.2, 0.004, -0.02]} scale={1.3}>
        <group ref={flip}>
          <group rotation={[-LEAN, 0, 0]}>
            <Card3D card={game.vira} />
          </group>
        </group>
      </group>
      <Html center position={[0, 0.2, -0.3]} distanceFactor={2} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div className="rounded-full bg-black/65 px-2.5 py-1 text-xs whitespace-nowrap text-white ring-1 ring-gold-500/60">
          Manilha: <strong className="text-gold-300">{game.manilhaRank}</strong>
        </div>
      </Html>
    </group>
  );
}

export function Table3DView({ room }: { room: RoomView }) {
  const game = room.game!;
  const word = wordLetters(game.settings.word);
  const n = game.players.length;
  const youIndex = Math.max(
    0,
    game.players.findIndex((p) => p.id === room.youId),
  );
  const turnId = game.phase === 'betting' || game.phase === 'playing' ? game.turnPlayerId : null;
  const shown = useShownCards(game);
  const now = useNow(1000);
  useReactionSound();

  const seatWorld = useMemo(() => {
    const m = new Map<string, { x: number; z: number; angle: number }>();
    game.players.forEach((p, i) => m.set(p.id, seatPosition((i - youIndex + n) % n, n)));
    return m;
  }, [game.players, youIndex, n]);

  const seats = game.players.map((p) => {
    const member = room.members.find((m) => m.id === p.id);
    return {
      id: p.id,
      character: member?.character ?? 'carmelo',
      isTurn: p.id === turnId,
      overhead: (
        <>
          <Reactions3D playerId={p.id} position={[0, 0.5, 0.05]} />
          <NameTag player={p} member={member} isYou={p.id === room.youId} isTurn={p.id === turnId} word={word} />
          {(() => {
            const last = [...room.chat].reverse().find((m) => m.playerId === p.id);
            return last && now - last.at < BUBBLE_MS ? <Bubble key={last.id} text={last.text} /> : null;
          })()}
          {game.blindRound && !p.eliminated && p.cardCount > 0 && (
            <group position={[0, 0.46, 0.06]} rotation={[0, 0, p.id === room.youId ? 0 : -0.07]} scale={1.25}>
              <Card3D card={p.id === room.youId ? null : p.foreheadCard} />
            </group>
          )}
        </>
      ),
    };
  });

  const result = game.trick.result;
  return (
    <div className="absolute inset-0">
      <Scene3D seats={seats} youIndex={youIndex} focusId={turnId}>
        <Reactions3D playerId={room.youId} position={[0, 1.05, 1.15]} />
        <Pile game={game} />
        {shown.map((c) => {
          const s = seatWorld.get(c.playerId) ?? { x: 0, z: 0, angle: 0 };
          const to = new THREE.Vector3(Math.sin(s.angle) * PLAY_RX, TOP + 0.006, Math.cos(s.angle) * PLAY_RZ + 0.04);
          const from = new THREE.Vector3(s.x * 0.9, s.angle === 0 ? 1.0 : 1.05, s.z * 1.05);
          const w = c.leavingTo ? seatWorld.get(c.leavingTo) : null;
          const leavingTo = c.leavingTo ? new THREE.Vector3((w?.x ?? 0) * 0.8, TOP + 0.3, (w?.z ?? 0) * 0.8) : null;
          return (
            <TableCard
              key={c.key}
              card={c.card}
              from={from}
              to={to}
              yaw={s.angle}
              leavingTo={leavingTo}
              won={result?.winnerId === c.playerId}
              canceled={result?.canceledPlayerIds.includes(c.playerId) ?? false}
              highlight={c.card.rank === game.manilhaRank}
            />
          );
        })}
      </Scene3D>
    </div>
  );
}
