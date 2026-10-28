import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { bodyHeight, eyePos, PLAYER_RADIUS, type Match, type MapDef, type TeamId } from '@dane-se/shared';
import type { CsInput } from './useCsInput';

const TEAM_COLOR: Record<TeamId, string> = { A: '#4a7a8c', B: '#a8703c' };
const SOLID_COLOR = '#3a4048';
const LOW_SOLID_COLOR = '#56524a';

function MapGeometry({ map }: { map: MapDef }) {
  const { min, max } = map.bounds;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(min.x + max.x) / 2, 0, (min.z + max.z) / 2]}>
        <planeGeometry args={[max.x - min.x, max.z - min.z]} />
        <meshStandardMaterial color="#23272c" />
      </mesh>
      {map.solids.map((s, i) => (
        <mesh
          key={i}
          position={[(s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, (s.min.z + s.max.z) / 2]}
        >
          <boxGeometry args={[s.max.x - s.min.x, s.max.y - s.min.y, s.max.z - s.min.z]} />
          <meshStandardMaterial color={s.max.y > 2 ? SOLID_COLOR : LOW_SOLID_COLOR} />
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

function PlayerMesh({ matchRef, id }: { matchRef: MutableRefObject<Match>; id: string }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const p = matchRef.current.world.players.find((x) => x.id === id);
    const g = group.current;
    if (!p || !g) return;
    g.visible = p.alive;
    g.position.set(p.body.pos.x, p.body.pos.y, p.body.pos.z);
    g.rotation.y = p.yaw;
    const h = bodyHeight(p.body);
    body.current?.scale.set(1, (h - 0.35) / 1.45, 1);
    if (body.current) body.current.position.y = (h - 0.35) / 2;
    if (head.current) head.current.position.y = h - 0.18;
  });
  const team = matchRef.current.world.players.find((x) => x.id === id)!.team;
  return (
    <group ref={group}>
      <mesh ref={body}>
        <cylinderGeometry args={[PLAYER_RADIUS, PLAYER_RADIUS, 1.45, 12]} />
        <meshStandardMaterial color={TEAM_COLOR[team]} />
      </mesh>
      <mesh ref={head}>
        <sphereGeometry args={[0.18, 12, 10]} />
        <meshStandardMaterial color="#c9b79c" />
      </mesh>
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

/** Câmera no olho do jogador local e arma em primeira pessoa. */
function FirstPerson({ matchRef, meId, input }: { matchRef: MutableRefObject<Match>; meId: string; input: CsInput }) {
  const { camera } = useThree();
  const gun = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const me = matchRef.current.world.players.find((p) => p.id === meId);
    if (!me) return;
    const eye = eyePos(me.body);
    const look = me.alive ? input.look() : { yaw: me.yaw, pitch: me.pitch };
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(look.pitch, look.yaw, 0);
    const g = gun.current;
    if (!g) return;
    g.visible = me.alive;
    g.position.copy(camera.position).add(new THREE.Vector3(0.22, -0.2, -0.45).applyQuaternion(camera.quaternion));
    g.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={gun}>
      <boxGeometry args={[0.07, 0.09, 0.45]} />
      <meshStandardMaterial color="#1c1f23" />
    </mesh>
  );
}

export function CsScene({
  matchRef,
  meId,
  input,
  roundKey,
}: {
  matchRef: MutableRefObject<Match>;
  meId: string;
  input: CsInput;
  /** Muda a cada rodada para remontar a cena com o mapa e os jogadores certos. */
  roundKey: number;
}) {
  const match = matchRef.current;
  return (
    <Canvas camera={{ fov: 75, near: 0.05, far: 200 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
      <color attach="background" args={['#0b0d10']} />
      <fog attach="fog" args={['#0b0d10', 25, 70]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[15, 25, 10]} intensity={1.1} />
      <MapGeometry key={`map-${match.mapId}`} map={match.world.map} />
      {match.roster
        .filter((r) => r.id !== meId)
        .map((r) => (
          <PlayerMesh key={`${roundKey}-${r.id}`} matchRef={matchRef} id={r.id} />
        ))}
      <Bomb matchRef={matchRef} />
      <FirstPerson matchRef={matchRef} meId={meId} input={input} />
    </Canvas>
  );
}
