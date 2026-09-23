// Tiny synthesized sound set plus one looping backing track. Effects are
// short oscillator or noise bursts through one gain node, so they never block
// on a network fetch. The music is a 300 KB chiptune lofi loop rendered by
// scripts/block-runner-music.mjs; it is fetched lazily and decoded into an
// AudioBuffer so the loop point is sample-accurate.
//
// Browsers only allow audio after a user gesture, so the context is created
// lazily on the first play call, which the game reaches from a key press.

const STORAGE_KEY = 'block-runner:muted';
const MUSIC_URL = '/audio/block-runner-lofi.mp3';
const MUSIC_GAIN = 0.5;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private musicLoad: Promise<void> | null = null;
  /** The game wants music; playback follows this once the buffer is decoded. */
  private musicWanted = false;
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
    if (muted) this.haltMusic(0.05);
    else if (this.musicWanted) this.startMusic();
  }

  /**
   * Create or resume the context from inside a user gesture. Mobile browsers
   * refuse audio started later from a timer, so input handlers call this
   * before the game loop gets to play anything.
   */
  unlock(): void {
    if (this.muted) return;
    this.ensure();
    // Kick off the fetch now so the loop is decoded by the time a run starts.
    void this.loadMusic();
  }

  /** Loop the backing track. Safe to call repeatedly; starts once decoded. */
  startMusic(): void {
    this.musicWanted = true;
    if (this.muted || this.musicSource) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (!this.musicBuffer) {
      void this.loadMusic().then(() => {
        if (this.musicWanted) this.startMusic();
      });
      return;
    }
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.connect(this.master);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true;
    src.connect(this.musicGain);
    const now = ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.001, now);
    this.musicGain.gain.exponentialRampToValueAtTime(MUSIC_GAIN, now + 0.4);
    src.start(now);
    this.musicSource = src;
  }

  /** Fade the track out; the next startMusic begins from the top. */
  stopMusic(fade = 0.8): void {
    this.musicWanted = false;
    this.haltMusic(fade);
  }

  private haltMusic(fade: number): void {
    const src = this.musicSource;
    if (!src || !this.ctx || !this.musicGain) return;
    this.musicSource = null;
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(Math.max(0.001, this.musicGain.gain.value), now);
    this.musicGain.gain.exponentialRampToValueAtTime(0.001, now + fade);
    src.stop(now + fade + 0.02);
  }

  private loadMusic(): Promise<void> {
    if (this.musicLoad) return this.musicLoad;
    const ctx = this.ensure();
    if (!ctx) return Promise.resolve();
    this.musicLoad = fetch(MUSIC_URL)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        this.musicBuffer = buffer;
      })
      .catch(() => {
        // No music is fine; the effects still play. Allow a retry later.
        this.musicLoad = null;
      });
    return this.musicLoad;
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
