#!/usr/bin/env node
// Renders the Block Runner background loop: a 16-bar chiptune lofi track
// at 75 BPM, where one 16th note is exactly 200 ms — the chain's block
// cadence. Everything is synthesized here (pulse, triangle, noise), so the
// only asset the app ships is the encoded MP3.
//
//   node scripts/block-runner-music.mjs            # writes public/audio/block-runner-lofi.mp3
//   node scripts/block-runner-music.mjs --wav out  # keeps the WAV too
//
// Needs ffmpeg with libmp3lame on PATH.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SR = 32000; // MP3 supports 32 kHz; plenty for 8-bit content.
const BPM = 75;
const SIXTEENTH = 60 / BPM / 4; // 0.2 s — one block.
const BARS = 16;
const N = Math.round(BARS * 16 * SIXTEENTH * SR);
const SWING = 0.03; // seconds late for every odd 16th: the lofi lean.

const mix = new Float32Array(N);

// ---------- helpers ----------

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Time (seconds) of 16th-note `k` in bar `bar`, with swing on the off-16ths. */
const at = (bar, k) => (bar * 16 + k) * SIXTEENTH + (k % 2 ? SWING : 0);

/** Add a rendered voice into the loop, wrapping past the end so the loop seams cleanly. */
function add(start, samples, gain = 1) {
  const s0 = Math.round(start * SR);
  for (let i = 0; i < samples.length; i += 1) {
    mix[(s0 + i) % N] += samples[i] * gain;
  }
}

/** ADSR in seconds; sustain is a level. */
function env(i, len, a, d, s, r) {
  const t = i / SR;
  const tl = len / SR;
  let e;
  if (t < a) e = t / a;
  else if (t < a + d) e = 1 - (1 - s) * ((t - a) / d);
  else e = s;
  const rel = tl - t;
  if (rel < r) e *= Math.max(0, rel / r);
  return e;
}

// Pulse wave with a duty cycle, optional vibrato, optional pitch slide.
function pulse({
  hz,
  dur,
  duty = 0.5,
  a = 0.004,
  d = 0.08,
  s = 0.6,
  r = 0.05,
  vib = 0,
  slideTo = 0,
}) {
  const len = Math.round(dur * SR);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i += 1) {
    const t = i / SR;
    let f = hz;
    if (slideTo) f = hz + (slideTo - hz) * Math.min(1, t / dur);
    if (vib && t > 0.12)
      f *=
        1 +
        vib * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, (t - 0.12) / 0.2);
    phase = (phase + f / SR) % 1;
    out[i] = (phase < duty ? 1 : -1) * env(i, len, a, d, s, r);
  }
  return out;
}

// Triangle wave: the NES bass channel.
function tri({ hz, dur, a = 0.003, d = 0.1, s = 0.7, r = 0.04, slideTo = 0 }) {
  const len = Math.round(dur * SR);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i += 1) {
    const t = i / SR;
    let f = hz;
    if (slideTo) f = hz + (slideTo - hz) * Math.min(1, t / dur);
    phase = (phase + f / SR) % 1;
    // 4-bit stepped triangle like the real chip.
    const raw = 1 - 4 * Math.abs(phase - 0.5);
    out[i] = (Math.round(raw * 7.5) / 7.5) * env(i, len, a, d, s, r);
  }
  return out;
}

// Deterministic noise so every render is byte-identical.
let seed = 0x2f6e2b1;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
}

function noise({ dur, decay = 0.05, lp = 0 }) {
  const len = Math.round(dur * SR);
  const out = new Float32Array(len);
  let y = 0;
  for (let i = 0; i < len; i += 1) {
    const t = i / SR;
    let v = rnd() * 2 - 1;
    if (lp) {
      y += lp * (v - y);
      v = y;
    }
    out[i] = v * Math.exp(-t / decay);
  }
  return out;
}

// ---------- the song ----------

// Bar → chord: bass root (MIDI) and four voicing tones for pad + arp.
const CHORDS = [
  { name: "Am7", root: 45, tones: [57, 60, 64, 67] },
  { name: "Dm7", root: 38, tones: [57, 60, 62, 65] },
  { name: "G7", root: 43, tones: [55, 59, 62, 65] },
  { name: "Cmaj7", root: 48, tones: [55, 59, 60, 64] },
  { name: "Fmaj7", root: 41, tones: [57, 60, 64, 65] },
  { name: "Bm7b5", root: 47, tones: [59, 62, 65, 69] },
  { name: "E7", root: 40, tones: [56, 59, 62, 64] },
  { name: "Am7", root: 45, tones: [57, 60, 64, 67] },
];
const chordAt = (bar) => CHORDS[bar % 8];

