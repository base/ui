'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { blocksAhead } from './block-window';
import type { BlockSummary } from './types';

type HeldBlocksOptions = {
  /** When `blocks` last changed (Unix ms). */
  blocksAt: number;
  /** Apply new blocks at most this often; 0 applies them as they arrive. */
  intervalMs: number;
  /** Stop applying new blocks, for example while the pointer is over the list. */
  paused: boolean;
  /** A list shown for another key (such as a different chain) is replaced at once. */
  resetKey: string;
};

type HeldBlocks = {
  visible: BlockSummary[];
  /** When `visible` last changed (Unix ms); ages are measured from here. */
  shownAt: number;
  /** How many blocks the chain is ahead of the top visible row. */
  newBlocks: number;
  /** Apply the latest blocks now, staying paused if paused. */
  showLatest: () => void;
};

// One displayed list shared by every cadence: incoming blocks are applied to
// it immediately (live), on a fixed interval, or not at all while paused, so
// switching cadence never redraws an older list.
export function useHeldBlocks(
  blocks: BlockSummary[],
  { blocksAt, intervalMs, paused, resetKey }: HeldBlocksOptions,
): HeldBlocks {
  const [shown, setShown] = useState({ key: resetKey, blocks, at: blocksAt });
  const latest = useRef(blocks);
  useEffect(() => {
    latest.current = blocks;
  }, [blocks]);

  // Adjusting state during render (not in an effect) means the stale list is
  // never committed. Live applies every change; any cadence fills an empty
  // list or a new key immediately rather than waiting for a tick.
  const live = !paused && intervalMs === 0;
  if (
    shown.key !== resetKey ||
    (shown.blocks !== blocks && (live || shown.blocks.length === 0))
  ) {
    setShown({ key: resetKey, blocks, at: blocksAt });
  }
  const visible = shown.key === resetKey ? shown.blocks : blocks;

  useEffect(() => {
    if (paused || intervalMs === 0) return undefined;
    const timer = window.setInterval(
      () => setShown({ key: resetKey, blocks: latest.current, at: Date.now() }),
      intervalMs,
    );
    return () => window.clearInterval(timer);
  }, [intervalMs, paused, resetKey]);

  const showLatest = useCallback(
    () => setShown({ key: resetKey, blocks: latest.current, at: Date.now() }),
    [resetKey],
  );

  return { visible, shownAt: shown.at, newBlocks: blocksAhead(blocks, visible), showLatest };
}
