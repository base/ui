import { describe, expect, it } from 'vitest';

import {
  blockSizeFor,
  blockLabel,
  BOSS_X,
  createGame,
  DASH_MULTIPLIER,
  fire,
  GROUND_Y,
  hitsFor,
  jump,
  MAX_HEARTS,
  MOUTH_Y,
  PLAYER_H,
  PLAYER_X,
  restart,
  RESTART_GRACE,
  setDash,
  setFire,
  slotOf,
  spawnBlock,
  speedFor,
  start,
  step,
  STEP_UP,
  type Block,
  type Game,
  type Head,
} from './game';

const head = (number: number, over: Partial<Head> = {}): Head => ({
  number,
  timestampMs: 1_788_419_137_200,
  gasUsed: 220_000,
  ...over,
});

const zeroRng = () => 0.5;

const blk = (over: Partial<Block> & Pick<Block, 'x' | 'h'>): Block => ({
  id: 1,
  y: GROUND_Y - over.h,
  vy: 0,
  landed: true,
  w: 48,
  hp: 1,
  maxHp: 1,
  number: 1,
  timestampMs: null,
  ...over,
});

function run(game: Game, seconds: number, dt = 1 / 120): Game {
  let g = game;
  for (let t = 0; t < seconds; t += dt) g = step(g, dt, zeroRng);
  return g;
}

describe('slotOf / blockLabel', () => {
  it('names the 200 ms slot and formats the block number', () => {
    expect(slotOf(1_788_419_137_200)).toBe('.200');
    expect(slotOf(1_788_419_137_000)).toBe('.000');
    expect(slotOf(null)).toBeNull();
    expect(blockLabel({ number: 148_646, timestampMs: 1_788_419_137_200 })).toBe('148,646 · .200');
    expect(blockLabel({ number: 16, timestampMs: null })).toBe('16');
  });
});

describe('blockSizeFor', () => {
  it('grows continuously with gas: deposits-only blocks are small, busy blocks are tall and wide', () => {
    const quiet = blockSizeFor(200_000);
    const mid = blockSizeFor(500_000);
    const busy = blockSizeFor(1_000_000, 60);
    expect(quiet.w).toBe(32);
    expect(mid.w).toBe(48);
    expect(busy.w).toBe(64);
    expect(quiet.h).toBeLessThan(mid.h);
    expect(mid.h).toBeLessThan(busy.h);
    expect(busy.h).toBeLessThanOrEqual(112);
  });

  it('warms up: early in a run even busy blocks stay small, then grow', () => {
    const early = blockSizeFor(1_000_000, 0, 1, 1);
    const later = blockSizeFor(1_000_000, 0, 1, 20);
    expect(early.w).toBe(32);
    expect(early.h).toBeLessThan(later.h);
    expect(later.w).toBe(48);
  });

  it('gets bigger as the score climbs, and mixes widths every fourth block', () => {
    expect(blockSizeFor(300_000, 60).h).toBeGreaterThan(blockSizeFor(300_000, 0).h);
    expect(blockSizeFor(300_000, 60, 4).w).toBe(48);
    expect(blockSizeFor(300_000, 60, 5).w).toBe(32);
    // Early in a run the widest size is held back.
    expect(blockSizeFor(1_000_000, 0).w).toBe(48);
  });
});

describe('speedFor', () => {
  it('ramps with score, caps, and the dash multiplies it', () => {
    expect(speedFor(0)).toBe(560);
    expect(speedFor(10)).toBe(590);
    expect(speedFor(1_000)).toBe(720);
    expect(speedFor(0, true)).toBe(560 * DASH_MULTIPLIER);
  });
});

describe('spawnBlock', () => {
  it('ignores heads until the run starts', () => {
    expect(spawnBlock(createGame(), head(1)).blocks).toHaveLength(0);
  });

  it('spits a block from the boss mouth and opens its mouth once running', () => {
    const g = spawnBlock(start(createGame()), head(148_646));
    expect(g.blocks).toHaveLength(1);
    expect(g.blocks[0].x).toBeGreaterThanOrEqual(BOSS_X);
    expect(g.blocks[0].number).toBe(148_646);
    expect(g.blocks[0].landed).toBe(false);
    expect(g.blocks[0].y + g.blocks[0].h).toBeLessThanOrEqual(MOUTH_Y);
    expect(g.bossMouth).toBeGreaterThan(0);
  });

  it('a spat block arcs, falls, and thuds onto the rail with dust', () => {
    let g = spawnBlock(start(createGame()), head(1));
    let thudded = false;
    for (let t = 0; t < 0.6; t += 1 / 120) {
      g = step(g, 1 / 120, zeroRng);
      if (g.events.includes('thud')) thudded = true;
    }
    expect(thudded).toBe(true);
    expect(g.blocks[0].landed).toBe(true);
    expect(g.blocks[0].y + g.blocks[0].h).toBe(GROUND_Y);
  });
});

