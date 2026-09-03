// Block Runner — the pure game model. No canvas, no DOM, no timers, so it can
// be unit-tested and rendered by anything.
//
// The chain is the spawner: every new vibenet head (one per 200 ms under
// Denim) becomes one block that the boss on the right edge spits out. The
// player is a round little glutton who auto-runs and holds ONE button to
// inhale: the nearest block in range is dragged into its mouth and swallowed —
// one eaten — revealing its number and 200 ms slot. Busy walls are
// heavy — they drag in slower while the next blocks keep coming. EVERY block
// is a collision unless eaten: one heart per hit. Eat enough and he goes FULL
// for a few seconds — invulnerable, rolling over everything, unable to eat —
// then the belly empties and he is hungry again. One action, so it plays the
// same on a phone as on a keyboard.

export const WIDTH = 800;
export const HEIGHT = 360;
export const GROUND_Y = 300;

export const PLAYER_X = 96;
export const PLAYER_W = 48;
export const PLAYER_H = 48;
/** Blocks in front within this range get pulled while inhaling. */
export const INHALE_RANGE = 280;
/** Extra approach speed suction adds, divided by the block's weight. */
const PULL_SPEED = 1300;
/** Seconds of chew (mouth shut, cheeks full) after each swallow. */
const PUFF_TIME = 0.12;
/** The mouth must be visibly open this long before a pulled block goes down. */
const OPEN_MIN = 0.07;
/** One tap opens the mouth for this long — one bite per tap. */
const INHALE_BURST = 0.28;
/** Fullness gained per unit of block weight. Only the full-mode cycle empties it. */
const FULL_PER_WEIGHT = 0.11;
/** Seconds of FULL mode: too round to hurt, rolling over every block. */
const FULL_TIME = 2.5;
/** How fast he slims back down once full mode ends. */
const DEFLATE_RATE = 2.2;

/**
 * The FULL gauge, 0..1: how much of the whole FULL experience remains —
 * the cruise timer plus the shrink back down — so the bar hits empty on the
 * exact frame the state ends, never before.
 */
export function fullMeter(game: Pick<Game, 'stuffed' | 'fullTime' | 'fullness'>): number {
  if (!game.stuffed) return 0;
  const total = FULL_TIME + 1 / DEFLATE_RATE;
  const remaining = game.fullTime + game.fullness / DEFLATE_RATE;
  return Math.max(0, Math.min(1, remaining / total));
}

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
const GRAVITY = 2000;
const LABEL_LIFE = 1.2;
const PARTICLE_LIFE = 0.6;
const AFTERIMAGE_LIFE = 0.28;
const AFTERIMAGE_EVERY = 0.045;
const BOSS_MOUTH_OPEN = 0.16;
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
  /** Suction weight: heavy walls pull in slower and fill the belly faster. */
  weight: number;
  number: number;
  timestampMs: number | null;
};

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
  /** Afterimage cadence timer while FULL (he barrels along up there). */
  sinceImage: number;
  blocks: Block[];
  /** Heads waiting to be spat. Arrival jitter is absorbed here: the boss
   * emits exactly one every 200 ms of game time, so spacing stays even. */
  pending: Head[];
  /** Time banked toward the next spit. */
  spawnClock: number;
  labels: Label[];
  particles: Particle[];
  afterimages: Afterimage[];
  /** Camera shake amplitude in pixels; decays each step. */
  shake: number;
  /** Seconds the boss mouth stays open after spitting a block. */
  bossMouth: number;
  /** The mouth is open (a tap's bite window is running). */
  inhaling: boolean;
  /** Seconds left in the current bite window. */
  inhaleTime: number;
  /** Chew timer after a swallow; suction pauses while it runs. */
  puffed: number;
  /** Seconds the mouth has been open in the current inhale cycle. */
  mouthOpen: number;
  /** Timer for the little dust puffs at the feet while running. */
  runDust: number;
  /** How full the belly is, 0..1. The body visibly grows with it. */
  fullness: number;
  /** FULL mode: maxed out — invulnerable, rolls over every block, cannot eat. */
  stuffed: boolean;
  /** Seconds of FULL mode remaining before he shrinks back to empty. */
  fullTime: number;
  /** After FULL ends: ghost-falls through blocks until he touches the road. */
  descending: boolean;
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

export type GameEvent = 'inhale-on' | 'gulp' | 'stuffed' | 'hurt' | 'die' | 'land' | 'thud' | 'heart';

export function createGame(): Game {
  return {
    phase: 'ready',
    time: 0,
    distance: 0,
    score: 0,
    player: { y: GROUND_Y - PLAYER_H, vy: 0, grounded: true },
    sinceImage: 0,
    blocks: [],
    pending: [],
    spawnClock: 0.2,
    labels: [],
    particles: [],
    afterimages: [],
    shake: 0,
    bossMouth: 0,
    inhaling: false,
    inhaleTime: 0,
    puffed: 0,
    mouthOpen: 0,
    runDust: 0,
    fullness: 0,
    stuffed: false,
    fullTime: 0,
    descending: false,
    sinceDeath: 0,
    hearts: MAX_HEARTS,
    invuln: 0,
    heartProgress: 0,
    nextId: 1,
    events: [],
  };
}

