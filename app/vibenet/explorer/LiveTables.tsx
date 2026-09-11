'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '../../components/ui/cn';
import type { StreamStatus } from './live-stream';
import { isExplorerPaused, pauseHint, type PauseAction, type PauseState } from './pause';

export function LiveTables({
  pause, status, onPauseChange, children,
}: {
  pause: PauseState;
  status: StreamStatus | 'unavailable';
  onPauseChange: (action: PauseAction) => void;
  children: ReactNode;
}) {
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(releaseTimer.current), []);

  const hint = status === 'live' ? pauseHint(pause) : {
    connecting: 'Connecting…', reconnecting: 'Reconnecting…', unavailable: 'Stream unavailable',
  }[status];
  const explanation = status === 'live'
    ? 'Both tables pause while you hover over either table or focus a link. Move away to resume. Block ages keep updating.'
    : status === 'unavailable' ? 'No valid WebSocket endpoint configured.'
    : 'Connecting to the block stream. Existing rows remain visible while the connection recovers.';

  return (
    <section
      aria-label="Live explorer lists"
      className="relative grid grid-cols-1 gap-6 lg:grid-cols-2"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') onPauseChange('enter');
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') onPauseChange('leave');
      }}
      onFocusCapture={(event) => {
        if (event.target.matches(':focus-visible')) onPauseChange('focus');
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onPauseChange('blur');
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch') return;
        clearTimeout(releaseTimer.current);
        onPauseChange('touch');
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== 'touch') return;
        // Let the tap's click dispatch against the held link before replacing rows.
        releaseTimer.current = setTimeout(() => onPauseChange('release'), 0);
      }}
      onPointerCancel={(event) => {
        if (event.pointerType !== 'touch') return;
        clearTimeout(releaseTimer.current);
        onPauseChange('release');
      }}
    >
      <span
        role="status"
        title={explanation}
        className={cn(
          'absolute right-5 top-[26px] whitespace-nowrap text-[11px] leading-4 text-bds-gray-50 md:top-7 dark:text-bds-gray-40',
          status === 'live' && !isExplorerPaused(pause) && 'hidden [@media(hover:hover)]:inline',
        )}
      >
        {hint}
      </span>
      {children}
    </section>
  );
}