describe('jump / fire / dash', () => {
  it('a restart keeps held keys so a player mashing Space with X down comes back firing', () => {
    let g = setFire(start(createGame()), true);
    g = setDash(g, true);
    g = start(g);
    expect(g.fireHeld).toBe(true);
    expect(g.dash.held).toBe(true);
    expect(g.score).toBe(0);
  });

  it('start the run from the ready screen', () => {
    expect(jump(createGame()).phase).toBe('running');
    expect(fire(createGame()).phase).toBe('running');
    expect(setDash(createGame(), true).phase).toBe('running');
  });

  it('jump only works from the ground and emits a jump event', () => {
    const g = jump(start(createGame()));
    expect(g.player.vy).toBeLessThan(0);
    expect(g.events).toContain('jump');
    const again = jump({ ...g, events: [] });
    expect(again.events).toHaveLength(0);
  });

  it('fire respects the cooldown', () => {
    const g = fire(start(createGame()));
    expect(g.bullets).toHaveLength(1);
    expect(fire(g).bullets).toHaveLength(1);
    const cooled = run(g, 0.2);
    expect(fire(cooled).fireCooldown).toBeGreaterThan(0);
  });

  it('held fire keeps shooting at the cooldown rate', () => {
    let g = setFire(start(createGame()), true);
    expect(g.bullets).toHaveLength(1);
    g = run(g, 0.5);
    // Bullets leave the screen quickly, so count shoot events instead.
    let shots = 0;
    let h = setFire(start(createGame()), true);
    for (let t = 0; t < 1; t += 1 / 120) {
      h = step(h, 1 / 120, zeroRng);
      shots += h.events.filter((e) => e === 'shoot').length;
    }
    expect(shots).toBeGreaterThanOrEqual(5);
    expect(shots).toBeLessThanOrEqual(7);
    expect(setFire(h, false).fireHeld).toBe(false);
  });

  it('dash drains energy while held, regenerates when released, and moves further', () => {
    const idle = run(start(createGame()), 1);
    const dashed = run(setDash(start(createGame()), true), 1);
    expect(dashed.distance).toBeGreaterThan(idle.distance * 1.5);
    expect(dashed.dash.energy).toBeLessThan(1);
    expect(dashed.dash.active).toBe(true);
    expect(dashed.afterimages.length).toBeGreaterThan(0);
    const rested = run(setDash(dashed, false), 1);
    expect(rested.dash.energy).toBeGreaterThan(dashed.dash.energy);
    expect(rested.dash.active).toBe(false);
  });

  it('dash runs dry, stays off until the meter refills a bit, then works again', () => {
    const dry = run(setDash(start(createGame()), true), 2.5);
    expect(dry.dash.active).toBe(false);
    expect(dry.dash.spent).toBe(true);
    expect(dry.dash.energy).toBeLessThan(0.35);
    // Still holding: no flicker while it refills.
    const refilling = run(dry, 0.5);
    expect(refilling.dash.active).toBe(false);
    // Past the restart threshold it kicks back in.
    const back = run(refilling, 0.5);
    expect(back.dash.active).toBe(true);
    expect(back.dash.spent).toBe(false);
  });
});

describe('hitsFor', () => {
  it('wider blocks take more shots', () => {
    expect(hitsFor(32)).toBe(1);
    expect(hitsFor(48)).toBe(2);
    expect(hitsFor(64)).toBe(3);
  });

  it('a two-hit block chips on the first shot and bursts on the second', () => {
    let g = start(createGame());
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 300, h: 60, hp: 2, maxHp: 2 })] };
    g = fire(g);
    g = run(g, 0.3);
    expect(g.blocks).toHaveLength(1);
    expect(g.blocks[0].hp).toBe(1);
    expect(g.score).toBe(0);
    expect(g.particles.some((p) => p.kind === 'spark')).toBe(true);
    g = fire(g);
    g = run(g, 0.3);
    expect(g.blocks).toHaveLength(0);
    expect(g.score).toBe(1);
  });
});

describe('restart', () => {
  it('ignores a press in the first beat after dying, then works', () => {
    let g = { ...start(createGame()), hearts: 1 };
    g = { ...g, blocks: [blk({ x: PLAYER_X + 80, h: 60 })] };
    for (let t = 0; t < 0.5 && g.phase === 'running'; t += 1 / 120) g = step(g, 1 / 120, zeroRng);
    expect(g.phase).toBe('dead');
    expect(restart(g).phase).toBe('dead');
    g = run(g, RESTART_GRACE + 0.05);
    expect(restart(g).phase).toBe('running');
  });
});

