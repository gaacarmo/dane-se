import { useMemo } from 'react';
import * as THREE from 'three';
import type { Card } from '@dane-se/shared';
import { cardTexture } from '../../lib/cardTextures';

export const CARD_W = 0.18;
export const CARD_H = 0.252;

const EDGE = new THREE.MeshStandardMaterial({ color: '#e9e2cf', roughness: 0.8 });

/** A card lying along +Z up: front on +Z, back on -Z. Rotate -90° about X to lay it face up on the table. */
export function Card3D({
  card,
  highlight,
  dim,
  face,
}: {
  card: Card | null;
  highlight?: boolean;
  dim?: boolean;
  /** Face texture to use instead of the Dane-se card (poker cards). */
  face?: THREE.Texture;
}) {
  const materials = useMemo(() => {
    // Unlit faces: the same crisp colors from any angle and under any scene light (black stays black).
    const color = dim ? '#8a8a8a' : '#f2ecdd';
    return [
      EDGE,
      EDGE,
      EDGE,
      EDGE,
      new THREE.MeshBasicMaterial({ map: face ?? cardTexture(card, highlight), color, toneMapped: false }),
      new THREE.MeshBasicMaterial({ map: cardTexture(null), color, toneMapped: false }),
    ];
  }, [card, highlight, dim, face]);
  return (
    <mesh material={materials} castShadow receiveShadow>
      <boxGeometry args={[CARD_W, CARD_H, 0.003]} />
    </mesh>
  );
}
