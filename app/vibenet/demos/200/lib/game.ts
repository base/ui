// Block Runner — the pure game model. No canvas, no DOM, no timers, so it can
// be unit-tested and rendered by anything.
//
// The chain is the spawner: every new vibenet head (one per 200 ms under
// Denim) becomes one block that the boss on the right edge spits out. The
// player auto-runs, jumps over or lands on blocks, shoots them to reveal their
// number and 200 ms slot, and can hold a dash for speed and double score.
// Hitting a block's side ends the run, like the offline dino game.

export const WIDTH = 800;
export const HEIGHT = 360;
export const GROUND_Y = 300;

export const PLAYER_X = 96;
export const PLAYER_W = 42;
export const PLAYER_H = 54;

export const BOSS_X = WIDTH - 104;
const SPAWN_X = BOSS_X + 8;
/** Where the boss's mouth is; blocks are spat from here and fall to the rail. */
export const MOUTH_Y = GROUND_Y - 26;
const SPIT_VY = -300;
const BLOCK_GRAVITY = 2400;
/** Sprite pixels per block; width = 16 × scale. */
const MIN_BLOCK_H = 30;
const MAX_BLOCK_H = 112;

const BASE_SPEED = 560;
const MAX_SPEED_BONUS = 160;
export const DASH_MULTIPLIER = 1.8;
const DASH_DRAIN = 0.5;
const DASH_REGEN = 0.3;
const DASH_RESTART = 0.35;
const GRAVITY = 2000;
const JUMP_VY = -700;
const BULLET_SPEED = 1100;
export const BULLET_W = 18;
export const BULLET_H = 15;
const FIRE_COOLDOWN = 0.14;
const LABEL_LIFE = 1.2;
const PARTICLE_LIFE = 0.6;
const AFTERIMAGE_LIFE = 0.28;
const AFTERIMAGE_EVERY = 0.045;
const BOSS_MOUTH_OPEN = 0.16;
/** A block top this close above the feet is climbed, not crashed into. */
export const STEP_UP = 22;
export const MAX_HEARTS = 3;
const HURT_INVULN = 1.1;
/** Bursts needed to earn a heart back. */
const HEART_REFILL = 12;
/** Seconds of small blocks at the start of a run, so the rhythm lands first. */
const WARMUP = 8;
export const RESTART_GRACE = 0.4;

export type Head = {
  number: number;
  /** Denim millisecond timestamp, or null on chains without it. */
  timestampMs: number | null;
  gasUsed: number;
};

export type Block = {
  id: number;
  x: number;
  /** Top edge. Falls from the boss's mouth until it lands on the rail. */
  y: number;
  vy: number;
  landed: boolean;
  w: number;
  h: number;
  /** Hits left; wider blocks take more. Bursts at zero. */
  hp: number;
  maxHp: number;
  number: number;
  timestampMs: number | null;
};

export type Bullet = { x: number; y: number };
export type Label = { x: number; y: number; text: string; age: number };
export type ParticleKind = 'shard' | 'dust' | 'spark';
export type Particle = { x: number; y: number; vx: number; vy: number; age: number; kind: ParticleKind };
export type Afterimage = { y: number; age: number; frame: number };

export type Game = {
  phase: 'ready' | 'running' | 'dead';
  time: number;
  distance: number;
  score: number;
  player: { y: number; vy: number; grounded: boolean };
  dash: {
    held: boolean;
    active: boolean;
    energy: number;
    /** True after the meter ran dry; the dash cannot restart until it refills a bit. */
    spent: boolean;
    sinceImage: number;
  };
  blocks: Block[];
  bullets: Bullet[];
  labels: Label[];
  particles: Particle[];
  afterimages: Afterimage[];
  /** Camera shake amplitude in pixels; decays each step. */
  shake: number;
  /** Seconds the boss mouth stays open after spitting a block. */
  bossMouth: number;
  fireCooldown: number;
  /** Hold to fire: the step fires whenever the cooldown allows. */
  fireHeld: boolean;
  /** Seconds since the run ended; a restart needs a deliberate press after a beat. */
  sinceDeath: number;
  hearts: number;
  /** Seconds of invulnerability left after a hit. */
  invuln: number;
  /** Bursts banked toward the next heart. */
  heartProgress: number;
  nextId: number;
  /** Set for one step when something audible happened; the renderer clears it. */
  events: GameEvent[];
};

