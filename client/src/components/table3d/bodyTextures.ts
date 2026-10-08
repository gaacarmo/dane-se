import * as THREE from 'three';
import type { CharacterSpec } from './characterSpecs';

const BODY = 512;

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/** Upper body seen from the front: torso, shoulders, sleeves, drawn in a clean flat style. */
export function bodyTexture(spec: CharacterSpec): THREE.CanvasTexture {
  const [c, g] = canvasOf(BODY, BODY);
  const { base, accent, pattern, hood } = spec.shirt;

  const torso = new Path2D();
  torso.moveTo(190, 0);
  torso.lineTo(322, 0);
  torso.quadraticCurveTo(430, 14, 462, 110);
  torso.lineTo(472, BODY);
  torso.lineTo(40, BODY);
  torso.lineTo(50, 110);
  torso.quadraticCurveTo(82, 14, 190, 0);
  torso.closePath();

  g.save();
  g.clip(torso);
  g.fillStyle = base;
  g.fillRect(0, 0, BODY, BODY);
  g.fillStyle = accent;
  if (pattern === 'hoops') {
    for (let y = 70; y < BODY; y += 84) g.fillRect(0, y, BODY, 44);
  } else if (pattern === 'band') {
    g.fillRect(0, 250, BODY, 44);
    g.fillRect(0, 316, BODY, 18);
  } else if (pattern === 'sash') {
    g.save();
    g.translate(180, 0);
    g.rotate(-0.62);
    g.fillRect(-34, -60, 68, 760);
    g.restore();
  }
  // Soft volume: lighter on the left, darker on the right and at the bottom.
  const side = g.createLinearGradient(0, 0, BODY, 0);
  side.addColorStop(0, 'rgba(255,255,255,0.14)');
  side.addColorStop(0.5, 'rgba(255,255,255,0)');
  side.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = side;
  g.fillRect(0, 0, BODY, BODY);
  // Arms: a seam on each side.
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 5;
  for (const x of [112, 400]) {
    g.beginPath();
    g.moveTo(x, 80);
    g.quadraticCurveTo(x + (x < 256 ? -10 : 10), 240, x + (x < 256 ? 8 : -8), BODY);
    g.stroke();
  }
  g.restore();

  // Collar / neckline.
  g.fillStyle = hood ? shade(base, 0.05) : spec.skin;
  g.beginPath();
  g.ellipse(256, 6, hood ? 92 : 70, hood ? 38 : 30, 0, 0, Math.PI);
  g.fill();
  if (hood) {
    g.fillStyle = shade(base, -0.05);
    g.beginPath();
    g.ellipse(256, 6, 64, 22, 0, 0, Math.PI);
    g.fill();
  }

  if (spec.badge) {
    g.fillStyle = spec.badge;
    g.beginPath();
    g.arc(spec.shirt.pattern === 'sash' ? 350 : 340, 160, 26, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 4;
    g.stroke();
  }

  g.strokeStyle = 'rgba(30,18,12,0.55)';
  g.lineWidth = 5;
  g.stroke(torso);
  return tex(c);
}

/** A forearm and hand lying on the table, seen from above. Fingers point toward the bottom of the canvas. */
export function handTexture(spec: CharacterSpec, side: 1 | -1): THREE.CanvasTexture {
  const w = 128;
  const h = 320;
  const [c, g] = canvasOf(w, h);
  const outline = 'rgba(30,18,12,0.6)';
  g.lineWidth = 4;
  g.strokeStyle = outline;

  // Sleeve.
  g.fillStyle = spec.shirt.base;
  g.beginPath();
  g.roundRect(30, 0, 68, 120, 12);
  g.fill();
  g.stroke();
  // Forearm.
  g.fillStyle = spec.skin;
  g.beginPath();
  g.roundRect(36, 110, 56, 100, 14);
  g.fill();
  // Palm.
  g.beginPath();
  g.ellipse(64, 224, 36, 40, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Fingers.
  for (let i = 0; i < 4; i++) {
    const x = 40 + i * 16;
    g.beginPath();
    g.roundRect(x - 7, 236, 14, 70 - Math.abs(i - 1.5) * 8, 7);
    g.fill();
    g.stroke();
  }
  // Thumb.
  g.beginPath();
  g.save();
  g.translate(64 - side * 36, 222);
  g.rotate(side * -0.5);
  g.roundRect(-8, 0, 16, 48, 8);
  g.restore();
  g.fill();
  g.stroke();
  // Palm again to hide the finger roots.
  g.fillStyle = spec.skin;
  g.beginPath();
  g.ellipse(64, 226, 33, 34, 0, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}
