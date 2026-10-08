import { useMemo } from 'react';
import * as THREE from 'three';
import type { Card } from '@dane-se/shared';
import { cardTexture } from '../../lib/cardTextures';

export const CARD_W = 0.18;
export const CARD_H = 0.252;

const EDGE = new THREE.MeshStandardMaterial({ color: '#e9e2cf', roughness: 0.8 });

/** A card lying along +Z up: front on +Z, back on -Z. Rotate -90° about X to lay it face up on the table. */
export function Card3D({ card, highlight, dim }: { card: Card | null; highlight?: boolean; dim?: boolean }) {
  const materials = useMemo(() => {
    const color = dim ? '#8a8a8a' : '#ffffff';
    return [
      EDGE,
      EDGE,
      EDGE,
      EDGE,
      new THREE.MeshStandardMaterial({ map: cardTexture(card, highlight), roughness: 0.55, color }),
      new THREE.MeshStandardMaterial({ map: cardTexture(null), roughness: 0.55, color }),
    ];
  }, [card, highlight, dim]);
  return (
    <mesh material={materials} castShadow receiveShadow>
      <boxGeometry args={[CARD_W, CARD_H, 0.003]} />
    </mesh>
  );
}