export type GameEvent = 'jump' | 'shoot' | 'burst' | 'hit' | 'hurt' | 'die' | 'land' | 'dash-on' | 'dash-off' | 'thud' | 'heart';

export function createGame(): Game {
  return {
    phase: 'ready',
    time: 0,
    distance: 0,
    score: 0,
    player: { y: GROUND_Y - PLAYER_H, vy: 0, grounded: true },
    dash: { held: false, active: false, energy: 1, spent: false, sinceImage: 0 },
    blocks: [],
    bullets: [],
    labels: [],
    particles: [],
    afterimages: [],
    shake: 0,
    bossMouth: 0,
    fireCooldown: 0,
    fireHeld: false,
    sinceDeath: 0,
    hearts: MAX_HEARTS,
    invuln: 0,
    heartProgress: 0,
    nextId: 1,
    events: [],
  };
}

/** Scroll speed: ramps gently with score, dino-style, caps, and the dash multiplies it. */
export function speedFor(score: number, dashing = false): number {
  const base = BASE_SPEED + Math.min(score * 3, MAX_SPEED_BONUS);
  return dashing ? base * DASH_MULTIPLIER : base;
}

/**
 * Block size from gas used and how far the run has gone. Vibenet blocks always
 * carry two system deposits (~200k gas together), so anything above that is
 * user activity: a taller wall. Height is continuous in gas so no two blocks
 * look alike, and both dimensions grow with score so the lane visibly changes
 * as the run goes on. Width is snapped to whole sprite pixels (16 × 2, 3, 4).
 */
export function blockSizeFor(gasUsed: number, score = 0, blockNumber = 0, time = WARMUP): { w: number; h: number } {
  const activity = Math.min(1, Math.max(0, (gasUsed - 200_000) / 800_000));
  const difficulty = Math.min(1, score / 60);
  let h = Math.round(MIN_BLOCK_H + (MAX_BLOCK_H - MIN_BLOCK_H) * Math.min(1, activity * (0.55 + 0.45 * difficulty) + difficulty * 0.25));
  // Base width from activity; every fourth block gets a size bump once the run
  // is under way, so widths mix rather than stepping up in lockstep.
  let scale = activity < 0.15 ? 2 : activity < 0.5 ? 3 : 4;
  if (difficulty > 0.3 && blockNumber % 4 === 0) scale = Math.min(4, scale + 1);
  if (difficulty < 0.15 && scale === 4) scale = 3;
  // Warm-up: the first seconds are small blocks the runner can step over, so
  // the 200 ms rhythm is felt before the walls arrive. Every block still lands.
  if (time < WARMUP) {
    const ease = time / WARMUP;
    h = Math.round(Math.min(h, MIN_BLOCK_H + (MAX_BLOCK_H - MIN_BLOCK_H) * ease * 0.5));
    scale = Math.min(scale, ease < 0.5 ? 2 : 3);
  }
  return { w: 16 * scale, h: Math.max(h, 12 * scale) };
}

/** Hits to burst a block: one per 16 px of width beyond the smallest. */
export function hitsFor(w: number): number {
  return Math.max(1, Math.round(w / 16) - 1);
}

/** The 200 ms slot inside the second, `.000` … `.800`, or null pre-Denim. */
export function slotOf(timestampMs: number | null): string | null {
  if (timestampMs === null) return null;
  return `.${String(timestampMs % 1000).padStart(3, '0')}`;
}

