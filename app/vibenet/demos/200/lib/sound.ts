// Tiny synthesized sound set — no audio files. Everything is a short
// oscillator or noise burst through one gain node, so it stays under a few
// hundred bytes of code and never blocks on a network fetch.
//
// Browsers only allow audio after a user gesture, so the context is created
// lazily on the first play call, which the game reaches from a key press.

const STORAGE_KEY = 'block-runner:muted';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      /* Persistence is a convenience. */
    }
  }

  /**
   * Create or resume the context from inside a user gesture. Mobile browsers
   * refuse audio started later from a timer, so input handlers call this
   * before the game loop gets to play anything.
   */
  unlock(): void {
    if (!this.muted) this.ensure();
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, volume = 1): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration);
  }

  private noise(duration: number, volume = 1): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
    src.start();
  }

  /** Quiet click on every new head — the chain's 200 ms metronome. */
  tick(): void {
    this.tone('triangle', 1200, 900, 0.03, 0.25);
  }

  /** Suction kicking in: a rising whoosh. */
  inhaleOn(): void {
    this.noise(0.22, 0.3);
    this.tone('sawtooth', 140, 520, 0.28, 0.3);
  }

  /** A block going down the hatch. */
  gulp(): void {
    this.tone('square', 520, 160, 0.09, 0.6);
    this.tone('triangle', 260, 700, 0.12, 0.4);
  }

  /** A block hitting the rail; heavier for bigger blocks. */
  thud(weight = 0.5): void {
    this.noise(0.05, 0.3 + 0.4 * weight);
    this.tone('square', 140 - 40 * weight, 60, 0.08, 0.35 + 0.3 * weight);
  }

  land(): void {
    this.tone('triangle', 200, 120, 0.04, 0.4);
  }

  /** FULL: a rising power-up fanfare — he is briefly unstoppable. */
  stuffed(): void {
    this.tone('square', 260, 520, 0.12, 0.5);
    this.tone('square', 390, 780, 0.16, 0.45);
    this.tone('triangle', 520, 1040, 0.25, 0.4);
  }

  hurt(): void {
    this.noise(0.08, 0.5);
    this.tone('square', 300, 90, 0.22, 0.6);
  }

  heart(): void {
    this.tone('triangle', 660, 990, 0.08, 0.5);
    this.tone('triangle', 990, 1320, 0.12, 0.4);
  }

  die(): void {
    this.tone('sawtooth', 440, 110, 0.35, 0.7);
  }
}
