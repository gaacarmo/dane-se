import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { bodyHeight, type CharacterId, type Match, type MapDef, type TeamId, type WorldEvent } from '@dane-se/shared';
import { CHARACTER_SPECS } from '../table3d/characterSpecs';
import { bodyTexture } from '../table3d/bodyTextures';
import { FACE_HEIGHT, PortraitHead } from '../table3d/PortraitHead';
import type { Ping } from '@dane-se/shared';
import { PING_KINDS } from './pings';
import { CsEffects } from './CsEffects';
import { FirstPersonRig } from './CsViewModel';
import type { CsInput } from './useCsInput';

const TEAM_COLOR: Record<TeamId, string> = { A: '#4a7a8c', B: '#a8703c' };
const SOLID_COLOR = '#6a737e';
const LOW_SOLID_COLOR = '#8a8478';

function MapGeometry({ map }: { map: MapDef }) {
  const { min, max } = map.bounds;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(min.x + max.x) / 2, 0, (min.z + max.z) / 2]}>
        <planeGeometry args={[max.x - min.x, max.z - min.z]} />
        <meshStandardMaterial color="#444a52" />
      </mesh>
      {map.solids.map((s, i) => (
        <mesh
          key={i}
          position={[(s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, (s.min.z + s.max.z) / 2]}
        >
          <boxGeometry args={[s.max.x - s.min.x, s.max.y - s.min.y, s.max.z - s.min.z]} />
          {s === map.barrier ? (
            <meshBasicMaterial color="#6aa0c8" transparent opacity={0.6} depthWrite={false} />
          ) : (
            <meshStandardMaterial color={s.max.y > 2 ? SOLID_COLOR : LOW_SOLID_COLOR} />
          )}
        </mesh>
      ))}
      {(['A', 'B'] as const).map((key) => {
        const s = map.sites[key];
        return (
          <mesh
            key={key}
            rotation-x={-Math.PI / 2}
            position={[(s.min.x + s.max.x) / 2, 0.02, (s.min.z + s.max.z) / 2]}
          >
            <planeGeometry args={[s.max.x - s.min.x, s.max.z - s.min.z]} />
            <meshBasicMaterial color={key === 'A' ? '#b89a4a' : '#5a86a8'} transparent opacity={0.28} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Altura do corpo desenhado; as caixas de acerto do motor (HITBOX_ZONES) seguem as mesmas proporções. */
const FIGURE_HEIGHT = 1.8;
const HEAD_TOP = 0.82 * FIGURE_HEIGHT;
const TORSO_BOTTOM = 0.45 * FIGURE_HEIGHT;

/** Figura estática do personagem: cabeça do retrato, camisa e pernas, sempre de frente para a câmera. */
function CsFigure({
  matchRef,
  id,
  character,
  hiddenInPrep,
}: {
  matchRef: MutableRefObject<Match>;
  id: string;
  character: CharacterId;
  /** Inimigo: some enquanto o portão de preparação está de pé, para não entregar a posição do time dele. */
  hiddenInPrep: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const spec = CHARACTER_SPECS[character];
  const shirt = useMemo(() => bodyTexture(spec), [spec]);
  const team = matchRef.current.world.players.find((x) => x.id === id)!.team;

  useFrame(({ camera }) => {
    const p = matchRef.current.world.players.find((x) => x.id === id);
    const g = group.current;
    if (!p || !g) return;
    g.visible = p.alive && !(hiddenInPrep && matchRef.current.world.phase === 'prep');
    g.position.set(p.body.pos.x, p.body.pos.y, p.body.pos.z);
    g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
    g.scale.y = bodyHeight(p.body) / FIGURE_HEIGHT;
  });

  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.36, 0.44, 24]} />
        <meshBasicMaterial color={TEAM_COLOR[team]} side={THREE.DoubleSide} />
      </mesh>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, TORSO_BOTTOM / 2, 0]}>
          <boxGeometry args={[0.16, TORSO_BOTTOM, 0.16]} />
          <meshStandardMaterial color="#23262b" />
        </mesh>
      ))}
      <mesh position={[0, TORSO_BOTTOM + 0.36, 0]}>
        <planeGeometry args={[0.72, 0.72]} />
        <meshBasicMaterial map={shirt} transparent alphaTest={0.02} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <group position={[0, HEAD_TOP, 0]} scale={(FIGURE_HEIGHT - HEAD_TOP) / FACE_HEIGHT}>
        <Suspense fallback={null}>
          <PortraitHead id={character} gaze={0} nod={0} />
        </Suspense>
      </group>
    </group>
  );
}