export function blockLabel(block: Pick<Block, 'number' | 'timestampMs'>): string {
  const slot = slotOf(block.timestampMs);
  return slot ? `${block.number.toLocaleString()} · ${slot}` : block.number.toLocaleString();
}

/** A new head arrived: the boss spits a block. Ignored unless running. */
export function spawnBlock(game: Game, head: Head): Game {
  if (game.phase !== 'running') return game;
  const { w, h } = blockSizeFor(head.gasUsed, game.score, head.number, game.time);
  const block: Block = {
    id: game.nextId,
    x: SPAWN_X,
    y: MOUTH_Y - h,
    vy: SPIT_VY,
    landed: false,
    w,
    h,
    hp: hitsFor(w),
    maxHp: hitsFor(w),
    number: head.number,
    timestampMs: head.timestampMs,
  };
  return { ...game, nextId: game.nextId + 1, blocks: [...game.blocks, block], bossMouth: BOSS_MOUTH_OPEN };
}

export function start(game: Game): Game {
  // Keys still held through a restart keep working: a player mashing Space
  // with X down should come back firing.
  return {
    ...createGame(),
    phase: 'running',
    nextId: game.nextId,
    fireHeld: game.fireHeld,
    dash: { ...createGame().dash, held: game.dash.held },
  };
}

/**
 * Restart after a death. Ignored for a beat after dying so a key that was
 * already being mashed does not skip the game-over screen — that reads as the
 * runner passing straight through the block.
 */
export function restart(game: Game): Game {
  if (game.phase === 'dead' && game.sinceDeath < RESTART_GRACE) return game;
  return start(game);
}

export function jump(game: Game): Game {
  if (game.phase === 'ready') return start(game);
  if (game.phase !== 'running' || !game.player.grounded) return game;
  return {
    ...game,
    player: { ...game.player, vy: JUMP_VY, grounded: false },
    events: [...game.events, 'jump'],
  };
}

export function fire(game: Game): Game {
  if (game.phase === 'ready') return start(game);
  if (game.phase !== 'running' || game.fireCooldown > 0) return game;
  const bullet: Bullet = { x: PLAYER_X + PLAYER_W - 6, y: game.player.y + 24 };
  return {
    ...game,
    bullets: [...game.bullets, bullet],
    fireCooldown: FIRE_COOLDOWN,
    events: [...game.events, 'shoot'],
  };
}

/** Hold to keep firing at the cooldown rate; the first shot fires immediately. */
export function setFire(game: Game, held: boolean): Game {
  if (game.fireHeld === held) return game;
  const next = { ...game, fireHeld: held };
  return held ? fire(next) : next;
}

/** Hold to dash. The step decides whether there is energy to actually go faster. */
export function setDash(game: Game, held: boolean): Game {
  if (game.phase === 'ready' && held) return { ...start(game), dash: { ...createGame().dash, held: true } };
  if (game.dash.held === held) return game;
  return { ...game, dash: { ...game.dash, held } };
}

function shards(x: number, y: number, rng: () => number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = rng() * Math.PI * 2;
    const power = 120 + rng() * 220;
    out.push({ x, y, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power - 100, age: 0, kind: 'shard' });
  }
  return out;
}

function sparks(x: number, y: number, rng: () => number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < 5; i += 1) {
    out.push({ x, y, vx: -80 - rng() * 160, vy: -120 + rng() * 240, age: 0, kind: 'spark' });
  }
  return out;
}

function dust(x: number, y: number, rng: () => number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < 5; i += 1) {
    out.push({ x: x + rng() * 20 - 10, y, vx: -60 - rng() * 120, vy: -30 - rng() * 60, age: 0, kind: 'dust' });
  }
  return out;
}

