'use client';

import * as Tooltip from '@radix-ui/react-tooltip';

import { cn } from '../../components/ui/cn';

type LifecycleTooltipEntry = {
  networkKey: string;
  network: string;
  state: string;
  date: string | null;
  dotClassName: string;
};

type LifecycleTooltipProps = {
  entries: LifecycleTooltipEntry[];
  summary: string;
  size: 'sm' | 'md';
  showLabels: boolean;
};

export function LifecycleTooltip({ entries, summary, size, showLabels }: LifecycleTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            role="button"
            aria-label={`Lifecycle status: ${summary}`}
            tabIndex={0}
            className={cn(
              'border-bds-gray-10 focus-visible:ring-base-blue/30 inline-flex items-center rounded-full border bg-white/80 outline-none transition-colors focus-visible:ring-2 dark:border-white/10 dark:bg-white/10',
              size === 'sm' ? 'gap-1 px-2 py-1' : 'gap-1.5 px-2.5 py-1.5',
            )}
          >
            {entries.map((entry) => (
              <span key={entry.networkKey} className="inline-flex items-center gap-1">
                <span
                  className={cn(
                    'rounded-full ring-2 ring-black/5 dark:ring-white/10',
                    size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
                    entry.dotClassName,
                  )}
                />
                {showLabels ? (
                  <span className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0px] text-[#787878] md:text-[12px] md:leading-[16px]">
                    {entry.networkKey.slice(0, 1)}
                  </span>
                ) : null}
              </span>
            ))}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={8}
            collisionPadding={16}
            className="border-bds-gray-10 pointer-events-none z-[12000] w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-background px-3 py-2 shadow-lg dark:border-white/10"
          >
            <span className="block space-y-1">
              {entries.map((entry) => (
                <span key={entry.network} className="flex items-baseline justify-between gap-4">
                  <span className="text-[11px] font-medium leading-[14px] tracking-[0px] text-foreground md:text-[12px] md:leading-[16px] dark:text-white">
                    {entry.network}
                  </span>
                  <span className="text-right font-mono text-[11px] font-medium leading-[14px] tracking-[0px] text-[#787878] md:text-[12px] md:leading-[16px]">
                    {entry.state}
                    {entry.date ? ` · ${entry.date}` : ''}
                  </span>
                </span>
              ))}
            </span>
            <Tooltip.Arrow width={10} height={5} className="fill-background" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
