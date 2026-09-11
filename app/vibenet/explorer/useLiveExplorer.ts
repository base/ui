'use client';

import { useEffect, useRef, useState } from 'react';

import type { StatsRow } from '../library/api-types';
import { vibenetApi } from '../library/client';
import { VIBENET_WS_URL } from '../library/config';
import { startExplorerStream, type ExplorerSnapshot, type StreamStatus } from './live-stream';
import { explorerPauseReducer, INITIAL_PAUSE_STATE, isExplorerPaused, type PauseAction } from './pause';

const EMPTY_SNAPSHOT: ExplorerSnapshot = { blocks: [], txs: [] };

export function useLiveExplorer() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<StreamStatus | 'unavailable'>('connecting');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const pauseState = useRef(INITIAL_PAUSE_STATE);
  const latest = useRef<ExplorerSnapshot>(EMPTY_SNAPSHOT);
  const visible = useRef<ExplorerSnapshot>(EMPTY_SNAPSHOT);

  // Update the stream gate synchronously with the interaction, not in a later
  // effect: a head arriving immediately after pointer-enter must not move rows.
  function dispatchPause(action: PauseAction) {
    pauseState.current = explorerPauseReducer(pauseState.current, action);
    const nextPaused = isExplorerPaused(pauseState.current);
    setPaused(nextPaused);
    if (nextPaused) {
      setNewKeys(new Set());
    } else if (latest.current !== visible.current) {
      visible.current = latest.current;
      setSnapshot(latest.current);
      setNewKeys(new Set());
    }
  }

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;
    let statsInFlight = false;
    let lastStatsAttempt = -Infinity;
    const controller = new AbortController();

    // Indexed totals are independent of the live chain and may lag it. Refresh
    // at most once per ten seconds, on block arrival (no recurring poll timer).
    function refreshStats() {
      if (statsInFlight || Date.now() - lastStatsAttempt < 10_000) return;
      statsInFlight = true;
      lastStatsAttempt = Date.now();
      const signal = typeof AbortSignal.any === 'function'
        ? AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)])
        : controller.signal;
      void vibenetApi.explorer.stats(signal).then((value) => {
        if (!disposed) setStats(value);
      }).catch(() => {
        // Preserve the last known indexed totals; do not interrupt live blocks.
      }).finally(() => { statsInFlight = false; });
    }

    function start() {
      if (disposed || document.hidden || stop) return;
      if (!VIBENET_WS_URL) {
        setStatus('unavailable');
        setLoading(false);
        return;
      }
      stop = startExplorerStream({
        url: VIBENET_WS_URL,
        onStatus: (value) => {
          if (disposed) return;
          setStatus(value);
          if (value === 'reconnecting') setLoading(false);
        },
        onSnapshot: (next) => {
          if (disposed) return;
          latest.current = next;
          setLoading(false);
          refreshStats();
          if (isExplorerPaused(pauseState.current) && visible.current.blocks.length > 0) return;
          const previous = visible.current;
          const seenBlocks = new Set(previous.blocks.map((block) => block.hash));
          const seenTxs = new Set(previous.txs.map((tx) => tx.hash));
          const fresh = new Set<string>();
          if (previous.blocks.length) {
            next.blocks.forEach((block) => {
              if (!seenBlocks.has(block.hash)) fresh.add(`block-${block.hash}`);
            });
            next.txs.forEach((tx) => {
              if (!seenTxs.has(tx.hash)) fresh.add(`tx-${tx.hash}`);
            });
          }
          visible.current = next;
          setSnapshot(next);
          setNewKeys(fresh);
          clearTimeout(highlightTimer);
          highlightTimer = setTimeout(() => setNewKeys(new Set()), 350);
        },
      });
      refreshStats();
    }

    function visibilityChanged() {
      if (document.hidden) {
        stop?.();
        stop = undefined;
      } else {
        start();
      }
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    start();
    return () => {
      disposed = true;
      stop?.();
      controller.abort();
      clearTimeout(highlightTimer);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  return { ...snapshot, status, loading, stats, newKeys, paused, dispatchPause };
}
