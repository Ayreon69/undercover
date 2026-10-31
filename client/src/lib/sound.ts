// Sons synthétisés (Web Audio), aucun fichier à charger : machine à écrire, tampon, carillons.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Une note de vibraphone, pour les moments heureux. */
function vibe(freq: number, delay = 0, gain = 0.07): void {
  tone(freq, 1.0, { gain, delay });
  tone(freq * 4, 0.3, { gain: gain * 0.25, delay });
}

const A4 = 440;
const minor = (n: number) => A4 * 2 ** ([0, 3, 5, 7, 10, 12, 15, 17][n] / 12);

export const sfx = {
  /** Une touche de machine à écrire. */
  key: () => noise(0.025, { gain: 0.22, freq: 2600, q: 3 }),
  /** Le mot se découvre : un volet qu'on remonte. */
  reveal: () => {
    noise(0.18, { gain: 0.12, freq: 900, q: 1.2, fade: 0.8 });
    tone(330, 0.2, { type: 'triangle', gain: 0.05, slide: 1.5 });
  },
  /** À toi de parler. */
  turn: () => {
    vibe(minor(2), 0, 0.06);
    vibe(minor(4), 0.12, 0.06);
  },
  /** Un indice arrive. */
  clue: () => {
    noise(0.02, { gain: 0.2, freq: 2400, q: 3 });
    noise(0.02, { gain: 0.18, freq: 2900, q: 3, delay: 0.07 });
    tone(1320, 0.06, { gain: 0.03, delay: 0.12 });
  },
  /** On passe au vote : deux notes graves, comme au cinéma. */
  suspense: () => {
    tone(110, 0.9, { type: 'sawtooth', gain: 0.03, attack: 0.08 });
    tone(116.5, 0.9, { type: 'sawtooth', gain: 0.03, attack: 0.08, delay: 0.02 });
  },
  /** Un vote posé. */
  pin: () => tone(740, 0.08, { gain: 0.05, slide: 0.7, type: 'triangle' }),
  /** Le tampon s'abat sur le dossier. */
  stamp: () => {
    noise(0.09, { gain: 0.55, freq: 380, q: 0.8, fade: 3 });
    tone(80, 0.25, { gain: 0.22, slide: 0.5 });
  },
  /** Fin de manche : une petite fanfare pour les gagnants, une descente pour les autres. */
  finale: (win: boolean) => {
    const notes = win ? [0, 2, 3, 4, 5, 7] : [4, 3, 1, 0];
    notes.forEach((n, i) => vibe(minor(n), i * 0.14, 0.06));
  },
  tap: () => tone(880, 0.05, { gain: 0.025, slide: 1.3 }),
};
