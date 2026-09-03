'use client';

// Block Runner: an 8-bit pixel runner in Base colors where the vibenet chain is
// the spawner. Every new head (one per 200 ms under Denim) is spat out as a
// block by the boss on the right edge. The player is a round Base-blue glutton:
// tap ONE button — Space, X, or anywhere on the picture — and each tap is a
// bite: the mouth opens briefly, swallows at most one block — one eaten.
// Heavy walls drag slower while the chain keeps coming. Any block
// that reaches him uneaten costs a heart; fill the belly and he goes FULL —
// briefly invulnerable, rolling the tops — then hungry again. A city at night.
//
// Kept deliberately small: one canvas, requestAnimationFrame, hand-drawn
// sprites, synthesized sounds, and the validity demo's JSON-RPC WebSocket
// client for heads with an HTTP poll fallback.

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH, VIBENET_RPC_URL, VIBENET_WS_URL } from '../../library/config';
import { connectJsonRpcStream } from '../validity/lib/stream';
import {
  BOSS_X,
  blockLabel,
  createGame,
  GROUND_Y,
  HEIGHT,
  MAX_HEARTS,
  PLAYER_H,
  PLAYER_W,
  PLAYER_X,
  fullMeter,
  INHALE_RANGE,
  restart,
  tap,
  slotOf,
  spawnBlock,
  step,
  WIDTH,
  type Game,
  type Head,
} from './lib/game';
import gluttonSheet from './glutton-sheet-v2.png';
import {
  fetchBest,
  fetchBoard,
  scoreWallet,
  shortAddr,
  submitScore,
  type BoardEntry,
} from './lib/leaderboard';
import { Sound } from './lib/sound';
import {
  BOSS_CLOSED,
  BOSS_OPEN,
  CRATE_BODY,
  CRATE_FACE,
  CRATE_TOP,
  drawSprite,
  HEART,
  HEART_EMPTY,
  NIGHT,
  NIGHT_FAR,
  NIGHT_HORIZON,
  type Palette,
  spriteHeight,
} from './lib/sprites';

const BEST_KEY = 'block-runner:best';
const SCALE = 3;

// One committed night look in both site themes.
const P: Palette = NIGHT;

// The glutton's sprite sheet: seventeen 20 × 16 frames at 1×, blitted at 3×
// with smoothing off so the pixels stay hard. Column order per the spec
// (GULPY-SPRITE-SPEC.md):
const GLUTTON = {
  idleA: 0,
  happy: 1,
  runA: 2,
  runB: 3,
  inhale: 4,
  full: 5, // chew A
  hurt: 6,
  dead: 7,
  inhaleSmall: 8,
  gulp: 9,
  chewB: 10,
  dash: 11,
  roundRunA: 12,
  roundRunB: 13,
  roundInhale: 14,
  stuffed: 15,
  stuffedB: 16,
};
const G_W = 20;
const G_H = 16;
let gluttonImg: HTMLImageElement | null = null;
function glutton(): HTMLImageElement {
  if (!gluttonImg) {
    gluttonImg = new window.Image();
    gluttonImg.src = gluttonSheet.src;
  }
  return gluttonImg;
}

function drawGlutton(ctx: CanvasRenderingContext2D, frame: number, x: number, y: number, swell = 1, px = SCALE): void {
  const img = glutton();
  if (!img.complete || img.naturalWidth === 0) return;
  // The art is 20 wide over a 16-wide hitbox: ears and arms overhang evenly.
  // `swell` grows the whole body around the feet — the gulp bulge.
  const w = G_W * px * swell;
  const h = G_H * px * swell;
  const dx = x - ((G_W - 16) / 2) * px - (w - G_W * px) / 2;
  const dy = y - (h - G_H * px);
  ctx.drawImage(img, frame * G_W, 0, G_W, G_H, Math.round(dx), Math.round(dy), Math.round(w), Math.round(h));
}

type RawHead = { number?: string; timestampMs?: string; gasUsed?: string };

function parseHead(raw: RawHead | null | undefined): Head | null {
  if (!raw || typeof raw.number !== 'string') return null;
  const number = Number.parseInt(raw.number, 16);
  if (!Number.isFinite(number)) return null;
  const ts = typeof raw.timestampMs === 'string' ? Number.parseInt(raw.timestampMs, 16) : NaN;
  const gas = typeof raw.gasUsed === 'string' ? Number.parseInt(raw.gasUsed, 16) : 0;
  return { number, timestampMs: Number.isFinite(ts) ? ts : null, gasUsed: Number.isFinite(gas) ? gas : 0 };
}

function readBest(): number {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeBest(score: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* Best score is a convenience. */
  }
}

// Deterministic scenery from a seed so nothing allocates per frame beyond a
// few small objects. Three parallax layers sell the speed: far towers crawl,
// near towers drift, kerb marks on the street whip past.
function hash(i: number): number {
  return ((i * 2654435761) >>> 0) % 1000;
}