// Melody: per bar, [16th index, MIDI, length in 16ths]. A section then B.
const MELODY = [
  [
    [2, 72, 2],
    [4, 74, 2],
    [6, 76, 4],
    [12, 74, 1],
    [13, 72, 3],
  ],
  [
    [0, 69, 4],
    [6, 72, 2],
    [8, 74, 6],
  ],
  [
    [2, 74, 2],
    [4, 71, 2],
    [6, 67, 4],
    [12, 69, 2],
    [14, 71, 2],
  ],
  [
    [0, 72, 6],
    [8, 76, 2],
    [10, 74, 2],
    [12, 72, 4],
  ],
  [
    [2, 76, 2],
    [4, 77, 2],
    [6, 76, 2],
    [8, 72, 4],
    [14, 69, 2],
  ],
  [
    [0, 71, 4],
    [4, 74, 4],
    [10, 77, 2],
    [12, 76, 4],
  ],
  [
    [0, 74, 2],
    [2, 71, 2],
    [4, 68, 4],
    [10, 64, 2],
    [12, 67, 2],
    [14, 68, 2],
  ],
  [
    [0, 69, 8],
    [12, 64, 2],
    [14, 67, 2],
  ],
  [
    [0, 81, 2],
    [2, 79, 2],
    [4, 76, 4],
    [8, 74, 2],
    [10, 76, 2],
    [12, 72, 4],
  ],
  [
    [0, 69, 2],
    [2, 72, 2],
    [4, 74, 6],
    [12, 77, 2],
    [14, 76, 2],
  ],
  [
    [0, 74, 4],
    [4, 71, 2],
    [6, 74, 2],
    [8, 79, 4],
    [14, 77, 2],
  ],
  [
    [0, 76, 6],
    [8, 72, 2],
    [10, 71, 2],
    [12, 72, 4],
  ],
  [
    [2, 81, 2],
    [4, 84, 4],
    [8, 81, 2],
    [10, 79, 2],
    [12, 77, 4],
  ],
  [
    [0, 76, 2],
    [2, 74, 2],
    [4, 71, 4],
    [8, 74, 2],
    [10, 77, 2],
    [12, 76, 4],
  ],
  [
    [0, 74, 2],
    [2, 71, 2],
    [4, 68, 2],
    [6, 71, 2],
    [8, 76, 4],
    [12, 74, 2],
    [14, 71, 2],
  ],
  [
    [0, 69, 6],
    [8, 72, 2],
    [10, 71, 2],
    [12, 67, 3],
  ],
];

// Length of a note that starts at 16th k and lasts n 16ths, honoring swing on both ends.
const noteDur = (bar, k, n, gap = 0.02) => at(bar, k + n) - at(bar, k) - gap;

for (let bar = 0; bar < BARS; bar += 1) {
  const chord = chordAt(bar);
  const next = chordAt(bar + 1);
  const bSection = bar >= 8;

  // --- Bass: root, ghost, fifth, root, seventh, root, chromatic approach.
  const root = chord.root;
  const fifth = root + 7;
  const seventh = root + 10;
  const approach = bar % 2 ? next.root + 1 : next.root - 1;
  const bassLine = [
    [0, root, 3, 1],
    [3, root, 1, 0.45],
    [6, fifth, 2, 0.9],
    [8, root, 2, 1],
    [10, seventh, 1, 0.6],
    [12, root, 2, 1],
    [14, approach, 2, 0.8],
  ];
  for (const [k, m, n, v] of bassLine) {
    add(
      at(bar, k),
      tri({ hz: midiHz(m), dur: noteDur(bar, k, n), s: 0.8, r: 0.03 }),
      0.34 * v,
    );
  }

  // --- Pad: all four chord tones on a soft 12.5 % pulse, held for the bar.
  for (const m of chord.tones) {
    add(
      at(bar, 0),
      pulse({
        hz: midiHz(m),
        dur: noteDur(bar, 0, 16, 0.06),
        duty: 0.125,
        a: 0.08,
        d: 0.3,
        s: 0.75,
        r: 0.12,
      }),
      0.045,
    );
  }

  // --- Arp: 25 % pulse cycling the chord one tone per 16th — one note per block.
  for (let k = 0; k < 16; k += 1) {
    const upDown = [0, 1, 2, 3, 2, 1][k % 6];
    const m = chord.tones[upDown] + 12;
    const accent = k % 4 === 0 ? 1 : 0.7;
    add(
      at(bar, k),
      pulse({
        hz: midiHz(m),
        dur: SIXTEENTH * 0.55,
        duty: 0.25,
        d: 0.05,
        s: 0.5,
        r: 0.03,
      }),
      0.055 * accent,
    );
  }

  // --- Lead: 50 % square with vibrato, plus a tape-style echo three 16ths later.
  for (const [k, m, n] of MELODY[bar]) {
    const dur = noteDur(bar, k, n, 0.03);
    const note = pulse({
      hz: midiHz(m),
      dur,
      duty: 0.5,
      d: 0.12,
      s: 0.55,
      r: 0.06,
      vib: 0.006,
    });
    add(at(bar, k), note, 0.2);
    add(at(bar, k) + 3 * SIXTEENTH, note, 0.06);
    add(at(bar, k) + 6 * SIXTEENTH, note, 0.02);
  }

  // --- Drums.
  const kicks = bar % 2 ? [0, 7, 10] : [0, 10];
  for (const k of kicks) {
    add(
      at(bar, k),
      tri({ hz: 150, dur: 0.16, slideTo: 42, d: 0.05, s: 0.6, r: 0.04 }),
      0.55,
    );
    add(at(bar, k), noise({ dur: 0.02, decay: 0.008 }), 0.18);
  }

  const snares = [4, 12];
  if (bar % 4 === 3) snares.push(15);
  if (bar === 15) snares.push(14);
  for (const k of snares) {
    const ghost = k === 15 || k === 14;
    const late = 0.012; // laid back
    add(
      at(bar, k) + late,
      noise({ dur: 0.14, decay: 0.045, lp: 0.55 }),
      ghost ? 0.14 : 0.4,
    );
    add(
      at(bar, k) + late,
      tri({ hz: 190, dur: 0.06, slideTo: 150, d: 0.03, s: 0.3, r: 0.02 }),
      ghost ? 0.1 : 0.28,
    );
  }

  for (let k = 0; k < 16; k += 2) {
    const open = k === 14 && bar % 4 === 3;
    const vol = k % 4 === 0 ? 0.12 : 0.085;
    add(
      at(bar, k),
      noise({ dur: open ? 0.25 : 0.035, decay: open ? 0.09 : 0.012 }),
      open ? 0.1 : vol,
    );
  }
  for (const k of [5, 13])
    add(at(bar, k), noise({ dur: 0.02, decay: 0.008 }), 0.04);
  if (bSection && bar % 2 === 0)
    add(at(bar, 11), noise({ dur: 0.02, decay: 0.008 }), 0.05);
}

