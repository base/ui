'use client';

// Block Runner: an 8-bit pixel runner in Base colors where the vibenet chain is the
// spawner. Every new head (one per 200 ms under Denim) is spat out as a block
// by the boss on the right edge. Jump over blocks, land on them, shoot them to
// reveal their number and 200 ms slot, and hold a dash for speed and double
// score. Hitting a block's side ends the run.
//
// Kept deliberately small: one canvas, requestAnimationFrame, hand-drawn
// sprites, synthesized sounds, and the validity demo's JSON-RPC WebSocket
// client for heads with an HTTP poll fallback.

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { VIBENET_RPC_URL, VIBENET_WS_URL } from '../../library/config';
import { connectJsonRpcStream } from '../validity/lib/stream';
import {
  BOSS_X,
  blockLabel,
  createGame,
  fire,
  GROUND_Y,
  HEIGHT,
  jump,
  MAX_HEARTS,
  PLAYER_H,
  PLAYER_X,
  restart,
  setDash,
  setFire,
  slotOf,
  spawnBlock,
  step,
  WIDTH,
  type Game,
  type Head,
} from './lib/game';
import { Sound } from './lib/sound';
import {
  BOSS_CLOSED,
  BOSS_OPEN,
  BUSTER_SHOT,
  CLOUD_BIG,
  CLOUD_SMALL,
  CRATE_BODY,
  CRATE_FACE,
  CRATE_TOP,
  DARK,
  drawSprite,
  HEART,
  HEART_EMPTY,
  LIGHT,
  type Palette,
  RUNNER_DASH,
  RUNNER_DEAD,
  RUNNER_JUMP,
  RUNNER_RUN,
  spriteHeight,
} from './lib/sprites';

const BEST_KEY = 'block-runner:best';
const SCALE = 3;

// Active palette; `render` sets it from the page theme before drawing.
let P: Palette = LIGHT;