/** Scroll speed: ramps gently with score, dino-style, and caps. */
export function speedFor(score: number): number {
  return BASE_SPEED + Math.min(score * 3, MAX_SPEED_BONUS);
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

/** Suction weight: quiet blocks are light (1), busy walls heavy (2). */
export function weightFor(w: number): number {
  return Math.min(2, Math.max(1, Math.round(w / 16) - 1));
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

/**
 * A new head arrived: queue it. The step spits queued heads on a strict
 * 200 ms metronome, so network delivery jitter never shows up as uneven
 * spacing on the street. Ignored unless running.
 */
export function spawnBlock(game: Game, head: Head): Game {
  if (game.phase !== 'running') return game;
  return { ...game, pending: [...game.pending, head] };
}

export function start(game: Game): Game {
  // Keys still held through a restart keep working: a player mashing the
  // button comes back inhaling.
  return {
    ...createGame(),
    phase: 'running',
    nextId: game.nextId,
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

/**
 * One tap = one bite: opens the mouth for a short window that can swallow at
 * most one block, then it closes. Holding a key does nothing more — the next
 * block needs the next tap. Tapping mid-window refreshes it.
 */
export function tap(game: Game): Game {
  if (game.phase === 'ready') return { ...start(game), inhaling: true, inhaleTime: INHALE_BURST };
  if (game.phase !== 'running') return game;
  return {
    ...game,
    inhaling: true,
    inhaleTime: INHALE_BURST,
    events: game.inhaling ? game.events : [...game.events, 'inhale-on'],
  };
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

  // FULL mode leaves afterimages — the unstoppable barrel-along up top.
  let sinceImage = game.sinceImage + dt;
  let afterimages = game.afterimages;
  if (game.stuffed && sinceImage >= AFTERIMAGE_EVERY) {
    sinceImage = 0;
    afterimages = [...afterimages, { y: game.player.y, age: 0, frame: Math.floor(game.time * 12) % 3 }];
  }

  const speed = speedFor(score);

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

  // The boss's metronome: spit one queued head per 200 ms of game time.
  let pending = game.pending;
  let spawnClock = Math.min(0.2, game.spawnClock + dt);
  let nextId = game.nextId;
  let bossMouth = Math.max(0, game.bossMouth - dt);
  while (spawnClock >= 0.2 && pending.length > 0) {
    const head = pending[0];
    pending = pending.slice(1);
    spawnClock -= 0.2;
    const { w, h } = blockSizeFor(head.gasUsed, score, head.number, game.time);
    blocks = [
      ...blocks,
      {
        id: nextId,
        x: SPAWN_X,
        y: MOUTH_Y - h,
        vy: SPIT_VY,
        landed: false,
        w,
        h,
        weight: weightFor(w),
        number: head.number,
        timestampMs: head.timestampMs,
      },
    ];
    nextId += 1;
    bossMouth = BOSS_MOUTH_OPEN;
  }

  const fx = decay(game.labels, game.particles, afterimages);
  let { labels, particles } = fx;
  afterimages = fx.afterimages;
  let shake = Math.max(0, game.shake - 40 * dt);
  for (const t of thuds) {
    particles = [...particles, ...dust(t.x + t.w / 2, GROUND_Y - 2, rng)];
    shake = Math.max(shake, Math.min(3, t.w / 24));
    events.push('thud');
  }
  // Suction: the nearest landed block ahead, within range, is dragged toward
  // the mouth — heavy walls drag slower. Reaching the mouth is a swallow: it
  // scores the block's weight and shows its label. Everything else keeps
  // scrolling at them meanwhile.
  const mouthX = PLAYER_X + PLAYER_W - 4;
  let inhaleTime = Math.max(0, game.inhaleTime - dt);
  let inhaling = game.inhaling && inhaleTime > 0;
  let puffed = Math.max(0, game.puffed - dt);
  const chewing = puffed > 0;
  // FULL mode runs on a timer, then he deflates back to empty and is hungry
  // again. Outside full mode, fullness only ever goes up (by eating).
  let fullness = game.fullness;
  let stuffed = game.stuffed;
  let fullTime = game.fullTime;
  let descending = game.descending;
  if (stuffed) {
    if (fullTime > 0) {
      fullTime = Math.max(0, fullTime - dt);
    } else {
      fullness = Math.max(0, fullness - DEFLATE_RATE * dt);
      if (fullness === 0) {
        stuffed = false;
        descending = true;
      }
    }
  }
  // The mouth cycle: open (pull) → chomp → chew → open. The open phase must
  // last a beat before anything goes down, so the animation always shows it.
  let mouthOpen = inhaling && !chewing ? game.mouthOpen + dt : 0;
  let target: Block | null = null;
  const mouthReach = game.player.y + PLAYER_H + 6;
  if (inhaling && !chewing && !stuffed) {
    for (const b of blocks) {
      if (!b.landed || b.x + b.w < mouthX || b.x > mouthX + INHALE_RANGE) continue;
      // The mouth can only eat what it can reach: a block whose top is below
      // his feet (he is perched somewhere) is out of range.
      if (b.y > mouthReach) continue;
      if (!target || b.x < target.x) target = b;
    }
  }
  const eatingId = target ? target.id : null;
  if (target) {
    // A block that reaches the mouth waits pressed against it until the open
    // phase has lasted long enough, then goes down in one chomp.
    const pulled = { ...target, x: Math.max(mouthX, target.x - (PULL_SPEED / target.weight) * dt) };
    if (pulled.x <= mouthX && mouthOpen >= OPEN_MIN) {
      blocks = blocks.filter((b) => b.id !== target.id);
      // Score is a true count of blocks eaten — heavy walls reward through
      // the belly instead (they fill it twice as fast).
      score += 1;
      heartProgress += 1;
      puffed = PUFF_TIME;
      labels = [...labels, { x: mouthX + 20, y: pulled.y - 14, text: blockLabel(pulled), age: 0 }];
      particles = [...particles, ...shards(mouthX + 10, pulled.y + pulled.h / 2, rng)];
      events.push('gulp');
      mouthOpen = 0;
      inhaling = false;
      inhaleTime = 0;
      fullness = Math.min(1, fullness + FULL_PER_WEIGHT * pulled.weight);
      if (fullness >= 1) {
        stuffed = true;
        fullTime = FULL_TIME;
        events.push('stuffed');
      }
    } else {
      blocks = blocks.map((b) => (b.id === target.id ? pulled : b));
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
    if (b.id === eatingId) continue; // you cannot stand on what you are swallowing
    if (descending) continue; // ghost-fall: he drops through everything to the road
    const overlapsX = right > b.x && left < b.x + b.w;
    if (!overlapsX) continue;
    const top = b.y;
    // Consistency rule: every block is a collision unless eaten. Blocks are
    // only walkable in FULL mode, where he rolls over everything. The descent
    // after FULL is a ghost-fall (handled above): in a stream this dense there
    // is always another block underfoot, so walking the descent down would
    // strand him on the tops forever.
    if (stuffed && vy >= 0) {
      floor = Math.min(floor, top);
    } else if (y + PLAYER_H > top + 1) {
      bonked = bonked ?? b;
    }
  }
  if (bonked && inhaling && !stuffed && puffed <= 0) {
    // Mouth-first: while inhaling with the mouth free, contact is a meal, not
    // a crash. Mid-chew the mouth is busy — a wall then is a real hit, which
    // is what makes back-to-back walls dangerous.
    blocks = blocks.filter((b) => b.id !== bonked.id);
    score += 1;
    heartProgress += 1;
    puffed = PUFF_TIME;
    mouthOpen = 0;
    inhaling = false;
    inhaleTime = 0;
    fullness = Math.min(1, fullness + FULL_PER_WEIGHT * bonked.weight);
    if (fullness >= 1) {
      stuffed = true;
      fullTime = FULL_TIME;
      events.push('stuffed');
    }
    labels = [...labels, { x: PLAYER_X + PLAYER_W, y: bonked.y - 14, text: blockLabel(bonked), age: 0 }];
    events.push('gulp');
  } else if (bonked && invuln <= 0) {
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
  // Run dust: a puff kicked up behind the feet on a quick cadence.
  // The little cloud that sells the run.
  let runDust = game.runDust + dt;
  if (game.player.grounded && runDust >= 0.13) {
    runDust = 0;
    particles = [
      ...particles,
      { x: PLAYER_X + 2 + rng() * 8, y: game.player.y + PLAYER_H - 2, vx: -70 - rng() * 90, vy: -20 - rng() * 40, age: 0, kind: 'dust' as const },
      { x: PLAYER_X + 6 + rng() * 10, y: game.player.y + PLAYER_H - 4, vx: -50 - rng() * 70, vy: -10 - rng() * 30, age: 0, kind: 'dust' as const },
    ];
  }

  let grounded = false;
  if (descending && y + PLAYER_H >= GROUND_Y - 1) descending = false;
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
    sinceImage,
    blocks,
    labels,
    particles,
    afterimages,
    pending,
    spawnClock,
    nextId,
    shake,
    bossMouth,
    inhaling,
    inhaleTime,
    puffed,
    mouthOpen,
    runDust,
    fullness,
    stuffed,
    fullTime,
    descending,
    hearts,
    invuln: dead ? 0 : invuln,
    heartProgress,
    events,
  };
}
