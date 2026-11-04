import * as THREE from 'three';

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let glow: THREE.CanvasTexture | null = null;
let hole: THREE.CanvasTexture | null = null;

/** Disco branco com borda suave: base de faíscas, poeira, sangue e flash do cano. */
export function glowTexture(): THREE.CanvasTexture {
  glow ??= canvasTexture(64, (g, s) => {
    const gradient = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, s, s);
  });
  return glow;
}

/** Furo de bala: miolo escuro com um anel de poeira ao redor. */
export function holeTexture(): THREE.CanvasTexture {
  hole ??= canvasTexture(64, (g, s) => {
    const ring = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
    ring.addColorStop(0, 'rgba(10,10,10,0.95)');
    ring.addColorStop(0.45, 'rgba(20,20,20,0.85)');
    ring.addColorStop(0.7, 'rgba(60,58,54,0.35)');
    ring.addColorStop(1, 'rgba(60,58,54,0)');
    g.fillStyle = ring;
    g.fillRect(0, 0, s, s);
  });
  return hole;
}