// ---------- lofi master ----------

// Vinyl crackle and hiss.
for (let i = 0; i < N; i += 1) {
  if (rnd() < 0.0008) {
    const amp = (0.02 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1);
    mix[i] += amp;
    mix[(i + 1) % N] += amp * 0.5;
    mix[(i + 2) % N] += amp * 0.2;
  }
  mix[i] += (rnd() * 2 - 1) * 0.0015;
}

// Two one-pole lowpasses (≈12 dB/oct) at 6.5 kHz round off the squares like
// an old cassette, a DC-blocking highpass, then a slow tremolo wobble.
const lpk = 1 - Math.exp((-2 * Math.PI * 6500) / SR);
const hpk = 1 - Math.exp((-2 * Math.PI * 30) / SR);
let y1 = 0;
let y2 = 0;
let hp = 0;
for (let pass = 0; pass < 2; pass += 1) {
  // Run the filter across the seam twice so the loop start carries the tail's state.
  for (let i = 0; i < N; i += 1) {
    y1 += lpk * (mix[i] - y1);
    y2 += lpk * (y1 - y2);
    hp += hpk * (y2 - hp);
    if (pass === 1)
      mix[i] = (y2 - hp) * (1 + 0.035 * Math.sin((2 * Math.PI * 0.7 * i) / SR));
  }
}

// Soft clip and normalize.
let peak = 0;
for (let i = 0; i < N; i += 1) {
  mix[i] = Math.tanh(mix[i] * 1.15);
  peak = Math.max(peak, Math.abs(mix[i]));
}
const norm = 0.89 / peak;

// ---------- write WAV, encode MP3 ----------

const pcm = Buffer.alloc(44 + N * 2);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + N * 2, 4);
pcm.write("WAVE", 8);
pcm.write("fmt ", 12);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 2, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i += 1)
  pcm.writeInt16LE(Math.round(mix[i] * norm * 32767), 44 + i * 2);

const keepWav = process.argv.includes("--wav");
const outDir = join(process.cwd(), "public", "audio");
mkdirSync(outDir, { recursive: true });
const wavPath = keepWav
  ? join(outDir, "block-runner-lofi.wav")
  : join(tmpdir(), `block-runner-${process.pid}.wav`);
const mp3Path = join(outDir, "block-runner-lofi.mp3");
writeFileSync(wavPath, pcm);

execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-i",
  wavPath,
  "-codec:a",
  "libmp3lame",
  "-b:a",
  "48k",
  "-ac",
  "1",
  "-ar",
  String(SR),
  mp3Path,
]);
if (!keepWav) unlinkSync(wavPath);

const seconds = (N / SR).toFixed(1);
const kb = (statSync(mp3Path).size / 1024).toFixed(0);
console.log(
  `wrote ${mp3Path}: ${seconds}s, ${kb} KB (${BARS} bars @ ${BPM} BPM, 16th = ${SIXTEENTH * 1000} ms)`,
);
