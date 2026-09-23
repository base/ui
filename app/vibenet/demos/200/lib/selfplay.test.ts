// Self-play: a simple bot plays the model at 60 Hz with a synthetic chain
// feeding one head every 200 ms. This guards balance, not correctness — if a
// tuning change makes the lane unwinnable or trivial, these numbers move and
// the test says so.

import { describe, expect, it } from 'vitest';

import {
  createGame,
  restart,
  tap,
  spawnBlock,
  start,
  step,
  type Game,
  type Head,
} from './game';

/** Deterministic PRNG so runs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bot = (g: Game) => Game;

/** Taps on every beat the mouth is free: the intended way to play. */
const tapBot: Bot = (g) => (g.inhaling || g.stuffed ? g : tap(g));

/** Never inhales: the baseline that must die once real walls arrive. */
const idleBot: Bot = (g) => g;

function play(bot: Bot, seconds: number, seed: number) {
  const rng = mulberry32(seed);
  const dt = 1 / 60;
  let g = start(createGame());
  let nextHeadAt = 0;
  let number = 200_000;
  let deaths = 0;
  let bestScore = 0;
  let longestRun = 0;
  let runStart = 0;
  for (let t = 0; t < seconds; t += dt) {
    if (t >= nextHeadAt) {
      nextHeadAt += 0.2;
      number += 1;
      // Mostly deposit-only blocks, some busy ones — roughly what vibenet shows.
      const busy = rng();
      const gasUsed = busy < 0.7 ? 200_000 + rng() * 60_000 : 300_000 + rng() * 700_000;
      const head: Head = { number, timestampMs: Math.round(t * 1000), gasUsed };
      g = spawnBlock(g, head);
    }
    if (g.phase === 'dead') {
      deaths += 1;
      longestRun = Math.max(longestRun, t - runStart);
      g = step(g, 0.5, rng);
      g = restart(g);
      runStart = t;
      continue;
    }
    g = bot(g);
    g = step(g, dt, rng);
    bestScore = Math.max(bestScore, g.score);
  }
  longestRun = Math.max(longestRun, seconds - runStart);
  return { deaths, bestScore, longestRun };
}

describe('self-play balance', () => {
  it('tapping on the beat keeps the eat → FULL → shrink cycle alive and scoring', () => {
    const r = play(tapBot, 60, 1);
    expect(r.longestRun).toBeGreaterThan(15);
    expect(r.bestScore).toBeGreaterThan(30);
  });


  it('never inhaling loses shortly after the warm-up', () => {
    const r = play(idleBot, 30, 3);
    expect(r.deaths).toBeGreaterThanOrEqual(1);
    expect(r.longestRun).toBeLessThan(28);
  });
});
