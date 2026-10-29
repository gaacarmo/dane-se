import type { HitZone, Vec3, WeaponCategory } from '@dane-se/shared';
import { getPrefs } from './prefs';

/**
 * Sons do modo CS sintetizados em WebAudio (sem arquivos). Os sons do mundo têm pan estéreo e atenuação pela
 * distância até o ouvinte, e passam por um filtro que abafa o que está longe.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
const listener = { x: 0, y: 0, z: 0, yaw: 0 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function audio(): AudioContext | null {
  if (getPrefs().muted) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.7;
      const compressor = ctx.createDynamicsCompressor();
      master.connect(compressor).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function noise(a: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

interface Spot {
  gain: number;
  pan: number;
  lowpass: number;
}

function spot(pos: Vec3 | null, reference = 10): Spot {
  if (!pos) return { gain: 1, pan: 0, lowpass: 20000 };
  const dx = pos.x - listener.x;
  const dz = pos.z - listener.z;
  const distance = Math.hypot(dx, pos.y - listener.y, dz);
  const rightX = Math.cos(listener.yaw);
  const rightZ = -Math.sin(listener.yaw);
  return {
    gain: 1 / (1 + Math.pow(distance / reference, 1.4)),
    pan: distance < 0.5 ? 0 : clamp((dx * rightX + dz * rightZ) / distance, -1, 1) * 0.9,
    lowpass: 900 + 14000 / (1 + distance / 10),
  };
}

/** Cadeia ganho -> filtro -> pan -> saída; as fontes se ligam ao nó devolvido. */
function bus(a: AudioContext, s: Spot): AudioNode {
  const gain = a.createGain();
  gain.gain.value = s.gain;
  const lowpass = a.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = s.lowpass;
  gain.connect(lowpass);
  if (typeof a.createStereoPanner === 'function') {
    const panner = a.createStereoPanner();
    panner.pan.value = s.pan;
    lowpass.connect(panner).connect(master!);
  } else {
    lowpass.connect(master!);
  }
  return gain;
}

interface BurstOptions {
  at?: number;
  dur: number;
  from: number;
  to: number;
  gain: number;
  type?: BiquadFilterType;
  q?: number;
}

function burst(a: AudioContext, dest: AudioNode, { at = 0, dur, from, to, gain, type = 'lowpass', q = 0.7 }: BurstOptions): void {
  const t = a.currentTime + at;
  const source = a.createBufferSource();
  source.buffer = noise(a);
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const env = a.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(filter).connect(env).connect(dest);
  source.start(t, Math.random() * 0.5);
  source.stop(t + dur + 0.05);
}

interface ToneOptions {
  at?: number;
  freq: number;
  to?: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
}

