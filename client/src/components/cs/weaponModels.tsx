import type { WeaponCategory } from '@dane-se/shared';

/** Posição do cano de cada arma no espaço da arma (z negativo é para a frente). */
export const MUZZLE_Z: Record<WeaponCategory, number> = { pistol: -0.25, smg: -0.44, rifle: -0.66, sniper: -0.96 };

const METAL = '#2b2e34';
const METAL_LIGHT = '#454a53';
const DARK = '#17181b';

function Part({
  pos,
  size,
  color = METAL,
  rot,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  color?: string;
  rot?: [number, number, number];
}) {
  return (
    <mesh position={pos} rotation={rot}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.55} />
    </mesh>
  );
}

function Barrel({ z, length, radius = 0.011 }: { z: number; length: number; radius?: number }) {
  return (
    <mesh position={[0, 0.012, z - length / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshStandardMaterial color={DARK} roughness={0.4} metalness={0.7} />
    </mesh>
  );
}

function Skin({ pos, size, color }: { pos: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

/** Armas em caixas, vistas em primeira pessoa, com a mão e a manga do personagem. */
export function WeaponModel({ category, skin, sleeve }: { category: WeaponCategory; skin: string; sleeve: string }) {
  switch (category) {
    case 'pistol':
      return (
        <group>
          <Part pos={[0, 0.012, -0.11]} size={[0.036, 0.04, 0.2]} />
          <Part pos={[0, -0.016, -0.09]} size={[0.034, 0.028, 0.17]} color={METAL_LIGHT} />
          <Part pos={[0, -0.064, -0.01]} size={[0.032, 0.09, 0.045]} rot={[0.25, 0, 0]} color={DARK} />
          <Barrel z={-0.2} length={0.05} radius={0.009} />
          <Part pos={[0, 0.038, -0.02]} size={[0.018, 0.012, 0.012]} />
          <Part pos={[0, 0.038, -0.205]} size={[0.01, 0.012, 0.01]} />
          <Skin pos={[0.004, -0.07, 0.012]} size={[0.05, 0.06, 0.06]} color={skin} />
          <Part pos={[0.03, -0.12, 0.12]} size={[0.066, 0.066, 0.28]} rot={[-0.35, 0, 0]} color={sleeve} />
        </group>
      );
    case 'smg':
      return (
        <group>
          <Part pos={[0, 0.005, -0.18]} size={[0.05, 0.07, 0.3]} />
          <Part pos={[0, 0.002, -0.38]} size={[0.04, 0.045, 0.12]} color={METAL_LIGHT} />
          <Barrel z={-0.44} length={0.1} radius={0.012} />
          <Part pos={[0, -0.01, 0.06]} size={[0.034, 0.06, 0.16]} color={DARK} />
          <Part pos={[0, -0.1, -0.2]} size={[0.03, 0.12, 0.05]} color={METAL_LIGHT} />
          <Part pos={[0, -0.07, -0.06]} size={[0.032, 0.09, 0.042]} rot={[0.3, 0, 0]} color={DARK} />
          <Part pos={[0, 0.048, -0.1]} size={[0.018, 0.022, 0.014]} />
          <Skin pos={[0.004, -0.075, -0.045]} size={[0.05, 0.06, 0.06]} color={skin} />
          <Skin pos={[-0.02, -0.05, -0.34]} size={[0.052, 0.052, 0.08]} color={skin} />
          <Part pos={[0.04, -0.13, 0.1]} size={[0.07, 0.07, 0.3]} rot={[-0.3, 0, 0]} color={sleeve} />
          <Part pos={[-0.09, -0.13, -0.2]} size={[0.07, 0.07, 0.34]} rot={[-0.15, -0.25, 0]} color={sleeve} />
        </group>
      );
    case 'rifle':
      return (
        <group>
          <Part pos={[0, 0.005, -0.18]} size={[0.048, 0.072, 0.34]} />
          <Part pos={[0, -0.003, -0.42]} size={[0.05, 0.056, 0.24]} color={METAL_LIGHT} />
          <Barrel z={-0.54} length={0.14} radius={0.012} />
          <Part pos={[0, -0.012, 0.1]} size={[0.04, 0.078, 0.2]} color={DARK} />
          <Part pos={[0, -0.1, -0.22]} size={[0.034, 0.13, 0.05]} rot={[0.18, 0, 0]} color={METAL_LIGHT} />
          <Part pos={[0, -0.078, -0.06]} size={[0.034, 0.09, 0.042]} rot={[0.3, 0, 0]} color={DARK} />
          <Part pos={[0, 0.052, -0.08]} size={[0.02, 0.03, 0.016]} />
          <Part pos={[0, 0.048, -0.55]} size={[0.012, 0.04, 0.012]} />
          <Skin pos={[0.004, -0.078, -0.045]} size={[0.05, 0.06, 0.06]} color={skin} />
          <Skin pos={[-0.015, -0.06, -0.4]} size={[0.052, 0.052, 0.08]} color={skin} />
          <Part pos={[0.045, -0.135, 0.1]} size={[0.072, 0.072, 0.32]} rot={[-0.3, 0, 0]} color={sleeve} />
          <Part pos={[-0.1, -0.14, -0.22]} size={[0.072, 0.072, 0.36]} rot={[-0.15, -0.28, 0]} color={sleeve} />
        </group>
      );
    case 'sniper':
      return (
        <group>
          <Part pos={[0, 0.005, -0.2]} size={[0.05, 0.08, 0.38]} />
          <Part pos={[0, 0.0, -0.5]} size={[0.04, 0.045, 0.24]} color={METAL_LIGHT} />
          <Barrel z={-0.62} length={0.34} radius={0.013} />
          <Part pos={[0, -0.01, 0.12]} size={[0.045, 0.09, 0.26]} color={DARK} />
          <mesh position={[0, 0.07, -0.18]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.028, 0.032, 0.26, 14]} />
            <meshStandardMaterial color={DARK} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.07, -0.312]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.024, 0.024, 0.004, 14]} />
            <meshStandardMaterial color="#6fa0c8" roughness={0.1} metalness={0.2} emissive="#2a4a66" emissiveIntensity={0.6} />
          </mesh>
          <Part pos={[0.04, 0.012, -0.08]} size={[0.03, 0.012, 0.012]} color={METAL_LIGHT} />
          <Part pos={[0, -0.09, -0.2]} size={[0.034, 0.09, 0.05]} color={METAL_LIGHT} />
          <Part pos={[0, -0.078, -0.06]} size={[0.034, 0.09, 0.042]} rot={[0.3, 0, 0]} color={DARK} />
          <Skin pos={[0.004, -0.078, -0.045]} size={[0.05, 0.06, 0.06]} color={skin} />
          <Skin pos={[-0.015, -0.06, -0.45]} size={[0.052, 0.052, 0.08]} color={skin} />
          <Part pos={[0.045, -0.135, 0.1]} size={[0.072, 0.072, 0.32]} rot={[-0.3, 0, 0]} color={sleeve} />
          <Part pos={[-0.1, -0.14, -0.26]} size={[0.072, 0.072, 0.4]} rot={[-0.15, -0.28, 0]} color={sleeve} />
        </group>
      );
  }
}
