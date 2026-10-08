import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, SMAA, Vignette } from '@react-three/postprocessing';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CharacterId } from '@dane-se/shared';
import { Player2D } from './Player2D';
import { Environment, PlasticChair } from './Environment';

export const TABLE_RADIUS = 1.0;
export const TABLE_Y = 0.76;
const SEAT_RADIUS = 1.5;

export interface SeatInfo {
  id: string;
  character: CharacterId;
  isTurn?: boolean;
  /** Drawn above the player's head (name tag, forehead card). */
  overhead?: React.ReactNode;
}

/** Seat k positions after you, counter-clockwise: k = 1 sits to your right. You are at +Z. */
export function seatPosition(k: number, n: number): { x: number; z: number; angle: number } {
  const angle = (k * 2 * Math.PI) / n;
  return { x: Math.sin(angle) * SEAT_RADIUS, z: Math.cos(angle) * SEAT_RADIUS, angle };
}

function Table() {
  return (
    <group>
      <mesh position={[0, TABLE_Y - 0.025, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.05, 48]} />
        <meshStandardMaterial color="#c9b88c" roughness={0.6} />
      </mesh>
      <mesh position={[0, TABLE_Y - 0.052, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS + 0.01, TABLE_RADIUS + 0.01, 0.012, 48]} />
        <meshStandardMaterial color="#2c5f4a" roughness={0.5} />
      </mesh>
      <mesh position={[0, TABLE_Y / 2 - 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, TABLE_Y - 0.06, 12]} />
        <meshStandardMaterial color="#6f6f6c" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.45, 0.5, 0.04, 24]} />
        <meshStandardMaterial color="#6f6f6c" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Who each seat looks at, re-rolled every few seconds: mostly whoever has the turn, sometimes anyone. */
function useGaze(seats: SeatInfo[], youIndex: number, focusId: string | null | undefined): Map<string, number> {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 3200);
    return () => clearInterval(t);
  }, []);
  const n = seats.length;
  const xOf = (i: number) => seatPosition((i - youIndex + n) % n, n).x;
  const map = new Map<string, number>();
  seats.forEach((s, i) => {
    // Cheap deterministic pseudo-random per seat and tick.
    const r = Math.abs(Math.sin((i + 1) * 12.9898 + tick * 78.233) * 43758.5453) % 1;
    const focusIndex = seats.findIndex((o) => o.id === focusId);
    let target: number | 'you';
    if (focusIndex >= 0 && focusIndex !== i && r < 0.7) target = focusIndex;
    else if (focusIndex === i) target = 'you';
    else {
      const pick = Math.floor(r * 997) % (n + 1);
      target = pick === n || pick === i ? 'you' : pick;
    }
    if (target === 'you') map.set(s.id, 0);
    else map.set(s.id, Math.sign(xOf(target) - xOf(i)));
  });
  return map;
}

const CAMERA_POSITION: [number, number, number] = [0, 1.85, 2.0];
const CAMERA_TARGET = new THREE.Vector3(0, 0.85, 0.02);
const MAX_YAW = 0.35;
const MIN_PITCH = -0.08;
const MAX_PITCH = 0.36;

/**
 * Look around from your seat. Mouse: the camera follows the pointer (move it up
 * to raise your head). Touch: drag. The look is damped and limited, so you
 * never lose the table.
 */
function LookControls() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const look = useRef({ yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 });
  const base = useRef({ yaw: 0, pitch: 0 });

  useEffect(() => {
    const d = CAMERA_TARGET.clone().sub(new THREE.Vector3(...CAMERA_POSITION));
    base.current = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };

    let lastX = 0;
    let lastY = 0;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        const nx = e.clientX / window.innerWidth;
        const ny = e.clientY / window.innerHeight;
        look.current.targetYaw = clamp((0.5 - nx) * 1.2, -MAX_YAW, MAX_YAW);
        look.current.targetPitch = clamp((0.62 - ny) * 1.1, MIN_PITCH, MAX_PITCH);
      } else if (e.buttons) {
        look.current.targetYaw = clamp(look.current.targetYaw + (e.clientX - lastX) * 0.004, -MAX_YAW, MAX_YAW);
        look.current.targetPitch = clamp(look.current.targetPitch - (e.clientY - lastY) * 0.004, MIN_PITCH, MAX_PITCH);
      }
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onDown = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    };
  }, []);

  useFrame((_, dt) => {
    // Narrow (portrait) screens: widen the vertical field of view so the table's width still fits.
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const hfov = THREE.MathUtils.degToRad(80);
    const fov =
      aspect >= 1.2
        ? 56
        : Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / Math.max(0.5, aspect))));
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const l = look.current;
    l.yaw = THREE.MathUtils.damp(l.yaw, l.targetYaw, 5, dt);
    l.pitch = THREE.MathUtils.damp(l.pitch, l.targetPitch, 5, dt);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(base.current.pitch + l.pitch, base.current.yaw + l.yaw, 0);
  });
  return null;
}

export function Scene3D({
  seats,
  youIndex = 0,
  focusId,
  children,
}: {
  seats: SeatInfo[];
  youIndex?: number;
  /** Player everyone is watching (usually whose turn it is). */
  focusId?: string | null;
  children?: React.ReactNode;
}) {
  const n = seats.length;
  const gaze = useGaze(seats, youIndex, focusId);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: CAMERA_POSITION, fov: 56, near: 0.05, far: 40 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#f2d9a0']} />
      <fog attach="fog" args={['#f2d9a0', 12, 24]} />
      <LookControls />
      <Suspense fallback={null}>
        <Environment />
        <Table />
        {seats.map((s, i) => {
          const k = (i - youIndex + n) % n;
          const { x, z, angle } = seatPosition(k, n);
          return (
            <group key={s.id} position={[x, 0, z]} rotation={[0, angle + Math.PI, 0]}>
              <PlasticChair position={[0, 0, -0.08]} color="#d9c24a" />
              <Player2D id={s.character} gaze={gaze.get(s.id) ?? 0} active={s.isTurn} showBody={k !== 0}>
                {s.overhead}
              </Player2D>
            </group>
          );
        })}
        {children}
      </Suspense>
      <EffectComposer multisampling={0}>
        <SMAA />
        <Bloom intensity={0.3} luminanceThreshold={0.95} mipmapBlur />
        <HueSaturation saturation={0.12} />
        <BrightnessContrast contrast={0.08} brightness={-0.02} />
        <Vignette eskil={false} offset={0.25} darkness={0.5} />
      </EffectComposer>
    </Canvas>
  );
}