function tone(a: AudioContext, dest: AudioNode, { at = 0, freq, to, dur, gain, type = 'sine' }: ToneOptions): void {
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const env = a.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

const SHOT: Record<WeaponCategory, { dur: number; thump: [number, number, number, number]; crack: number; tail: number }> = {
  pistol: { dur: 0.12, thump: [180, 60, 0.09, 0.35], crack: 0.25, tail: 0 },
  smg: { dur: 0.09, thump: [150, 55, 0.07, 0.28], crack: 0.2, tail: 0 },
  rifle: { dur: 0.18, thump: [120, 40, 0.14, 0.5], crack: 0.3, tail: 0.12 },
  sniper: { dur: 0.45, thump: [90, 30, 0.3, 0.7], crack: 0.45, tail: 0.2 },
};

export const csAudio = {
  setListener(pos: Vec3, yaw: number): void {
    listener.x = pos.x;
    listener.y = pos.y;
    listener.z = pos.z;
    listener.yaw = yaw;
  },

  shot(category: WeaponCategory, from: Vec3, own: boolean): void {
    const a = audio();
    if (!a) return;
    const p = SHOT[category];
    const out = bus(a, own ? spot(null) : spot(from, 12));
    const pitch = rand(0.92, 1.08);
    burst(a, out, { dur: p.dur, from: 3500 * pitch, to: 700, gain: 0.55 });
    burst(a, out, { dur: 0.03, from: 2800, to: 2200, gain: p.crack, type: 'bandpass', q: 1.2 });
    tone(a, out, { freq: p.thump[0] * pitch, to: p.thump[1], dur: p.thump[2], gain: p.thump[3] });
    if (p.tail > 0) burst(a, out, { at: 0.03, dur: category === 'sniper' ? 1 : 0.35, from: 900, to: 200, gain: p.tail });
  },

  /** Retirar e encaixar o pente. */
  reload(reloadMs: number): void {
    const a = audio();
    if (!a) return;
    const out = bus(a, spot(null));
    burst(a, out, { dur: 0.05, from: 1800, to: 1200, gain: 0.22, type: 'bandpass', q: 2 });
    burst(a, out, { at: (reloadMs / 1000) * 0.62, dur: 0.06, from: 1400, to: 900, gain: 0.3, type: 'bandpass', q: 2 });
    tone(a, out, { at: (reloadMs / 1000) * 0.62, freq: 220, to: 120, dur: 0.07, gain: 0.12 });
  },

  empty(): void {
    const a = audio();
    if (!a) return;
    tone(a, bus(a, spot(null)), { freq: 900, dur: 0.03, gain: 0.12, type: 'square' });
  },

  switchWeapon(): void {
    const a = audio();
    if (!a) return;
    burst(a, bus(a, spot(null)), { dur: 0.07, from: 1200, to: 600, gain: 0.2, type: 'bandpass', q: 1.5 });
  },

  /** Marcador de acerto: seco no corpo, agudo no tiro na cabeça e grave com subida na morte. */
  hit(zone: HitZone, killed: boolean): void {
    const a = audio();
    if (!a) return;
    const out = bus(a, spot(null));
    if (killed) {
      tone(a, out, { freq: 520, dur: 0.09, gain: 0.22 });
      tone(a, out, { at: 0.07, freq: 780, dur: 0.14, gain: 0.22 });
    } else if (zone === 'head') {
      tone(a, out, { freq: 2200, dur: 0.06, gain: 0.26 });
      tone(a, out, { at: 0.04, freq: 3100, dur: 0.08, gain: 0.2 });
    } else {
      tone(a, out, { freq: 1500, dur: 0.045, gain: 0.2 });
    }
  },

  hurt(): void {
    const a = audio();
    if (!a) return;
    const out = bus(a, spot(null));
    burst(a, out, { dur: 0.12, from: 700, to: 250, gain: 0.35 });
    tone(a, out, { freq: 110, to: 60, dur: 0.14, gain: 0.3 });
  },

  step(from: Vec3, own: boolean): void {
    const a = audio();
    if (!a) return;
    const s = own ? { gain: 0.35, pan: 0, lowpass: 1800 } : spot(from, 6);
    if (!own && s.gain < 0.04) return;
    burst(a, bus(a, s), { dur: 0.05, from: rand(500, 800), to: 250, gain: 0.22, type: 'bandpass', q: 0.9 });
  },

  bombBeep(pos: Vec3): void {
    const a = audio();
    if (!a) return;
    tone(a, bus(a, spot(pos, 18)), { freq: 880, dur: 0.07, gain: 0.3, type: 'square' });
  },

  plantStart(pos: Vec3): void {
    const a = audio();
    if (!a) return;
    tone(a, bus(a, spot(pos, 14)), { freq: 300, to: 600, dur: 0.5, gain: 0.12, type: 'triangle' });
  },

  planted(pos: Vec3): void {
    const a = audio();
    if (!a) return;
    const out = bus(a, spot(pos, 30));
    for (let i = 0; i < 3; i++) tone(a, out, { at: i * 0.16, freq: 660, dur: 0.1, gain: 0.3, type: 'square' });
  },

  defuseStart(pos: Vec3): void {
    const a = audio();
    if (!a) return;
    tone(a, bus(a, spot(pos, 14)), { freq: 500, to: 380, dur: 0.6, gain: 0.12, type: 'triangle' });
  },

  defused(pos: Vec3): void {
    const a = audio();
    if (!a) return;
    const out = bus(a, spot(pos, 30));
    [523, 659, 784].forEach((freq, i) => tone(a, out, { at: i * 0.09, freq, dur: 0.18, gain: 0.25 }));
  },

  explode(pos: Vec3): void {
    const a = audio();
    if (!a) return;
    const out = bus(a, spot(pos, 40));
    burst(a, out, { dur: 1.4, from: 1800, to: 80, gain: 1 });
    tone(a, out, { freq: 70, to: 20, dur: 0.9, gain: 0.9 });
  },

  roundStart(): void {
    const a = audio();
    if (!a) return;
    const out = bus(a, spot(null));
    tone(a, out, { freq: 440, dur: 0.12, gain: 0.18 });
    tone(a, out, { at: 0.12, freq: 660, dur: 0.18, gain: 0.18 });
  },

  roundEnd(won: boolean): void {
    const a = audio();
    if (!a) return;
    const out = bus(a, spot(null));
    const notes = won ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((freq, i) => tone(a, out, { at: i * 0.14, freq, dur: 0.22, gain: 0.2, type: 'triangle' }));
  },
};
