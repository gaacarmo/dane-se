import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CharacterId } from '@dane-se/shared';
import { portraitUrl } from '../../lib/characters';
import { CHARACTER_SPECS } from './characterSpecs';

/** Pixel rectangle of the head in the source PNG, plus where the top of the head and the chin are. */
interface Crop {
  w: number;
  h: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  top: number;
  chin: number;
}

const CROPS: Record<CharacterId, Crop> = {
  carmelo: { w: 519, h: 481, x0: 180, x1: 355, y0: 40, y1: 250, top: 45, chin: 215 },
  martelo: { w: 500, h: 500, x0: 140, x1: 370, y0: 20, y1: 330, top: 22, chin: 298 },
  babin: { w: 500, h: 500, x0: 188, x1: 308, y0: 15, y1: 160, top: 18, chin: 135 },
  dezin: { w: 500, h: 500, x0: 140, x1: 365, y0: 20, y1: 320, top: 22, chin: 292 },
  sornitas: { w: 500, h: 500, x0: 135, x1: 375, y0: 28, y1: 380, top: 30, chin: 335 },
  colombo: { w: 375, h: 666, x0: 70, x1: 330, y0: 125, y1: 520, top: 130, chin: 470 },
};

/** World height from chin to the top of the head (caricature-sized). */
export const FACE_HEIGHT = 0.5;
const FADE = 0.16;

/**
 * The head cut out of the character's portrait. Origin is the chin. `gaze` is
 * where they look on screen (-1 left, 0 at you, 1 right): the head squashes
 * through zero and flips to turn, so it reads as a quick look to the side.
 */
export function PortraitHead({ id, gaze, nod }: { id: CharacterId; gaze: number; nod: number }) {
  const crop = CROPS[id];
  const natural = CHARACTER_SPECS[id].faces;
  const base = useTexture(portraitUrl(id));
  const ref = useRef<THREE.Group>(null);
  const turn = useRef(1);

  const { texture, geometry } = useMemo(() => {
    const cw = crop.x1 - crop.x0;
    const ch = crop.y1 - crop.y0;
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g2 = c.getContext('2d')!;
    g2.drawImage(base.image as CanvasImageSource, crop.x0, crop.y0, cw, ch, 0, 0, cw, ch);
    g2.globalCompositeOperation = 'destination-out';
    const grad = g2.createLinearGradient(0, ch * (1 - FADE), 0, ch);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g2.fillStyle = grad;
    g2.fillRect(0, ch * (1 - FADE), cw, ch * FADE);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;

    const k = FACE_HEIGHT / (crop.chin - crop.top);
    const geo = new THREE.PlaneGeometry(cw * k, ch * k, 1, 1);
    geo.translate(0, (crop.chin - (crop.y0 + crop.y1) / 2) * k, 0);
    return { texture: t, geometry: geo };
  }, [base, crop]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const s = Math.round(gaze);
    // A portrait that already looks to one side must be mirrored to look to the other.
    const targetFlip = natural !== 0 && s !== 0 && s !== natural ? -1 : 1;
    const squash = natural === 0 ? 1 - Math.abs(s) * 0.07 : 1;
    turn.current = THREE.MathUtils.damp(turn.current, targetFlip * squash, 12, dt);
    g.scale.x = turn.current;
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, natural === 0 ? -s * 0.09 : -s * 0.03, 8, dt);
    g.position.x = THREE.MathUtils.damp(g.position.x, natural === 0 ? s * 0.03 : 0, 8, dt);
    g.position.y = nod * 0.012 * Math.sin(performance.now() / 120);
  });

  return (
    <group ref={ref}>
      <mesh geometry={geometry}>
        <meshBasicMaterial map={texture} transparent alphaTest={0.02} side={THREE.DoubleSide} color="#f4ead8" toneMapped={false} />
      </mesh>
    </group>
  );
}
