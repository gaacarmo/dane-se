import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CharacterId } from '@dane-se/shared';
import { PortraitHead } from './PortraitHead';
import { bodyTexture, handTexture } from './bodyTextures';
import { CHARACTER_SPECS } from './characterSpecs';

const CHIN_Y = 1.2;
const TABLE_TOP = 0.762;
const BODY_SIZE = 0.74;

/**
 * A seated player, built from flat layers: a drawn body, the head cut out of
 * their portrait and two hands lying on the table. The seat's local +Z points
 * at the middle of the table. The body and head always face the camera.
 */
export function Player2D({
  id,
  gaze,
  active,
  showBody = true,
  children,
}: {
  id: CharacterId;
  /** -1 looks to the left of the screen, 1 to the right, 0 at the camera. */
  gaze: number;
  active?: boolean;
  /** Your own seat has no body in view, only your hands. */
  showBody?: boolean;
  /** Anchored above the head (name tag, forehead card). */
  children?: React.ReactNode;
}) {
  const spec = CHARACTER_SPECS[id];
  const body = useMemo(() => bodyTexture(spec), [spec]);
  const handL = useMemo(() => handTexture(spec, -1), [spec]);
  const handR = useMemo(() => handTexture(spec, 1), [spec]);
  const billboard = useRef<THREE.Group>(null);
  const bodyGeo = useMemo(() => new THREE.PlaneGeometry(BODY_SIZE, BODY_SIZE).translate(0, -BODY_SIZE / 2, 0), []);

  useFrame(({ camera }) => {
    const g = billboard.current;
    if (!g) return;
    g.lookAt(camera.position.x, g.getWorldPosition(new THREE.Vector3()).y, camera.position.z);
  });

  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.2, TABLE_TOP + 0.004, 0.74]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.15, 0.375]} />
          <meshBasicMaterial map={side < 0 ? handL : handR} transparent alphaTest={0.02} toneMapped={false} color="#f4ead8" />
        </mesh>
      ))}
      {showBody && (
        <group ref={billboard} position={[0, CHIN_Y, 0.1]}>
          <mesh geometry={bodyGeo} position={[0, -0.03, -0.01]}>
            <meshBasicMaterial map={body} transparent alphaTest={0.02} side={THREE.DoubleSide} toneMapped={false} color="#f4ead8" />
          </mesh>
          <PortraitHead id={id} gaze={gaze} nod={active ? 1 : 0} />
          {children}
        </group>
      )}
    </group>
  );
}
