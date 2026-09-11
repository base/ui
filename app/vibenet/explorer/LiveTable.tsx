'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import type { StreamStatus } from './live-stream';
import { isExplorerPaused, pauseHint, type PauseAction, type PauseState } from './pause';

export function LiveTable({
  title, pause, status, onPauseChange, children,
}: {
  title: string;
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
    ? 'Only this table pauses while you hover over it or focus a link. Move away to continue following new blocks.'
    : status === 'unavailable' ? 'No valid WebSocket endpoint configured.'
    : 'Connecting to the block stream. Existing rows remain visible while the connection recovers.';

  return (
    <Card
      role="region"
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 bg-background p-5 dark:bg-white/5"
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
      <div className="flex items-baseline justify-between gap-2">
        <Text variant="headline">{title}</Text>
        <span
          role="status"
          title={explanation}
          className={cn(
            'shrink-0 whitespace-nowrap text-[11px] text-bds-gray-50 dark:text-bds-gray-40',
            status === 'live' && !isExplorerPaused(pause) && 'hidden [@media(hover:hover)]:inline',
          )}
        >
          {hint}
        </span>
      </div>
      {children}
    </Card>
  );
}
