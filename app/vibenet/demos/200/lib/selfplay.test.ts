// Self-play: a simple bot plays the model at 60 Hz with a synthetic chain
// feeding one head every 200 ms. This guards balance, not correctness — if a
// tuning change makes the lane unwinnable (a wall of crates) or trivial (the
// bot never dies), these numbers move and the test says so.

import { describe, expect, it } from 'vitest';

import {
  createGame,
  jump,
  PLAYER_H,
  PLAYER_W,
  PLAYER_X,
  restart,
  setDash,
  setFire,
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

/**
 * Hold X, jump late (90 px) when a landed block is about to hit, and only dash
 * when nothing is within 320 px. Careful rather than clever.
 */
const simpleBot: Bot = (g) => {
  let next = setFire(g, true);
  const bottom = next.player.y + PLAYER_H;
  const ahead = next.blocks.filter((b) => b.landed && b.x + b.w > PLAYER_X && b.y < bottom - 2);
  const threat = ahead.find((b) => b.x < PLAYER_X + PLAYER_W + 90);
  const near = ahead.find((b) => b.x < PLAYER_X + PLAYER_W + 320);
  if (threat && next.player.grounded) next = jump(next);
  next = setDash(next, next.dash.energy > 0.5 && !near);
  return next;
};

/** Never jumps, never shoots: the baseline that must die quickly. */
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
  it('a simple bot survives well past the first few blocks and scores', () => {
    const r = play(simpleBot, 60, 1);
    expect(r.longestRun).toBeGreaterThan(8);
    expect(r.bestScore).toBeGreaterThan(20);
  });

  it('is still a game: the simple bot does die sometimes over a long session', () => {
    const r = play(simpleBot, 120, 2);
    expect(r.deaths).toBeGreaterThan(0);
  });

  it('doing nothing loses within a few seconds', () => {
    const r = play(idleBot, 20, 3);
    expect(r.deaths).toBeGreaterThan(2);
    expect(r.longestRun).toBeLessThan(6);
  });
});