/** Follows the site theme: the data-theme attribute, else the system setting. */
function paletteForTheme(): Palette {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return DARK;
  if (attr === 'light') return LIGHT;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
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
// few small objects. Three parallax layers sell the speed: far clouds crawl,
// hills drift, posts on the rail whip past.
function hash(i: number): number {
  return ((i * 2654435761) >>> 0) % 1000;
}

function drawSky(ctx: CanvasRenderingContext2D, distance: number): void {
  ctx.fillStyle = P.sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Far clouds at 12% of scroll speed.
  const cloudPeriod = 360;
  const off = distance * 0.12;
  const first = Math.floor(off / cloudPeriod) - 1;
  for (let i = first; i < first + 5; i += 1) {
    const x = i * cloudPeriod - off + (hash(i) % 160);
    const y = 20 + (hash(i + 7) % 80);
    if (x < -80 || x > WIDTH + 80) continue;
    drawSprite(ctx, hash(i) % 2 ? CLOUD_BIG : CLOUD_SMALL, x, y, SCALE, P);
  }

  // Hills at 35% of scroll speed: a rolling pixel skyline in 12 px columns.
  const hillOff = distance * 0.35;
  const col = 12;
  const hfirst = Math.floor(hillOff / col) - 1;
  for (let i = hfirst; i < hfirst + WIDTH / col + 3; i += 1) {
    const x = i * col - hillOff;
    const h = Math.round(34 + 22 * Math.sin(i * 0.35) + 10 * Math.sin(i * 0.11 + 2) + (hash(i) % 4));
    ctx.fillStyle = P.hills;
    ctx.fillRect(Math.round(x), GROUND_Y - h, col, h);
    ctx.fillStyle = P.k;
    ctx.fillRect(Math.round(x), GROUND_Y - h, col, 3);
  }
}

function drawGround(ctx: CanvasRenderingContext2D, distance: number, dashing: boolean): void {
  // Pavement: a light slab with a thin edge, and a kerb line every 112 px —
  // one per 200 ms at base speed — so the chain's cadence is painted on the
  // floor. No hard outlines here; the ground should read as surface, not frame.
  ctx.fillStyle = P.railEdge;
  ctx.fillRect(0, GROUND_Y, WIDTH, 3);
  ctx.fillStyle = P.rail;
  ctx.fillRect(0, GROUND_Y + 3, WIDTH, 10);
  ctx.fillStyle = P.railEdge;
  ctx.fillRect(0, GROUND_Y + 13, WIDTH, 2);
  ctx.fillStyle = P.ground;
  ctx.fillRect(0, GROUND_Y + 15, WIDTH, HEIGHT - GROUND_Y - 15);

  const period = 112;
  const off = distance % period;
  ctx.fillStyle = P.railEdge;
  for (let x = -off; x < WIDTH; x += period) {
    ctx.fillRect(Math.round(x), GROUND_Y + 3, 3, 10);
  }
  // Foreground streaks at 1.6× scroll speed: the fastest layer, the one that
  // reads as speed. Longer while dashing.
  const streakOff = (distance * 1.6) % 120;
  ctx.fillStyle = P.B;
  for (let x = -streakOff; x < WIDTH; x += 120) {
    ctx.fillRect(Math.round(x), GROUND_Y + 26, dashing ? 56 : 24, 3);
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, damage = 0): void {
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
    drawCracks(ctx, x, y, w, h, damage, scale);
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
  drawCracks(ctx, x, y, w, h, damage, scale);
}

// Cracks for each hit taken: dark zig-zags from the top edge, one per hit.
function drawCracks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, damage: number, scale: number): void {
  if (damage <= 0) return;
  ctx.fillStyle = P.k;
  for (let i = 0; i < damage; i += 1) {
    let cx = x + Math.round(w * (0.25 + 0.5 * ((i * 0.618) % 1)));
    for (let cy = y + scale; cy < y + h * 0.6; cy += scale) {
      ctx.fillRect(cx, cy, scale, scale);
      cx += ((cy / scale + i) % 3 === 0 ? -scale : (cy / scale) % 2 === 0 ? scale : 0);
    }
  }
}

function render(ctx: CanvasRenderingContext2D, game: Game, frame: number, feedQuiet: boolean, pal: Palette): void {
  P = pal;
  ctx.imageSmoothingEnabled = false;
  const dashing = game.dash.active;

  ctx.save();
  if (game.shake > 0) {
    const s = game.shake;
    ctx.translate(Math.round((Math.random() - 0.5) * s), Math.round((Math.random() - 0.5) * s));
  }

  drawSky(ctx, game.distance);
  drawGround(ctx, game.distance, dashing);

  // Speed lines while dashing.
  if (dashing) {
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
    ctx.fillStyle = P.k;
    ctx.font = 'bold 12px var(--font-mono, ui-monospace, monospace)';
    ctx.textAlign = 'center';
    ctx.fillText('zzz', BOSS_X + 48, bossY - 8);
  }

  // Blocks.
  for (const b of game.blocks) drawBlock(ctx, Math.round(b.x), Math.round(b.y), b.w, b.h, b.maxHp - b.hp);

  // Afterimages: blue silhouettes fading behind the runner while dashing.
  for (const a of game.afterimages) {
    ctx.globalAlpha = 0.45 * (1 - a.age / 0.28);
    const trail = a.age * 260;
    drawSprite(ctx, RUNNER_DASH, PLAYER_X - trail, a.y, SCALE, P, P.c);
  }
  ctx.globalAlpha = 1;

  // Runner.
  const runner =
    game.phase === 'dead'
      ? RUNNER_DEAD
      : !game.player.grounded
        ? RUNNER_JUMP
        : dashing
          ? RUNNER_DASH
          : game.phase === 'running'
            ? RUNNER_RUN[Math.floor(frame / (dashing ? 3 : 5)) % 3]
            : RUNNER_RUN[1];
  // Blink while invulnerable after a hit.
  if (game.invuln <= 0 || Math.floor(frame / 4) % 2 === 0) {
    drawSprite(ctx, runner, PLAYER_X, game.player.y, SCALE, P);
  }

  // Muzzle flash right after a shot.
  if (game.fireCooldown > 0.1) {
    ctx.fillStyle = P.y;
    ctx.fillRect(PLAYER_X + 44, game.player.y + 24, 10, 10);
    ctx.fillStyle = P.w;
    ctx.fillRect(PLAYER_X + 47, game.player.y + 27, 4, 4);
  }

  // Buster shots.
  for (const bl of game.bullets) drawSprite(ctx, BUSTER_SHOT, bl.x, bl.y, SCALE, P);

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
  ctx.font = 'bold 13px var(--font-mono, ui-monospace, monospace)';
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

  // Dash meter, HUD-fixed (not shaken).
  const meterW = 120;
  ctx.fillStyle = P.railEdge;
  ctx.fillRect(16, 16, meterW + 6, 14);
  ctx.fillStyle = P.rail;
  ctx.fillRect(19, 19, meterW, 8);
  ctx.fillStyle = game.dash.spent ? P.o : dashing ? P.y : P.b;
  ctx.fillRect(19, 19, Math.round(meterW * game.dash.energy), 8);
  ctx.fillStyle = P.hud;
  ctx.font = 'bold 10px var(--font-mono, ui-monospace, monospace)';
  ctx.textAlign = 'left';
  ctx.fillText('DASH', 16, 44);

  // Hearts: pixel hearts next to the meter; empty ones are outlined.
  for (let i = 0; i < MAX_HEARTS; i += 1) {
    drawSprite(ctx, i < game.hearts ? HEART : HEART_EMPTY, 150 + i * 22, 14, 2, P);
  }

  // Overlays.
  if (game.phase !== 'running') {
    ctx.fillStyle = P.B;
    ctx.fillRect(WIDTH / 2 - 250, 70, 500, 96);
    ctx.fillStyle = P.D;
    ctx.fillRect(WIDTH / 2 - 250, 166, 500, 4);
    ctx.fillStyle = P.w;
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px var(--font-mono, ui-monospace, monospace)';
    const title = game.phase === 'dead' ? 'GAME OVER' : 'BLOCK RUNNER';
    ctx.fillText(title, WIDTH / 2, 106);
    ctx.font = '12px var(--font-mono, ui-monospace, monospace)';
    ctx.fillStyle = P.c;
    const hint =
      game.phase === 'dead'
        ? 'Space or R to run again'
        : 'Space jump · hold X to shoot · hold Shift to dash · 3 hearts · one block every 200 ms';
    ctx.fillText(hint, WIDTH / 2, 134);
    if (game.phase === 'dead') {
      ctx.fillStyle = P.y;
      ctx.fillText(`${game.score} blocks shot`, WIDTH / 2, 152);
    }
  }
}

export function BlockRunner() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game>(createGame());
  const soundRef = useRef<Sound | null>(null);
  const frameRef = useRef(0);
  const feedRef = useRef<'connecting' | 'live' | 'polling' | 'quiet'>('connecting');
  const [muted, setMuted] = useState(false);
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
      headTimes.current = [...headTimes.current.filter((t) => now - t < 2000), now];
      setRate(headTimes.current.length / 2);
      setHead(h);
      // If the loop has stalled (a throttled tab), skip the spawn so blocks do
      // not pile up at the boss and greet the player with a wall on return.
      if (now - lastFrameAt.current > 400) return;
      const next = spawnBlock(gameRef.current, h);
      if (next !== gameRef.current) sound().tick(gameRef.current.dash.active);
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

  // Input.
  const doJump = useCallback(() => apply(jump(gameRef.current)), [apply]);
  const doFire = useCallback(() => apply(fire(gameRef.current)), [apply]);
  const doFireHeld = useCallback((held: boolean) => apply(setFire(gameRef.current, held)), [apply]);
  const doRestart = useCallback(() => apply(restart(gameRef.current)), [apply]);
  const doDash = useCallback((held: boolean) => apply(setDash(gameRef.current, held)), [apply]);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      return Boolean(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      sound().unlock();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ArrowRight') {
        e.preventDefault();
        if (gameRef.current.phase !== 'dead') doDash(true);
        return;
      }
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (gameRef.current.phase === 'dead') doRestart();
        else doJump();
      } else if (e.code === 'KeyX' || e.code === 'Enter') {
        e.preventDefault();
        if (gameRef.current.phase === 'dead') doRestart();
        else if (gameRef.current.phase === 'ready') doFire();
        else doFireHeld(true);
      } else if (e.code === 'KeyR') {
        // Same as Space on the game-over screen; never resets a live run.
        if (gameRef.current.phase === 'dead') doRestart();
      } else if (e.code === 'KeyM') {
        const next = !sound().muted;
        sound().setMuted(next);
        setMuted(next);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ArrowRight') doDash(false);
      if (e.code === 'KeyX' || e.code === 'Enter') doFireHeld(false);
    };
    const onBlur = () => {
      doDash(false);
      doFireHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [doJump, doFire, doFireHeld, doRestart, doDash]);

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
    let pal = paletteForTheme();
    let palAt = 0;
    let shownScore = -1;
    let shownPhase: Game['phase'] | null = null;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      lastFrameAt.current = now;
      frameRef.current += 1;
      if (now - palAt > 500) {
        pal = paletteForTheme();
        palAt = now;
      }
      if (frameRef.current === 1) {
        setBest(readBest());
        setMuted(sound().muted);
      }

      const next = step(gameRef.current, dt);
      gameRef.current = next;

      for (const ev of next.events) {
        if (ev === 'jump') sound().jump();
        else if (ev === 'shoot') sound().shoot();
        else if (ev === 'burst') sound().burst();
        else if (ev === 'hit') sound().hit();
        else if (ev === 'land') sound().land();
        else if (ev === 'die') sound().die();
        else if (ev === 'hurt') sound().hurt();
        else if (ev === 'heart') sound().heart();
        else if (ev === 'dash-on') sound().dashOn();
        else if (ev === 'dash-off') sound().dashOff();
        else if (ev === 'thud') sound().thud();
      }
      if (next.score !== shownScore) {
        shownScore = next.score;
        setScore(next.score);
      }
      if (next.phase !== shownPhase) {
        shownPhase = next.phase;
        setPhase(next.phase);
        if (next.phase === 'dead') {
          setBest((b) => {
            const nb = Math.max(b, next.score);
            if (nb !== b) writeBest(nb);
            return nb;
          });
        }
      }

      render(ctx, next, frameRef.current, feedRef.current === 'quiet', pal);
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
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sound().unlock();
    if (gameRef.current.phase === 'dead') return doRestart();
    // Touch: tapping the picture jumps; the buttons under it shoot and dash.
    // Mouse: click shoots (hold to keep firing).
    if (e.pointerType === 'touch') return doJump();
    if (gameRef.current.phase === 'ready') doFire();
    else doFireHeld(true);
  };
  const onPointerUp = () => {
    doDash(false);
    doFireHeld(false);
  };

  const slot = head ? slotOf(head.timestampMs) : null;
  const feedLabel =
    feed === 'live' ? 'live · newHeads' : feed === 'polling' ? 'polling · 200 ms' : feed === 'quiet' ? 'chain quiet' : 'connecting';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <Text variant="caption" tone="muted">
            Latest block
          </Text>
          <div className="font-doto text-[28px] leading-none tabular-nums text-foreground">
            {head ? head.number.toLocaleString() : '———'}
            {slot ? <span className="text-base-blue"> {slot}</span> : null}
          </div>
        </div>
        <Stat label="Blocks / s" value={rate.toFixed(1)} />
        <Stat label="Shot" value={String(score)} />
        <Stat label="Best" value={String(best)} />
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
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full select-none rounded-xl bg-bds-blue-5 [image-rendering:pixelated] dark:bg-bds-blue-100"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, touchAction: 'none', background: P.sky, WebkitTouchCallout: 'none' }}
        aria-label={`Block Runner. ${phase === 'running' ? `Score ${score}.` : 'Press space to start.'}`}
        role="img"
      />

      {/* Touch controls: shown only on coarse pointers. Held buttons map to the
          same held-key semantics as the keyboard. */}
      <div className="hidden select-none gap-3 [@media(pointer:coarse)]:flex" style={{ WebkitTouchCallout: 'none' }}>
        <TouchButton
          label="Jump"
          hint="tap"
          onDown={() => {
            sound().unlock();
            if (gameRef.current.phase === 'dead') doRestart();
            else doJump();
          }}
        />
        <TouchButton
          label="Shoot"
          hint="hold"
          onDown={() => {
            sound().unlock();
            if (gameRef.current.phase === 'dead') return doRestart();
            if (gameRef.current.phase === 'ready') doFire();
            else doFireHeld(true);
          }}
          onUp={() => doFireHeld(false)}
        />
        <TouchButton
          label="Dash"
          hint="hold"
          onDown={() => {
            sound().unlock();
            doDash(true);
          }}
          onUp={() => doDash(false)}
        />
      </div>

      <Text variant="footnote" tone="muted">
        The boss on the right is the sequencer: every block it spits is a real vibenet block, pushed over WebSocket as
        it lands, one every 200 ms. Block height follows gas used. Shoot one to read its number and slot
        {head ? `, like ${blockLabel(head)}` : ''}. Space jumps, hold X to shoot, hold Shift to dash for double
        score, R or Space restarts after a run, M mutes. On a phone, tap the picture to jump and use the buttons.
      </Text>
    </div>
  );
}

function TouchButton({
  label,
  hint,
  onDown,
  onUp,
}: {
  label: string;
  hint: string;
  onDown: () => void;
  onUp?: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-16 flex-1 flex-col items-center justify-center rounded-full border border-bds-gray-15 bg-background text-foreground active:bg-bds-blue-0 dark:border-white/15 dark:active:bg-white/10"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={() => onUp?.()}
      onPointerCancel={() => onUp?.()}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`${label} (${hint})`}
    >
      <span className="text-[15px] font-medium">{label}</span>
      <span className="text-[10px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">{hint}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <span className="font-doto text-[28px] leading-none tabular-nums text-foreground">{value}</span>
    </div>
  );
}