/** Advance the world by `dt` seconds. `rng` is injectable so tests are deterministic. */
export function step(game: Game, dt: number, rng: () => number = Math.random): Game {
  const decay = (labels: Label[], particles: Particle[], afterimages: Afterimage[]) => ({
    labels: labels
      .map((l) => ({ ...l, y: l.y - 34 * dt, age: l.age + dt }))
      .filter((l) => l.age < LABEL_LIFE),
    particles: particles
      .map((p) => ({
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        vy: p.vy + (p.kind === 'dust' ? 120 : 800) * dt,
        age: p.age + dt,
      }))
      .filter((p) => p.age < PARTICLE_LIFE),
    afterimages: afterimages.map((a) => ({ ...a, age: a.age + dt })).filter((a) => a.age < AFTERIMAGE_LIFE),
  });

  if (game.phase !== 'running') {
    return {
      ...game,
      ...decay(game.labels, game.particles, game.afterimages),
      shake: Math.max(0, game.shake - 40 * dt),
      bossMouth: Math.max(0, game.bossMouth - dt),
      sinceDeath: game.phase === 'dead' ? game.sinceDeath + dt : 0,
      events: [],
    };
  }

  const events: GameEvent[] = [];
  let score = game.score;
  let hearts = game.hearts;
  let heartProgress = game.heartProgress;
  let invuln = Math.max(0, game.invuln - dt);

  // Held fire: shoot again as soon as the cooldown allows.
  let fireCooldown = Math.max(0, game.fireCooldown - dt);
  let fired = game.bullets;
  if (game.fireHeld && fireCooldown === 0) {
    fired = [...fired, { x: PLAYER_X + PLAYER_W - 6, y: game.player.y + 24 }];
    fireCooldown = FIRE_COOLDOWN;
    events.push('shoot');
  }

  // Dash: drains while held, regenerates otherwise. A meter that ran dry stays
  // spent until it refills a little (or the key is released), so it does not
  // flicker on and off at zero.
  let energy = game.dash.energy;
  let spent = game.dash.spent;
  if (!game.dash.held || energy >= DASH_RESTART) spent = false;
  const dashing = game.dash.held && !spent && energy > 0;
  if (dashing) {
    energy = Math.max(0, energy - DASH_DRAIN * dt);
    if (energy === 0) spent = true;
  } else {
    energy = Math.min(1, energy + DASH_REGEN * dt);
  }
  if (dashing && !game.dash.active) events.push('dash-on');
  if (!dashing && game.dash.active) events.push('dash-off');
  let sinceImage = game.dash.sinceImage + dt;
  let afterimages = game.afterimages;
  if (dashing && sinceImage >= AFTERIMAGE_EVERY) {
    sinceImage = 0;
    afterimages = [...afterimages, { y: game.player.y, age: 0, frame: Math.floor(game.time * 12) % 3 }];
  }

  const speed = speedFor(score, dashing);

  // Scroll blocks; airborne ones fall until they thud onto the rail. Drop the
  // ones that left the screen.
  let thuds: Block[] = [];
  let blocks = game.blocks
    .map((b) => {
      const x = b.x - speed * dt;
      if (b.landed) return { ...b, x };
      const vy = b.vy + BLOCK_GRAVITY * dt;
      const y = b.y + vy * dt;
      if (y + b.h >= GROUND_Y) {
        const landed = { ...b, x, y: GROUND_Y - b.h, vy: 0, landed: true };
        thuds = [...thuds, landed];
        return landed;
      }
      return { ...b, x, y, vy };
    })
    .filter((b) => b.x + b.w > -4);

  // Bullets fly right; a hit removes the block and reveals it.
  const fx = decay(game.labels, game.particles, afterimages);
  let { labels, particles } = fx;
  afterimages = fx.afterimages;
  let shake = Math.max(0, game.shake - 40 * dt);
  for (const t of thuds) {
    particles = [...particles, ...dust(t.x + t.w / 2, GROUND_Y - 2, rng)];
    shake = Math.max(shake, Math.min(3, t.w / 24));
    events.push('thud');
  }
  const bullets: Bullet[] = [];
  for (const bullet of fired) {
    const nx = bullet.x + BULLET_SPEED * dt;
    const hit = blocks.find(
      (b) => nx + BULLET_W >= b.x && bullet.x <= b.x + b.w && bullet.y + BULLET_H >= b.y && bullet.y <= b.y + b.h,
    );
    if (hit && hit.hp > 1) {
      // Chip it: the block stays, a little lighter.
      blocks = blocks.map((b) => (b.id === hit.id ? { ...b, hp: b.hp - 1 } : b));
      particles = [...particles, ...sparks(nx + BULLET_W, bullet.y + BULLET_H / 2, rng)];
      events.push('hit');
    } else if (hit) {
      blocks = blocks.filter((b) => b.id !== hit.id);
      score += dashing ? 2 : 1;
      heartProgress += 1;
      labels = [...labels, { x: hit.x + hit.w / 2, y: hit.y - 14, text: blockLabel(hit), age: 0 }];
      particles = [...particles, ...shards(hit.x + hit.w / 2, hit.y + hit.h / 2, rng)];
      shake = Math.max(shake, 4);
      events.push('burst');
    } else if (nx < BOSS_X + 20) {
      bullets.push({ x: nx, y: bullet.y });
    }
  }

  // Player physics: gravity, then resolve against the ground and block tops.
  const prevBottom = game.player.y + PLAYER_H;
  let vy = game.player.vy + GRAVITY * dt;
  let y = game.player.y + vy * dt;
  let floor = GROUND_Y;
  let dead = false;
  const left = PLAYER_X + 6;
  const right = PLAYER_X + PLAYER_W - 6;
  let bonked: Block | null = null;
  for (const b of blocks) {
    const overlapsX = right > b.x && left < b.x + b.w;
    if (!overlapsX) continue;
    const top = b.y;
    if (prevBottom <= top + 1 && vy >= 0) {
      // Landing on it.
      floor = Math.min(floor, top);
    } else if (prevBottom - top <= STEP_UP && vy >= 0) {
      // A small step: climb it, like walking up stairs.
      floor = Math.min(floor, top);
    } else if (y + PLAYER_H > top + 1) {
      bonked = bonked ?? b;
    }
  }
  if (bonked && invuln <= 0) {
    // The block you ran into crumbles (no score) and costs a heart. A short
    // invulnerability window keeps one wall from taking every heart at once.
    blocks = blocks.filter((b) => b.id !== bonked.id);
    particles = [...particles, ...shards(bonked.x + bonked.w / 2, bonked.y + bonked.h / 2, rng)];
    hearts -= 1;
    heartProgress = 0;
    if (hearts <= 0) {
      dead = true;
    } else {
      invuln = HURT_INVULN;
      shake = Math.max(shake, 8);
      events.push('hurt');
    }
  } else if (bonked) {
    // Still flashing from the last hit: pass through the block harmlessly.
    blocks = blocks.filter((b) => b.id !== bonked.id);
  }
  if (heartProgress >= HEART_REFILL && hearts < MAX_HEARTS) {
    hearts += 1;
    heartProgress = 0;
    events.push('heart');
  }
  let grounded = false;
  if (y + PLAYER_H >= floor && vy >= 0) {
    if (!game.player.grounded) {
      events.push('land');
      particles = [...particles, ...dust(PLAYER_X + PLAYER_W / 2, floor - 2, rng)];
    }
    y = floor - PLAYER_H;
    vy = 0;
    grounded = true;
  }

  if (dead) {
    events.push('die');
    shake = 10;
  }

  return {
    ...game,
    phase: dead ? 'dead' : 'running',
    time: game.time + dt,
    distance: game.distance + speed * dt,
    score,
    player: { y, vy, grounded },
    dash: { held: game.dash.held, active: dashing && !dead, energy, spent, sinceImage },
    blocks,
    bullets,
    labels,
    particles,
    afterimages,
    shake,
    bossMouth: Math.max(0, game.bossMouth - dt),
    fireCooldown,
    hearts,
    invuln: dead ? 0 : invuln,
    heartProgress,
    events,
  };
}