/** Coluna colorida no ponto pingado, visível de longe. */
function PingMarkers({ pings }: { pings: Ping[] }) {
  return (
    <group>
      {pings.map((ping) => (
        <group key={ping.id} position={[ping.x, 0, ping.z]}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 2.8, 8]} />
            <meshBasicMaterial color={PING_KINDS[ping.kind].color} transparent opacity={0.55} fog={false} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
            <ringGeometry args={[0.5, 0.65, 24]} />
            <meshBasicMaterial color={PING_KINDS[ping.kind].color} side={THREE.DoubleSide} fog={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Bomb({ matchRef }: { matchRef: MutableRefObject<Match> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const { bomb } = matchRef.current.world;
    const m = mesh.current;
    if (!m) return;
    const placed = bomb.pos && (bomb.status === 'planted' || bomb.status === 'carried');
    m.visible = !!placed;
    if (!bomb.pos) return;
    m.position.set(bomb.pos.x, 0.12, bomb.pos.z);
    if (light.current) light.current.intensity = bomb.status === 'planted' && Math.sin(clock.elapsedTime * 8) > 0 ? 6 : 0;
  });
  return (
    <mesh ref={mesh} visible={false}>
      <boxGeometry args={[0.4, 0.24, 0.3]} />
      <meshStandardMaterial color="#8a2f2a" />
      <pointLight ref={light} color="#ff5a3c" distance={6} intensity={0} />
    </mesh>
  );
}

export function CsScene({
  matchRef,
  meId,
  input,
  roundKey,
  pings,
  fx,
}: {
  matchRef: MutableRefObject<Match>;
  meId: string;
  input: CsInput;
  /** Muda a cada rodada para remontar a cena com o mapa e os jogadores certos. */
  roundKey: number;
  pings: Ping[];
  /** Fila de eventos do motor que o cenário consome para desenhar tiros e impactos. */
  fx: MutableRefObject<WorldEvent[]>;
}) {
  const match = matchRef.current;
  const muzzle = useRef(new THREE.Vector3());
  const myTeam = match.roster.find((r) => r.id === meId)!.team;
  return (
    <Canvas camera={{ fov: 75, near: 0.05, far: 200 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
      <color attach="background" args={['#0b0d10']} />
      <fog attach="fog" args={['#0b0d10', 40, 90]} />
      <hemisphereLight args={['#c8d2dc', '#2a2d33', 1.4]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[15, 25, 10]} intensity={1.8} />
      <MapGeometry key={`map-${match.mapId}-${match.world.map.solids.length}`} map={match.world.map} />
      {match.roster
        .filter((r) => r.id !== meId)
        .map((r) => (
          <CsFigure key={`${roundKey}-${r.id}`} matchRef={matchRef} id={r.id} character={r.character} hiddenInPrep={r.team !== myTeam} />
        ))}
      <Bomb matchRef={matchRef} />
      <PingMarkers pings={pings} />
      <CsEffects key={`fx-${roundKey}`} fx={fx} meId={meId} muzzle={muzzle} />
      <FirstPersonRig matchRef={matchRef} meId={meId} input={input} muzzle={muzzle} />
    </Canvas>
  );
}