// The sky (bands + dither) never scrolls, so it is rendered once to an
// offscreen canvas and blitted each frame.
let skyCache: HTMLCanvasElement | null = null;
function skyBackdrop(): HTMLCanvasElement {
  if (skyCache) return skyCache;
  const c = document.createElement('canvas');
  c.width = WIDTH;
  c.height = HEIGHT;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = P.sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Horizon glow with a classic 8-bit dither: solid low band, then rows of
  // checkerboard thinning out upward.
  const horizonTop = GROUND_Y - 150;
  ctx.fillStyle = NIGHT_HORIZON;
  ctx.fillRect(0, horizonTop + 90, WIDTH, GROUND_Y - horizonTop - 90);
  for (let row = 0; row < 9; row += 1) {
    const y = horizonTop + row * 10;
    const density = row + 1; // sparser at the top
    for (let x = 0; x < WIDTH; x += 4) {
      const cell = (x / 4 + row) % 10;
      if (cell < density) ctx.fillRect(x + ((row % 2) * 2), y, 2, 2);
    }
  }
  skyCache = c;
  return c;
}

function drawSky(ctx: CanvasRenderingContext2D, distance: number): void {
  ctx.drawImage(skyBackdrop(), 0, 0);

  // A few stars, barely drifting (5% of scroll).
  const starOff = distance * 0.02;
  for (let i = 0; i < 26; i += 1) {
    const x = ((hash(i) * 37 - starOff) % (WIDTH + 20) + WIDTH + 20) % (WIDTH + 20) - 10;
    const y = 8 + (hash(i + 91) % 110);
    ctx.globalAlpha = 0.25 + (hash(i + 7) % 40) / 100;
    ctx.fillStyle = P.w;
    ctx.fillRect(Math.round(x), y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Moon, small and dim.
  ctx.fillStyle = P.c;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(WIDTH - 120, 30, 22, 22);
  ctx.fillStyle = P.w;
  ctx.fillRect(WIDTH - 117, 33, 16, 16);
  ctx.globalAlpha = 1;

  // Far towers at 10% of scroll: violet silhouettes, no windows.
  const farOff = distance * 0.04;
  const farW = 64;
  const ffirst = Math.floor(farOff / farW) - 1;
  ctx.fillStyle = NIGHT_FAR;
  for (let i = ffirst; i < ffirst + WIDTH / farW + 3; i += 1) {
    const x = i * farW - farOff;
    const h = 60 + (hash(i * 7) % 80);
    ctx.fillRect(Math.round(x) + 6, GROUND_Y - h, farW - 16, h);
  }

  // Near towers at 22% of scroll: near-black slabs, sparse lit slits in white
  // and pale cyan — a city mostly asleep. One in six roofs carries a neon sign.
  const nearOff = distance * 0.1;
  const nearW = 118;
  const nfirst = Math.floor(nearOff / nearW) - 1;
  for (let i = nfirst; i < nfirst + WIDTH / nearW + 3; i += 1) {
    const x = Math.round(i * nearW - nearOff);
    const h = 90 + (hash(i * 13) % 130);
    const w = nearW - 22 - (hash(i * 5) % 24);
    ctx.fillStyle = P.hills;
    ctx.fillRect(x, GROUND_Y - h, w, h);
    // Window slits: wide and low, lit rarely.
    for (let wy = GROUND_Y - h + 10; wy < GROUND_Y - 10; wy += 12) {
      for (let wx = x + 7; wx < x + w - 12; wx += 16) {
        const seed = hash(wx * 31 + wy * 17 + i);
        if (seed % 9 > 1) continue;
        ctx.fillStyle = seed % 5 === 0 ? P.c : P.w;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(wx, wy, 7, 3);
      }
    }
    ctx.globalAlpha = 1;
    if (hash(i * 29) % 6 === 0) drawNeonSign(ctx, x + Math.floor(w / 2), GROUND_Y - h);
  }
}

/** Rooftop neon: a framed sign glowing Base blue. */
function drawNeonSign(ctx: CanvasRenderingContext2D, cx: number, roofY: number): void {
  const w = 46;
  const h = 16;
  const x = cx - w / 2;
  const y = roofY - h - 6;
  ctx.fillStyle = P.k;
  ctx.fillRect(cx - 2, roofY - 6, 4, 6); // post
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4); // frame
  ctx.fillStyle = P.hills;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.B;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8); // glow
  ctx.globalAlpha = 1;
  ctx.font = `bold 11px ${dotoFamily()}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = P.B;
  ctx.fillText('BASE', cx, y + 12);
}

function drawGround(ctx: CanvasRenderingContext2D, distance: number, barreling: boolean): void {
  // Street: a sidewalk lip, then asphalt. A kerb mark every 112 px — one per
  // 200 ms at base speed — keeps the chain's cadence painted on the floor.
  ctx.fillStyle = P.railEdge;
  ctx.fillRect(0, GROUND_Y, WIDTH, 3);
  ctx.fillStyle = P.rail;
  ctx.fillRect(0, GROUND_Y + 3, WIDTH, 10);
  ctx.fillStyle = P.ground;
  ctx.fillRect(0, GROUND_Y + 13, WIDTH, HEIGHT - GROUND_Y - 13);

  const period = 112;
  const off = distance % period;
  ctx.fillStyle = P.d;
  for (let x = -off; x < WIDTH; x += period) {
    ctx.fillRect(Math.round(x), GROUND_Y + 3, 3, 10);
  }
  // Lane line at 1.6× scroll: the fastest layer, the one that reads as speed.
  // Longer marks while he barrels along FULL.
  const streakOff = (distance * 1.6) % 120;
  ctx.fillStyle = P.y;
  for (let x = -streakOff; x < WIDTH; x += 120) {
    ctx.fillRect(Math.round(x), GROUND_Y + 30, barreling ? 56 : 26, 4);
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // Width fixes the sprite scale (16 px face); height is filled with body rows.
  const scale = Math.max(1, Math.round(w / 16));
  const faceH = spriteHeight(CRATE_FACE, scale) - scale;
  if (h <= faceH) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawSprite(ctx, CRATE_FACE, x, y, scale, P);
    ctx.restore();
    ctx.fillStyle = P.k;
    ctx.fillRect(x, y + h - scale, w, scale);
    return;
  }
  drawSprite(ctx, CRATE_FACE, x, y, scale, P);
  const bodyH = spriteHeight(CRATE_BODY, scale);
  for (let yy = y + faceH; yy < y + h - scale; yy += bodyH) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h - scale);
    ctx.clip();
    drawSprite(ctx, CRATE_BODY, x, yy, scale, P);
    ctx.restore();
  }
  drawSprite(ctx, CRATE_TOP.slice(0, 1), x, y + h - scale, scale, P);
}

// Canvas font strings cannot resolve CSS var()s, so the real families are
// read off the document once and cached. Doto is the game-UI face; the mono
// stays for the dialog's longer sentences.
let dotoCache: string | null = null;
function dotoFamily(): string {
  if (dotoCache === null) {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue('--font-doto').trim();
    dotoCache = v ? `${v}, monospace` : 'ui-monospace, monospace';
  }
  return dotoCache;
}
let monoCache: string | null = null;
function monoFamily(): string {
  if (monoCache === null) {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue('--font-roboto-mono').trim();
    monoCache = v ? `${v}, monospace` : 'ui-monospace, monospace';
  }
  return monoCache;
}

/** A row of colored key hints ("R restart · M mute…"), centered. */
function keysLine(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
  const parts: Array<[string, string]> = [
    ['R', P.b],
    [' restart  ·  ', P.g],
    ['M', P.b],
    [' mute  ·  ', P.g],
    ['F', P.b],
    [' full screen', P.g],
  ];
  ctx.font = `bold 12px ${dotoFamily()}`;
  ctx.textAlign = 'left';
  const total = parts.reduce((n, [t]) => n + ctx.measureText(t).width, 0);
  let x = cx - total / 2;
  for (const [t, color] of parts) {
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
    x += ctx.measureText(t).width;
  }
  ctx.textAlign = 'center';
}

/** The title / game-over card, styled like a riveted arcade bezel. */
function drawDialog(ctx: CanvasRenderingContext2D, game: Game, frame: number): void {
  const dead = game.phase === 'dead';
  const w = 660;
  const h = dead ? 190 : 232;
  const x = Math.round((WIDTH - w) / 2);
  const y = 62;
  const METAL = '#8d95a6';
  const METAL_DARK = '#4a5164';
  const METAL_LIGHT = '#c3cad9';
  const INNER = '#0b1030';

  // Shadow, metal frame, dark inner.
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x + 7, y + 9, w, h);
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
  ctx.fillStyle = METAL;
  ctx.fillRect(x - 7, y - 7, w + 14, h + 14);
  ctx.fillStyle = METAL_LIGHT;
  ctx.fillRect(x - 7, y - 7, w + 14, 3);
  ctx.fillStyle = P.k;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = INNER;
  ctx.fillRect(x, y, w, h);

  // Rivets along the frame.
  ctx.fillStyle = METAL_DARK;
  for (let rx = x + 8; rx < x + w - 6; rx += 52) {
    ctx.fillRect(rx, y - 6, 3, 3);
    ctx.fillRect(rx, y + h + 3, 3, 3);
  }
  // Glowing side lights, three per rail.
  for (let i = 0; i < 3; i += 1) {
    const ly = y + 30 + i * ((h - 60) / 2);
    for (const lx of [x - 6, x + w + 1]) {
      ctx.fillStyle = P.D;
      ctx.fillRect(lx, ly, 5, 12);
      ctx.fillStyle = P.c;
      ctx.fillRect(lx + 1, ly + 2, 3, 8);
    }
  }

  // Gulpy peeking over the top edge, standing on a small notch plate.
  ctx.fillStyle = METAL;
  ctx.fillRect(WIDTH / 2 - 42, y - 10, 84, 4);
  drawGlutton(ctx, GLUTTON.idleA, WIDTH / 2 - 8, y - 10 - 16 * 2 + 6);

  // Title with arrow flourishes.
  const titleY = y + 14;
  const title = dead ? 'GAME OVER' : 'BLOCK RUNNER';
  ctx.font = `40px ${dotoFamily()}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = P.w;
  ctx.fillText(title, WIDTH / 2, titleY + 34);
  const tw = ctx.measureText(title).width;
  ctx.fillStyle = P.b;
  const gap = tw / 2 + 16;
  ctx.fillRect(WIDTH / 2 - gap - 30, titleY + 20, 24, 3);
  ctx.fillRect(WIDTH / 2 - gap - 6, titleY + 17, 5, 9);
  ctx.fillRect(WIDTH / 2 + gap + 6, titleY + 20, 24, 3);
  ctx.fillRect(WIDTH / 2 + gap + 1, titleY + 17, 5, 9);

  ctx.textAlign = 'center';
  if (dead) {
    ctx.font = `26px ${dotoFamily()}`;
    ctx.fillStyle = P.y;
    ctx.fillText(`${game.score} BLOCKS EATEN`, WIDTH / 2, y + 96);
    keysLine(ctx, WIDTH / 2, y + 122);
  } else {
    // Icon bullets: real game sprites next to each line.
    const lines: Array<[() => void, string]> = [
      [() => drawBlock(ctx, x + 34, y + 66, 16, 14), 'Every crate is a real vibenet block — one every 200 ms, spat by the sequencer.'],
      [() => drawGlutton(ctx, GLUTTON.happy, x + 30, y + 84, 1, 1.5), 'Tap to bite: one tap, one block. Uneaten blocks cost a heart.'],
      [() => drawSprite(ctx, HEART, x + 34, y + 118, 2, P), 'Fill the belly for FULL mode — briefly unstoppable, then hungry again.'],
    ];
    ctx.font = `12px ${monoFamily()}`;
    ctx.textAlign = 'left';
    lines.forEach(([icon, text], i) => {
      icon();
      ctx.fillStyle = P.w;
      ctx.fillText(text, x + 62, y + 78 + i * 26);
    });
    ctx.textAlign = 'center';
    // Dotted divider with a little face.
    ctx.fillStyle = P.D;
    for (let dx = x + 30; dx < x + w - 30; dx += 8) {
      if (Math.abs(dx - WIDTH / 2) > 26) ctx.fillRect(dx, y + 148, 4, 3);
    }
    drawGlutton(ctx, GLUTTON.idleA, WIDTH / 2 - 12, y + 136, 1, 1.5);
    keysLine(ctx, WIDTH / 2, y + 178);
  }

  // TAP TO START button bar.
  const bw = 240;
  const bh = 30;
  const bx = Math.round(WIDTH / 2 - bw / 2);
  const by = y + h - bh - 12;
  ctx.fillStyle = METAL;
  ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
  ctx.fillStyle = P.k;
  ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  ctx.fillStyle = '#141a3d';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = P.c;
  ctx.fillRect(bx - 4, by + bh / 2 - 4, 3, 8);
  ctx.fillRect(bx + bw + 1, by + bh / 2 - 4, 3, 8);
  if (Math.floor(frame / 24) % 2 === 0) {
    ctx.font = `20px ${dotoFamily()}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = P.y;
    ctx.fillText(dead ? '\u25b6 TAP TO RUN AGAIN' : '\u25b6 TAP TO START', WIDTH / 2, by + 21);
  }

  // Bottom-left hearts + belly chip; bottom-right crate stack (ready only).
  if (!dead) {
    for (let i = 0; i < 3; i += 1) drawSprite(ctx, HEART, x + 22 + i * 22, y + h - 34, 2, P);
    ctx.fillStyle = P.D;
    ctx.fillRect(x + 22, y + h - 14, 62, 6);
    ctx.fillStyle = P.b;
    ctx.fillRect(x + 23, y + h - 13, 40, 4);
    drawBlock(ctx, x + w - 50, y + h - 34, 20, 16);
    drawBlock(ctx, x + w - 72, y + h - 34, 20, 16);
    drawBlock(ctx, x + w - 61, y + h - 52, 20, 16);
  }
}

function render(ctx: CanvasRenderingContext2D, game: Game, frame: number, feedQuiet: boolean, happyFrames: number): void {
  ctx.imageSmoothingEnabled = false;
  const barreling = game.stuffed;

  ctx.save();
  if (game.shake > 0) {
    const s = game.shake;
    ctx.translate(Math.round((Math.random() - 0.5) * s), Math.round((Math.random() - 0.5) * s));
  }

  drawSky(ctx, game.distance);
  drawGround(ctx, game.distance, barreling);

  // Speed lines while barreling along FULL.
  if (barreling) {
    ctx.fillStyle = P.w;
    for (let i = 0; i < 7; i += 1) {
      const y = 40 + ((hash(i + frame / 3) + i * 37) % (GROUND_Y - 60));
      const x = (WIDTH - ((frame * 41 + hash(i) * 3) % (WIDTH + 200)));
      ctx.fillRect(Math.round(x), Math.round(y), 40 + (i % 3) * 16, 2);
    }
  }

  // Boss at the right edge, mouth open just after spitting a block.
  const bossY = GROUND_Y - spriteHeight(BOSS_CLOSED, SCALE) - 2;
  drawSprite(ctx, game.bossMouth > 0 ? BOSS_OPEN : BOSS_CLOSED, BOSS_X, bossY, SCALE, P);
  if (feedQuiet) {
    ctx.fillStyle = P.w;
    ctx.font = `bold 12px ${dotoFamily()}`;
    ctx.textAlign = 'center';
    ctx.fillText('zzz', BOSS_X + 48, bossY - 8);
  }

  // Blocks.
  for (const b of game.blocks) drawBlock(ctx, Math.round(b.x), Math.round(b.y), b.w, b.h);

  // Afterimages: fading ghosts while he barrels along FULL.
  for (const a of game.afterimages) {
    ctx.globalAlpha = 0.35 * (1 - a.age / 0.28);
    const trail = a.age * 260;
    drawGlutton(ctx, GLUTTON.dash, PLAYER_X - trail, a.y);
  }
  ctx.globalAlpha = 1;

  // Suction stream while inhaling: converging streaks from the range edge
  // into the mouth.
  const mouthY = game.player.y + 24;
  if (game.inhaling && game.phase === 'running' && !game.stuffed) {
    ctx.fillStyle = P.c;
    for (let i = 0; i < 9; i += 1) {
      const phase = ((frame * 16 + i * 47) % INHALE_RANGE);
      const x = PLAYER_X + PLAYER_W + INHALE_RANGE - phase;
      const spread = (phase / INHALE_RANGE) * 26;
      const y = mouthY - 26 + spread + (i % 3) * ((26 - spread) / 1.5);
      ctx.globalAlpha = 0.25 + 0.55 * (phase / INHALE_RANGE);
      ctx.fillRect(Math.round(x), Math.round(y), 14, 2);
    }
    ctx.globalAlpha = 1;
  }

  // Runner: the glutton, from its sheet.
  const gframe =
    game.phase === 'dead'
      ? GLUTTON.dead
      : game.invuln > 0.6
        ? GLUTTON.hurt
        : game.stuffed
          ? GLUTTON.full // too full to inhale — digest first
          : game.puffed > 0
          ? GLUTTON.full // chew: a short mouth-shut beat after every gulp
          : happyFrames > 0
            ? GLUTTON.happy // digesting: the satisfied face when a heart refills
            : game.inhaling && game.phase === 'running'
              ? GLUTTON.inhale
              : game.phase === 'ready'
                ? GLUTTON.idleA
                : [GLUTTON.runA, GLUTTON.runB][Math.floor(frame / 6) % 2];
  // Blink while invulnerable after a hit; lean forward while inhaling.
  if (game.invuln <= 0 || Math.floor(frame / 4) % 2 === 0) {
    const lean = gframe === GLUTTON.inhale ? 6 : 0;
    // The body is the meter: the round sprite tiers carry most of it, and a
    // gentle scale plus a gulp pulse blends between tiers.
    const gulpPulse = game.puffed > 0 ? 0.12 * (game.puffed / 0.12) : 0;
    const swell = 1 + 0.22 * game.fullness + gulpPulse;
    drawGlutton(ctx, gframe, PLAYER_X + lean, game.player.y, swell);
  }

  // Particles.
  for (const p of game.particles) {
    ctx.globalAlpha = 1 - p.age / 0.6;
    ctx.fillStyle = p.kind === 'shard' ? P.d : p.kind === 'dust' ? P.w : P.B;
    const size = p.kind === 'dust' ? 5 : 4;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
    if (p.kind === 'shard') {
      ctx.fillStyle = P.k;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, size);
    }
  }
  ctx.globalAlpha = 1;

  // Revealed labels, with a dark plate so they read over anything.
  ctx.font = `bold 13px ${dotoFamily()}`;
  ctx.textAlign = 'center';
  for (const l of game.labels) {
    ctx.globalAlpha = Math.max(0, 1 - l.age / 1.2);
    const w = ctx.measureText(l.text).width + 12;
    ctx.fillStyle = P.B;
    ctx.fillRect(Math.round(l.x - w / 2), Math.round(l.y - 13), Math.round(w), 18);
    ctx.fillStyle = P.w;
    ctx.fillText(l.text, Math.round(l.x), Math.round(l.y));
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Belly gauge, HUD-fixed (not shaken): fills as he eats; during FULL it
  // drains over the whole state — cruise plus shrink — reaching empty on the
  // exact frame he is hungry again. The dialog carries its own hearts and
  // belly chip, so the live HUD only draws mid-run.
  if (game.phase === 'running') {
  const meterW = 120;
  const fillFrac = game.stuffed ? fullMeter(game) : game.fullness;
  ctx.fillStyle = P.railEdge;
  ctx.fillRect(16, 322, meterW + 6, 14);
  ctx.fillStyle = P.rail;
  ctx.fillRect(19, 325, meterW, 8);
  ctx.fillStyle = game.stuffed ? P.y : P.b;
  ctx.fillRect(19, 325, Math.round(meterW * Math.max(0, Math.min(1, fillFrac))), 8);
  ctx.fillStyle = P.hud;
  ctx.font = `bold 10px ${dotoFamily()}`;
  ctx.textAlign = 'left';
  ctx.fillText(game.stuffed ? 'FULL!' : 'BELLY', 16, 350);

  // Hearts: pixel hearts next to the meter; empty ones are outlined.
  for (let i = 0; i < MAX_HEARTS; i += 1) {
    drawSprite(ctx, i < game.hearts ? HEART : HEART_EMPTY, 150 + i * 22, 320, 2, P);
  }
  }

  // Overlays: an 8-bit dialog — layered pixel border, drop shadow, accent
  // bar — instead of a flat slab.
  if (game.phase !== 'running') {
    drawDialog(ctx, game, frame);
  }
}

export function BlockRunner() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game>(createGame());
  const soundRef = useRef<Sound | null>(null);
  const frameRef = useRef(0);
  const feedRef = useRef<'connecting' | 'live' | 'polling' | 'quiet'>('connecting');
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Immersive takeover: the game fills the viewport by default on load.
  // (True fullscreen needs a user gesture, so this is the load-time version.)
  const [immersive, setImmersive] = useState(true);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [chainBest, setChainBest] = useState(0);
  const [myAddress, setMyAddress] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<'' | 'funding' | 'submitting' | 'confirming' | 'done' | 'error'>('');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<Game['phase']>('ready');
  const [head, setHead] = useState<Head | null>(null);
  const [rate, setRate] = useState(0);
  const [feed, setFeedState] = useState<'connecting' | 'live' | 'polling' | 'quiet'>('connecting');
  const headTimes = useRef<number[]>([]);
  const lastHeadAt = useRef(0);
  const lastFrameAt = useRef(0);

  const setFeed = useCallback((next: typeof feedRef.current | ((f: typeof feedRef.current) => typeof feedRef.current)) => {
    const value = typeof next === 'function' ? next(feedRef.current) : next;
    feedRef.current = value;
    setFeedState(value);
  }, []);

  const sound = () => {
    if (!soundRef.current) soundRef.current = new Sound();
    return soundRef.current;
  };

  const apply = useCallback((next: Game) => {
    gameRef.current = next;
  }, []);

  // Head feed: WebSocket newHeads, falling back to a 200 ms HTTP poll.
  useEffect(() => {
    let cancelled = false;
    let stopPoll: (() => void) | null = null;
    let closeStream: (() => void) | null = null;

    const onHead = (h: Head) => {
      if (cancelled) return;
      const now = performance.now();
      lastHeadAt.current = now;
      // Rate from the span between oldest and newest head in a ~3 s window.
      // Counting heads per fixed bucket makes a steady 200 ms cadence flicker
      // between 5.0 and 5.5 as the window edge crosses a head; the span
      // measure reads a constant 5.0.
      headTimes.current = [...headTimes.current.filter((t) => now - t < 3000), now];
      const span = headTimes.current.length > 1 ? (now - headTimes.current[0]) / 1000 : 0;
      setRate(span > 0 ? (headTimes.current.length - 1) / span : 0);
      setHead(h);
      // If the loop has stalled (a throttled tab), skip the spawn so blocks do
      // not pile up at the boss and greet the player with a wall on return.
      if (now - lastFrameAt.current > 400) return;
      const next = spawnBlock(gameRef.current, h);
      if (next !== gameRef.current) sound().tick();
      apply(next);
    };

    const startPoll = () => {
      setFeed('polling');
      let last = -1;
      let inFlight = false;
      const id = window.setInterval(async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          const res = await fetch(VIBENET_RPC_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] }),
          });
          const body = (await res.json()) as { result?: RawHead };
          const h = parseHead(body.result);
          if (h && h.number !== last) {
            last = h.number;
            onHead(h);
          }
        } catch {
          /* Next tick retries. */
        } finally {
          inFlight = false;
        }
      }, 200);
      stopPoll = () => window.clearInterval(id);
    };

    const startStream = async (url: string) => {
      const stream = connectJsonRpcStream(url);
      closeStream = stream.close;
      stream.setOnClose(() => {
        if (!cancelled) startPoll();
      });
      await stream.ready;
      await stream.subscribe(['newHeads'], (result) => {
        const h = parseHead(result as RawHead);
        if (h) onHead(h);
      });
      if (!cancelled) setFeed('live');
    };

    if (VIBENET_WS_URL) {
      void startStream(VIBENET_WS_URL).catch(() => {
        if (!cancelled) startPoll();
      });
    } else {
      startPoll();
    }

    // Quiet detector: no head for 1.5 s means the chain (or the feed) stalled.
    const quiet = window.setInterval(() => {
      if (lastHeadAt.current && performance.now() - lastHeadAt.current > 1500) setFeed('quiet');
      else if (lastHeadAt.current) setFeed((f) => (f === 'quiet' ? 'live' : f));
    }, 500);

    return () => {
      cancelled = true;
      closeStream?.();
      stopPoll?.();
      window.clearInterval(quiet);
    };
  }, [apply, setFeed]);

  // Onchain high scores: poll the board, know our own best.
  useEffect(() => {
    let cancelled = false;
    const wallet = scoreWallet();
    // Deferred so the effect body itself does not set state synchronously.
    const t = window.setTimeout(() => setMyAddress(wallet.address), 0);
    const load = async () => {
      try {
        const [entries, mine] = await Promise.all([fetchBoard(), fetchBest(wallet.address)]);
        if (!cancelled) {
          setBoard(entries);
          setChainBest(mine);
        }
      } catch {
        /* Board is decoration; the next poll retries (or the chain regenesised). */
      }
    };
    void load();
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 12_000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, []);

  const postScore = useCallback(async () => {
    const s = gameRef.current.score;
    if (s <= 0 || submitState === 'funding' || submitState === 'submitting' || submitState === 'confirming') return;
    setSubmitState('funding');
    try {
      await submitScore(s, (st) => setSubmitState(st));
      setSubmitState('done');
      setChainBest((b) => Math.max(b, s));
      setBoard(await fetchBoard());
    } catch {
      setSubmitState('error');
    }
  }, [submitState]);

  // Fullscreen: the stage wrapper goes fullscreen; the canvas letterboxes
  // inside it with object-contain so the aspect never distorts.
  const toggleFullscreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (stage.requestFullscreen) void stage.requestFullscreen();
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Input.
  const doTap = useCallback(() => apply(tap(gameRef.current)), [apply]);
  const doRestart = useCallback(() => {
    setSubmitState((st) => (st === 'done' || st === 'error' ? '' : st));
    apply(restart(gameRef.current));
  }, [apply]);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      return Boolean(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      sound().unlock();
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'KeyX' || e.code === 'Enter') {
        e.preventDefault();
        if (gameRef.current.phase === 'dead') doRestart();
        else doTap();
      } else if (e.code === 'KeyR') {
        // Same as Space on the game-over screen; never resets a live run.
        if (gameRef.current.phase === 'dead') doRestart();
      } else if (e.code === 'KeyF') {
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        const next = !sound().muted;
        sound().setMuted(next);
        setMuted(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [doTap, doRestart, toggleFullscreen]);

  // Main loop. requestAnimationFrame when the tab is visible; a 60 Hz timer
  // takes over when the browser stops issuing frames (hidden or throttled),
  // so the simulation never freezes mid-run.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let last = performance.now();
    let raf = 0;
    let shownScore = -1;
    let shownPhase: Game['phase'] | null = null;
    // Satisfied pose: a short victory face when a heart is won back.
    let happyUntil = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      lastFrameAt.current = now;
      frameRef.current += 1;
      if (frameRef.current === 1) {
        setBest(readBest());
        setMuted(sound().muted);
      }

      const next = step(gameRef.current, dt);
      gameRef.current = next;

      if (next.events.includes('heart')) happyUntil = frameRef.current + 40;
      for (const ev of next.events) {
        if (ev === 'inhale-on') sound().inhaleOn();
        else if (ev === 'gulp') sound().gulp();
        else if (ev === 'stuffed') sound().stuffed();
        else if (ev === 'land') sound().land();
        else if (ev === 'die') sound().die();
        else if (ev === 'hurt') sound().hurt();
        else if (ev === 'heart') sound().heart();
        else if (ev === 'thud') sound().thud();
      }
      if (next.score !== shownScore) {
        shownScore = next.score;
        setScore(next.score);
      }
      if (next.phase !== shownPhase) {
        shownPhase = next.phase;
        setPhase(next.phase);
        if (next.phase === 'running') sound().startMusic();
        else sound().stopMusic();
        if (next.phase === 'dead') {
          setBest((b) => {
            const nb = Math.max(b, next.score);
            if (nb !== b) writeBest(nb);
            return nb;
          });
        }
      }

      render(ctx, next, frameRef.current, feedRef.current === 'quiet', Math.max(0, happyUntil - frameRef.current));
    };

    let lastRafAt = 0;
    const loop = (now: number) => {
      lastRafAt = now;
      tick(now);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    // Once frames stop arriving, the timer carries the whole simulation at
    // 60 Hz until they resume.
    const fallback = window.setInterval(() => {
      const now = performance.now();
      if (now - lastRafAt > 100) tick(now);
    }, 1000 / 60);
    if (process.env.NODE_ENV !== 'production') {
      // Dev-only peek so a script (or a curious tab) can read the live state.
      (window as unknown as { __blockRunner?: unknown }).__blockRunner = { get: () => gameRef.current };
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(fallback);
      soundRef.current?.stopMusic(0.2);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sound().unlock();
    if (gameRef.current.phase === 'dead') return doRestart();
    // One action everywhere: a tap is a bite.
    doTap();
  };

  const slot = head ? slotOf(head.timestampMs) : null;
  const feedLabel =
    feed === 'live' ? 'live · newHeads' : feed === 'polling' ? 'polling · 200 ms' : feed === 'quiet' ? 'chain quiet' : 'connecting';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.6px] ${
              feed === 'quiet' ? 'text-bds-orange-70' : 'text-bds-gray-60 dark:text-bds-gray-40'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                feed === 'live' ? 'bg-bds-green-50' : feed === 'quiet' ? 'bg-bds-orange-50' : 'bg-bds-gray-30'
              }`}
              aria-hidden="true"
            />
            {feedLabel}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const next = !sound().muted;
              sound().setMuted(next);
              setMuted(next);
            }}
            aria-pressed={muted}
          >
            {muted ? 'Unmute' : 'Mute'}
          </Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen} aria-pressed={isFullscreen}>
            {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          </Button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={
          isFullscreen
            ? 'relative flex h-full w-full items-center justify-center bg-[#12093a]'
            : immersive
              ? 'fixed inset-0 z-[115] flex items-center justify-center bg-[#12093a]'
              : 'relative mx-auto w-full max-w-[800px]'
        }
      >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        className={
          isFullscreen || immersive
            ? 'h-full w-full select-none object-contain [image-rendering:pixelated]'
            : 'mx-auto w-full max-w-[800px] select-none rounded-xl bg-[#12093a] [image-rendering:pixelated]'
        }
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, touchAction: 'none', background: P.sky, WebkitTouchCallout: 'none' }}
        aria-label={`Block Runner. ${phase === 'running' ? `Score ${score}.` : 'Tap space or the screen to start eating.'}`}
        role="img"
      />
      {/* Once a submit starts, the board's own poll can raise chainBest past
          the score mid-flight — keep the prompt mounted on submitState so the
          progress and the success line survive their own success. */}
      <div className="pointer-events-none absolute inset-x-0 top-2 flex items-start justify-between px-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.6px] text-white/60">Latest block</span>
          <div className="font-doto text-[22px] leading-none tabular-nums text-white">
            {head ? head.number.toLocaleString() : '———'}
            {slot ? <span className="text-bds-blue-30"> {slot}</span> : null}
          </div>
        </div>
        <div className="flex items-start gap-6">
          <GameStat label="Blocks / s" value={rate.toFixed(1)} />
          <GameStat label="Eaten" value={String(score)} />
          <GameStat label="Best" value={String(best)} />
        </div>
      </div>
      {phase === 'dead' && score > 0 && (score > chainBest || submitState !== '') ? (
        <div className="absolute inset-x-0 bottom-[7%] flex justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-bds-blue-60 bg-[#0b1030]/95 px-4 py-3 shadow-lg">
            {submitState === 'done' ? (
              <Text variant="label.regular" className="text-bds-blue-15">
                On the board — tap the game to run again.
              </Text>
            ) : (
              <>
                <Text variant="label.regular" className="text-bds-blue-15">
                  New onchain best!
                </Text>
                <Button
                  size="sm"
                  onClick={() => void postScore()}
                  disabled={submitState === 'funding' || submitState === 'submitting' || submitState === 'confirming'}
                >
                  {submitState === 'funding'
                    ? 'Funding wallet…'
                    : submitState === 'submitting'
                      ? 'Submitting…'
                      : submitState === 'confirming'
                        ? 'Confirming…'
                        : submitState === 'error'
                          ? 'Retry post'
                          : `Post ${score} onchain`}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {immersive && !isFullscreen ? (
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const next = !sound().muted;
              sound().setMuted(next);
              setMuted(next);
            }}
          >
            {muted ? 'Unmute' : 'Mute'}
          </Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen}>
            Full Screen
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setImmersive(false)}>
            Exit
          </Button>
        </div>
      ) : null}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text variant="headline">Onchain high scores</Text>
          <div className="flex items-center gap-3">
            {/* Once a submit starts, the board's own poll can raise chainBest past
          the score mid-flight — keep the prompt mounted on submitState so the
          progress and the success line survive their own success. */}
      <div className="pointer-events-none absolute inset-x-0 top-2 flex items-start justify-between px-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.6px] text-white/60">Latest block</span>
          <div className="font-doto text-[22px] leading-none tabular-nums text-white">
            {head ? head.number.toLocaleString() : '———'}
            {slot ? <span className="text-bds-blue-30"> {slot}</span> : null}
          </div>
        </div>
        <div className="flex items-start gap-6">
          <GameStat label="Blocks / s" value={rate.toFixed(1)} />
          <GameStat label="Eaten" value={String(score)} />
          <GameStat label="Best" value={String(best)} />
        </div>
      </div>
      {phase === 'dead' && score > 0 && (score > chainBest || submitState !== '') ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void postScore()}
                disabled={submitState === 'funding' || submitState === 'submitting' || submitState === 'confirming'}
              >
                {submitState === 'funding'
                  ? 'Funding wallet…'
                  : submitState === 'submitting'
                    ? 'Submitting…'
                    : submitState === 'confirming'
                      ? 'Confirming…'
                      : `Post ${score} onchain`}
              </Button>
            ) : null}
            {submitState === 'error' ? (
              <Text variant="footnote" className="text-bds-red-60">
                Submission failed — try again.
              </Text>
            ) : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-bds-gray-10 dark:border-white/10">
          {board.length === 0 ? (
            <Text variant="label.regular" tone="muted" className="block px-4 py-3">
              No scores onchain yet — die proudly and post yours.
            </Text>
          ) : (
            <ul className="divide-y divide-bds-gray-10 dark:divide-white/10">
              {board.map((e, i) => (
                <li
                  key={e.player}
                  className={`flex items-center gap-3 px-4 py-2 text-[13px] ${
                    myAddress && e.player.toLowerCase() === myAddress.toLowerCase() ? 'bg-bds-blue-0' : ''
                  }`}
                >
                  <span className="w-6 shrink-0 text-bds-gray-50">{i + 1}</span>
                  <a
                    href={`${VIBENET_EXPLORER_PATH}/address/${e.player}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-base-blue hover:underline"
                  >
                    {shortAddr(e.player)}
                  </a>
                  {myAddress && e.player.toLowerCase() === myAddress.toLowerCase() ? (
                    <span className="text-[11px] uppercase tracking-[0.6px] text-bds-gray-50">you</span>
                  ) : null}
                  <span className="ml-auto font-doto text-[18px] tabular-nums">{e.score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Text variant="footnote" tone="muted">
          Scores live in a contract on vibenet — no names, only the wallet that posted them. Your browser plays as{' '}
          {myAddress ? <span className="font-mono">{shortAddr(myAddress as `0x${string}`)}</span> : '…'} and the
          faucet funds its first submission. A devnet regenesis wipes the board.
        </Text>
      </section>

      <Text variant="footnote" tone="muted">
        The boss on the right is the sequencer: every block it spits is a real vibenet block, pushed over WebSocket as
        it lands, one every 200 ms. Block height follows gas used. Swallow one to read its number and slot
        {head ? `, like ${blockLabel(head)}` : ''}. Tap Space, X, or the picture to bite — each tap opens the
        mouth for one block, and the next block needs the next tap. Heavy walls drag in slower. Every block that
        reaches him uneaten costs a heart. Fill the belly gauge and he is FULL — for a few seconds nothing can hurt him and he rolls
        along the top of the blocks while the gauge drains, then he is hungry again. The beat runs at one note per
        block. R restarts after a run, M mutes music and effects, F goes full screen.
      </Text>
    </div>
  );
}

function GameStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.6px] text-white/60">{label}</span>
      <span className="font-doto text-[22px] leading-none tabular-nums text-white">{value}</span>
    </div>
  );
}

