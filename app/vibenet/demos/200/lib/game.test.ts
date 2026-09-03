import { describe, expect, it } from 'vitest';

import {
  blockSizeFor,
  blockLabel,
  BOSS_X,
  createGame,
  INHALE_RANGE,
  GROUND_Y,
  MAX_HEARTS,
  MOUTH_Y,
  PLAYER_H,
  PLAYER_X,
  restart,
  RESTART_GRACE,
  PLAYER_W,
  setInhale,
  slotOf,
  spawnBlock,
  speedFor,
  start,
  step,
  weightFor,
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
  weight: 1,
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
  it('ramps with score and caps', () => {
    expect(speedFor(0)).toBe(560);
    expect(speedFor(10)).toBe(590);
    expect(speedFor(1_000)).toBe(720);
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

describe('inhale', () => {
  it('a restart keeps held keys so a mashing player comes back inhaling', () => {
    let g = setInhale(start(createGame()), true);
    g = start(g);
    expect(g.inhaling).toBe(true);
    expect(g.score).toBe(0);
  });

  it('start the run from the ready screen', () => {
    expect(setInhale(createGame(), true).phase).toBe('running');
  });

});

describe('weightFor / swallowing', () => {
  it('wider blocks are heavier', () => {
    expect(weightFor(32)).toBe(1);
    expect(weightFor(48)).toBe(2);
    expect(weightFor(64)).toBe(2);
  });

  it('inhaling drags the nearest block in and swallows it, counting one eaten', () => {
    let g = setInhale(start(createGame()), true);
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 200, h: 60, weight: 2, number: 148_646, timestampMs: 1_788_419_137_200 })] };
    g = run(g, 0.2);
    expect(g.blocks).toHaveLength(0);
    expect(g.score).toBe(1);
    expect(g.labels[0]?.text).toBe('148,646 · .200');
    expect(g.puffed).toBeGreaterThan(0);
  });

  it('a heavy wall drags in slower than a light block', () => {
    const timeToEat = (weight: number) => {
      let g = setInhale(start(createGame()), true);
      g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 250, h: 60, weight })] };
      let t = 0;
      while (g.blocks.length > 0 && t < 2) {
        g = step(g, 1 / 120, zeroRng);
        t += 1 / 120;
      }
      return t;
    };
    expect(timeToEat(2)).toBeGreaterThan(timeToEat(1));
  });

  it('blocks beyond inhale range are left alone', () => {
    let g = setInhale(start(createGame()), true);
    const farX = PLAYER_X + PLAYER_W + INHALE_RANGE + 100;
    g = { ...g, blocks: [blk({ id: 9, x: farX, h: 60 })] };
    g = step(g, 1 / 120, zeroRng);
    // It only scrolled; suction did not add pull.
    expect(g.blocks[0].x).toBeGreaterThan(farX - speedFor(0) / 60 - 1);
  });

  it('contact while inhaling is a meal, not a crash', () => {
    let g = setInhale(start(createGame()), true);
    g = { ...g, blocks: [blk({ x: PLAYER_X + 80, h: 96, weight: 2 })] };
    g = run(g, 0.3);
    expect(g.hearts).toBe(MAX_HEARTS);
    expect(g.phase).toBe('running');
    expect(g.blocks).toHaveLength(0);
    expect(g.score).toBeGreaterThanOrEqual(1);
  });

  it('released inhale stops the pull', () => {
    let g = setInhale(start(createGame()), true);
    g = setInhale(g, false);
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 200, h: 60 })] };
    g = step(g, 1 / 120, zeroRng);
    expect(g.blocks).toHaveLength(1);
    expect(g.inhaling).toBe(false);
  });
});