describe('step', () => {
  it('a jump comes back down, lands, and kicks up dust', () => {
    let g = jump(start(createGame()));
    g = run(g, 1);
    expect(g.player.grounded).toBe(true);
    expect(g.player.y).toBe(GROUND_Y - PLAYER_H);
    expect(g.particles.some((p) => p.kind === 'dust') || g.time > 0.6).toBe(true);
  });

  it('a bullet destroys a block, scores, shakes, and reveals its label', () => {
    let g = start(createGame());
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 300, h: 60, number: 148_646, timestampMs: 1_788_419_137_200 })] };
    g = fire(g);
    g = run(g, 0.5);
    expect(g.blocks).toHaveLength(0);
    expect(g.score).toBe(1);
    expect(g.labels[0]?.text).toBe('148,646 · .200');
    expect(g.particles.some((p) => p.kind === 'shard')).toBe(true);
  });

  it('a hit while dashing scores double', () => {
    let g = setDash(start(createGame()), true);
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 300, h: 60 })] };
    g = fire(g);
    g = run(g, 0.5);
    expect(g.score).toBe(2);
  });

  it('running into a block side costs a heart, crumbles the block, and grants a moment of invulnerability', () => {
    let g = start(createGame());
    g = { ...g, blocks: [blk({ x: PLAYER_X + 80, h: 60 })] };
    let hurtAt = -1;
    for (let t = 0; t < 0.5 && hurtAt < 0; t += 1 / 120) {
      g = step(g, 1 / 120, zeroRng);
      if (g.events.includes('hurt')) hurtAt = t;
    }
    expect(hurtAt).toBeGreaterThanOrEqual(0);
    expect(g.phase).toBe('running');
    expect(g.hearts).toBe(MAX_HEARTS - 1);
    expect(g.blocks).toHaveLength(0);
    expect(g.invuln).toBeGreaterThan(0);
    expect(g.shake).toBeGreaterThan(0);
  });

  it('a wall during invulnerability is passed through without another heart lost', () => {
    let g = start(createGame());
    g = { ...g, hearts: 2, invuln: 1, blocks: [blk({ x: PLAYER_X + 80, h: 60 })] };
    g = run(g, 0.4);
    expect(g.hearts).toBe(2);
    expect(g.blocks).toHaveLength(0);
    expect(g.phase).toBe('running');
  });

  it('the last heart ends the run', () => {
    let g = start(createGame());
    g = { ...g, hearts: 1, blocks: [blk({ x: PLAYER_X + 80, h: 60 })] };
    g = run(g, 0.5);
    expect(g.phase).toBe('dead');
  });

  it('a small step is climbed instead of crashed into', () => {
    let g = start(createGame());
    g = { ...g, blocks: [blk({ x: PLAYER_X + 80, h: STEP_UP - 2 })] };
    g = run(g, 0.12);
    expect(g.hearts).toBe(MAX_HEARTS);
    expect(g.phase).toBe('running');
    expect(g.player.y).toBeLessThan(GROUND_Y - PLAYER_H);
    expect(g.player.grounded).toBe(true);
  });

  it('bursting blocks earns a heart back', () => {
    let g = { ...start(createGame()), hearts: 1, heartProgress: 11 };
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 300, h: 60 })] };
    g = fire(g);
    g = run(g, 0.5);
    expect(g.hearts).toBe(2);
  });

  it('landing on top of a block is safe and supports the player', () => {
    let g = start(createGame());
    const platform = blk({ x: PLAYER_X - 24, h: 60 });
    g = { ...g, blocks: [platform], player: { y: GROUND_Y - 60 - PLAYER_H - 20, vy: 0, grounded: false } };
    for (let t = 0; t < 0.4; t += 1 / 120) {
      g = step({ ...g, blocks: [{ ...platform }] }, 1 / 120, zeroRng);
    }
    expect(g.phase).toBe('running');
    expect(g.player.grounded).toBe(true);
    expect(g.player.y).toBe(GROUND_Y - 60 - PLAYER_H);
  });

  it('does nothing but decay effects when not running', () => {
    const g = step({ ...createGame(), labels: [{ x: 0, y: 0, text: 'x', age: 0 }], shake: 5 }, 2, zeroRng);
    expect(g.phase).toBe('ready');
    expect(g.labels).toHaveLength(0);
    expect(g.shake).toBe(0);
  });
});
