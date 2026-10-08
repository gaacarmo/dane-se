import { useMemo } from 'react';
import * as THREE from 'three';

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

function useFloorTexture() {
  return useMemo(
    () =>
      canvasTexture(
        256,
        (g) => {
          g.fillStyle = '#c9a77c';
          g.fillRect(0, 0, 256, 256);
          g.fillStyle = '#b98f62';
          g.fillRect(0, 0, 128, 128);
          g.fillRect(128, 128, 128, 128);
          g.strokeStyle = 'rgba(80,50,30,.35)';
          g.lineWidth = 3;
          g.strokeRect(0, 0, 256, 256);
          g.strokeRect(0, 0, 128, 128);
          g.strokeRect(128, 128, 128, 128);
        },
        [8, 8],
      ),
    [],
  );
}

function useTileTexture() {
  return useMemo(
    () =>
      canvasTexture(
        128,
        (g) => {
          g.fillStyle = '#6fb3a8';
          g.fillRect(0, 0, 128, 128);
          g.strokeStyle = '#e8f1ee';
          g.lineWidth = 4;
          g.strokeRect(0, 0, 128, 128);
        },
        [14, 3],
      ),
    [],
  );
}

function PlasticChair({ position, rotation = 0, color = '#d9c24a' }: { position: [number, number, number]; rotation?: number; color?: string }) {
  const mat = <meshStandardMaterial color={color} roughness={0.5} />;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.46, 0.04, 0.46]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.75, -0.22]} castShadow>
        <boxGeometry args={[0.46, 0.5, 0.04]} />
        {mat}
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}${z}`} position={[x * 0.2, 0.22, z * 0.2]}>
            <cylinderGeometry args={[0.02, 0.02, 0.44, 6]} />
            <meshStandardMaterial color="#8a8a86" metalness={0.5} roughness={0.4} />
          </mesh>
        )),
      )}
    </group>
  );
}

function VendingMachine({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[1, 1.9, 0.8]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[-0.08, 1.05, 0.41]}>
        <boxGeometry args={[0.7, 1.1, 0.02]} />
        <meshStandardMaterial color="#ffe9b0" emissive="#ffd88a" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

function Window({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh>
        <planeGeometry args={[3, 1.5]} />
        <meshBasicMaterial color="#fff2cf" toneMapped={false} />
      </mesh>
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, 0, 0.01]}>
          <boxGeometry args={[0.05, 1.5, 0.04]} />
          <meshStandardMaterial color="#e8e2d6" />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.01]}>
        <boxGeometry args={[3, 0.05, 0.04]} />
        <meshStandardMaterial color="#e8e2d6" />
      </mesh>
    </group>
  );
}

function BackgroundTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.74, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 0.04, 24]} />
        <meshStandardMaterial color="#e4d9bf" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.74, 8]} />
        <meshStandardMaterial color="#777" />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <PlasticChair
          key={i}
          position={[Math.sin((i * Math.PI) / 2 + 0.4) * 1.05, 0, Math.cos((i * Math.PI) / 2 + 0.4) * 1.05]}
          rotation={(i * Math.PI) / 2 + 0.4 + Math.PI}
          color={i % 2 ? '#d9c24a' : '#c8553a'}
        />
      ))}
    </group>
  );
}

/** A university cafeteria: tiled walls, big windows, fluorescent panels, vending machines. */
export function Environment() {
  const floor = useFloorTexture();
  const tiles = useTileTexture();
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial map={floor} roughness={0.7} />
      </mesh>
      <mesh position={[0, 3.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color="#efe6d4" />
      </mesh>

      {/* Walls: lower tiles + painted upper part. */}
      {[
        { p: [0, 0, -7], r: 0 },
        { p: [0, 0, 7], r: Math.PI },
        { p: [-7, 0, 0], r: Math.PI / 2 },
        { p: [7, 0, 0], r: -Math.PI / 2 },
      ].map((w, i) => (
        <group key={i} position={w.p as [number, number, number]} rotation={[0, w.r, 0]}>
          <mesh position={[0, 0.7, 0]}>
            <planeGeometry args={[14, 1.4]} />
            <meshStandardMaterial map={tiles} roughness={0.35} />
          </mesh>
          <mesh position={[0, 2.35, 0]}>
            <planeGeometry args={[14, 1.9]} />
            <meshStandardMaterial color="#f6e2b0" roughness={0.9} />
          </mesh>
        </group>
      ))}

      <Window position={[-3.2, 2.0, -6.97]} rotation={0} />
      <Window position={[3.2, 2.0, -6.97]} rotation={0} />
      <Window position={[-6.97, 2.0, -2]} rotation={Math.PI / 2} />
      <Window position={[6.97, 2.0, -2]} rotation={-Math.PI / 2} />

      <VendingMachine position={[-0.1, 0, -6.5]} color="#c8312c" />
      <VendingMachine position={[1.1, 0, -6.5]} color="#2d6fb0" />

      {/* Fluorescent panels. */}
      {[-3, 0, 3].flatMap((x) =>
        [-3, 0, 3].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 3.28, z]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.8, 0.35]} />
            <meshBasicMaterial color="#fffbe8" toneMapped={false} />
          </mesh>
        )),
      )}

      <BackgroundTable position={[-4.5, 0, -3.5]} />
      <BackgroundTable position={[4.6, 0, -3.8]} />
      <BackgroundTable position={[-4.8, 0, 2.5]} />
      <BackgroundTable position={[4.8, 0, 2.2]} />

      <hemisphereLight args={['#ffe9c4', '#3f8f8a', 1.9]} />
      <directionalLight position={[3, 2.5, 4]} intensity={1.1} color="#7fd6d0" />
      <directionalLight
        position={[-5, 4, -3]}
        intensity={2.2}
        color="#ffd9a0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <pointLight position={[0, 2.6, 0]} intensity={12} distance={10} color="#fff3d6" />
    </group>
  );
}

export { PlasticChair };
