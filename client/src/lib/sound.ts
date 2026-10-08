import { getPrefs } from './prefs';

/**
 * All sounds are synthesized with WebAudio at runtime: no audio files, nothing
 * copyrighted, nothing to download.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (getPrefs().muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Mobile browsers only allow audio after a user gesture: unlock on the first tap.
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

interface ToneOptions {
  freq: number;
  /** Seconds from now. */
  at?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function tone(a: AudioContext, { freq, at = 0, dur, type = 'sine', gain = 0.18, slideTo }: ToneOptions): void {
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;

/** A short burst of filtered noise: the "flick" of a card. */
function noise(a: AudioContext, { at = 0, dur, freq, gain = 0.25, q = 1 }: { at?: number; dur: number; freq: number; gain?: number; q?: number }): void {
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, t);
  filter.Q.value = q;
  const env = a.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(a.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  /** One flick per card dealt (capped so big deals don't get noisy). */
  deal(cards: number, spacing = 0.07): void {
    const a = audio();
    if (!a) return;
    for (let i = 0; i < Math.min(cards, 14); i++) noise(a, { at: i * spacing, dur: 0.06, freq: 2600, gain: 0.12, q: 0.8 });
  },
  play(): void {
    const a = audio();
    if (!a) return;
    noise(a, { dur: 0.08, freq: 1500, gain: 0.3, q: 0.7 });
    tone(a, { freq: 150, dur: 0.09, gain: 0.12, slideTo: 70 });
  },
  collect(): void {
    const a = audio();
    if (!a) return;
    noise(a, { dur: 0.25, freq: 900, gain: 0.12, q: 0.5 });
  },
  trickWon(): void {
    const a = audio();
    if (!a) return;
    tone(a, { freq: 660, dur: 0.12, type: 'triangle', gain: 0.14 });
    tone(a, { freq: 990, at: 0.09, dur: 0.18, type: 'triangle', gain: 0.14 });
  },
  letter(): void {
    const a = audio();
    if (!a) return;
    tone(a, { freq: 392, dur: 0.22, type: 'triangle', gain: 0.18, slideTo: 300 });
    tone(a, { freq: 294, at: 0.2, dur: 0.4, type: 'triangle', gain: 0.18, slideTo: 196 });
  },
  /** Someone sent an emoji reaction. */
  pop(): void {
    const a = audio();
    if (!a) return;
    tone(a, { freq: 520, dur: 0.12, gain: 0.08, slideTo: 880 });
  },
  turn(): void {
    const a = audio();
    if (!a) return;
    tone(a, { freq: 880, dur: 0.25, gain: 0.1 });
    tone(a, { freq: 1320, at: 0.06, dur: 0.3, gain: 0.06 });
  },
  win(): void {
    const a = audio();
    if (!a) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(a, { freq: f, at: i * 0.12, dur: 0.35, type: 'triangle', gain: 0.15 }));
  },
  lose(): void {
    const a = audio();
    if (!a) return;
    [330, 262, 196].forEach((f, i) => tone(a, { freq: f, at: i * 0.18, dur: 0.35, type: 'triangle', gain: 0.14 }));
  },
};

/** Short vibration on phones that support it (respects the haptics preference). */
export function haptic(pattern: number | number[]): void {
  if (!getPrefs().haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}