describe('fullness / stuffed', () => {
  it('every block is a collision unless eaten: the first touch costs one heart', () => {
    let g = start(createGame());
    g = { ...g, blocks: [blk({ x: PLAYER_X + 80, h: 30 })] };
    let hurt = false;
    for (let t = 0; t < 0.4; t += 1 / 120) {
      g = step(g, 1 / 120, zeroRng);
      if (g.events.includes('hurt')) hurt = true;
    }
    expect(hurt).toBe(true);
    expect(g.hearts).toBe(MAX_HEARTS - 1);
    expect(g.phase).toBe('running');
    // He stays on the road — blocks are never walked on in normal play.
    expect(g.player.y).toBe(GROUND_Y - PLAYER_H);
  });

  it('a heavy wall still counts as ONE eaten, not its weight', () => {
    let g = setInhale(start(createGame()), true);
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 200, h: 96, weight: 2 })] };
    g = run(g, 0.4);
    expect(g.blocks).toHaveLength(0);
    expect(g.score).toBe(1);
  });

  it('each swallow fills the belly; heavier blocks fill it more', () => {
    const eat = (weight: number) => {
      let g = setInhale(start(createGame()), true);
      g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 200, h: 60, weight })] };
      g = run(g, 0.3);
      return g.fullness;
    };
    expect(eat(1)).toBeGreaterThan(0);
    expect(eat(2)).toBeGreaterThan(eat(1));
  });

  it('eating to the max enters FULL mode: no more eating, and a power fanfare', () => {
    let g = setInhale(start(createGame()), true);
    g = { ...g, fullness: 0.95 };
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 200, h: 60, weight: 2 })] };
    let announced = false;
    for (let t = 0; t < 0.4; t += 1 / 120) {
      g = step(g, 1 / 120, zeroRng);
      if (g.events.includes('stuffed')) announced = true;
    }
    expect(g.stuffed).toBe(true);
    expect(announced).toBe(true);
    expect(g.fullTime).toBeGreaterThan(2);
    // A new block is not eaten while FULL — it just rolls under him.
    g = { ...g, blocks: [blk({ id: 10, x: PLAYER_X + 260, h: 60, weight: 1 })] };
    const before = g.score;
    g = run(g, 0.15);
    expect(g.score).toBe(before);
  });

  it('while FULL he rolls over even the tallest wall unharmed', () => {
    let g = { ...start(createGame()), fullness: 1, stuffed: true, fullTime: 4 };
    g = { ...g, blocks: [blk({ x: PLAYER_X + 60, h: 96, weight: 2 })] };
    g = run(g, 0.25);
    expect(g.hearts).toBe(MAX_HEARTS);
    expect(g.phase).toBe('running');
    // He is standing on top of it.
    expect(g.player.y).toBeLessThan(GROUND_Y - PLAYER_H - 40);
  });

  it('FULL mode times out, he shrinks back to empty, and is hungry again', () => {
    let g = { ...setInhale(start(createGame()), true), fullness: 1, stuffed: true, fullTime: 0.2 };
    g = run(g, 1);
    expect(g.fullness).toBe(0);
    expect(g.stuffed).toBe(false);
    // Hungry again: a block within range gets eaten.
    g = { ...g, blocks: [blk({ id: 11, x: PLAYER_X + 200, h: 60, weight: 1 })] };
    g = run(g, 0.3);
    expect(g.score).toBeGreaterThan(0);
  });

  it('outside FULL mode, fullness does not drain on its own', () => {
    let g = { ...start(createGame()), fullness: 0.5 };
    g = run(g, 2);
    expect(g.fullness).toBe(0.5);
  });
});

describe('blocks are never road', () => {
  it('a wall cannot be climbed — it hits him', () => {
    let g = start(createGame());
    g = { ...g, blocks: [blk({ id: 2, x: PLAYER_X + 70, h: 96, weight: 2 })] };
    let hurt = false;
    for (let t = 0; t < 0.4; t += 1 / 120) {
      g = step(g, 1 / 120, zeroRng);
      if (g.events.includes('hurt')) hurt = true;
    }
    expect(hurt).toBe(true);
  });

  it('after FULL ends he keeps his footing over walls until he reaches the road', () => {
    let g = { ...start(createGame()), fullness: 0.01, stuffed: true, fullTime: 0 };
    g = { ...g, player: { y: GROUND_Y - 96 - PLAYER_H, vy: 0, grounded: true }, blocks: [blk({ x: PLAYER_X - 10, h: 96, weight: 2 })] };
    g = run(g, 0.2);
    expect(g.hearts).toBe(MAX_HEARTS);
    expect(g.descending || g.player.y + PLAYER_H >= GROUND_Y - 1).toBe(true);
    // Once the wall passes he lands on the road and is a normal runner again.
    g = { ...g, blocks: [] };
    g = run(g, 0.6);
    expect(g.descending).toBe(false);
    expect(g.player.y).toBe(GROUND_Y - PLAYER_H);
  });
});

describe('run dust', () => {
  it('kicks up dust at the feet while running on the ground', () => {
    const g = run(start(createGame()), 0.4);
    expect(g.particles.some((p) => p.kind === 'dust')).toBe(true);
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
  it('an airborne runner falls back to the rail and lands', () => {
    let g = start(createGame());
    g = { ...g, player: { y: GROUND_Y - PLAYER_H - 60, vy: 0, grounded: false } };
    g = run(g, 1);
    expect(g.player.grounded).toBe(true);
    expect(g.player.y).toBe(GROUND_Y - PLAYER_H);
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


  it('swallowing blocks earns a heart back', () => {
    let g = setInhale({ ...start(createGame()), hearts: 1, heartProgress: 11 }, true);
    g = { ...g, blocks: [blk({ id: 9, x: PLAYER_X + 200, h: 60 })] };
    g = run(g, 0.5);
    expect(g.hearts).toBe(2);
  });


  it('does nothing but decay effects when not running', () => {
    const g = step({ ...createGame(), labels: [{ x: 0, y: 0, text: 'x', age: 0 }], shake: 5 }, 2, zeroRng);
    expect(g.phase).toBe('ready');
    expect(g.labels).toHaveLength(0);
    expect(g.shake).toBe(0);
  });
});
