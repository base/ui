'use client';

import { Tooltip } from '@base-ui/react/tooltip';

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
    <Tooltip.Provider delay={150}>
      <Tooltip.Root>
        <Tooltip.Trigger
          type="button"
          aria-label={`Lifecycle status: ${summary}`}
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
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner
            side="top"
            align="center"
            sideOffset={14}
            collisionPadding={16}
            className="z-[12000]"
          >
            <Tooltip.Popup className="pointer-events-none w-max max-w-[min(20rem,calc(100vw-2rem))] origin-[var(--transform-origin)] rounded-lg bg-background px-3 py-2 shadow-lg outline-none ring-1 ring-black/[0.04] will-change-transform transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.97)] data-[instant]:transition-none data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.97)] dark:bg-[#1a1a1a] dark:ring-inset dark:ring-[color-mix(in_srgb,#1a1a1a,white_8%)] motion-reduce:transition-none">
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
              <Tooltip.Arrow className="group flex will-change-transform data-[side=bottom]:top-[-7px] data-[side=left]:right-[-11px] data-[side=right]:left-[-11px] data-[side=top]:bottom-[-7px]">
                <svg
                  width="16"
                  height="8"
                  viewBox="0 0 16 8"
                  aria-hidden="true"
                  className="block origin-center fill-background stroke-black/[0.04] group-data-[side=bottom]:rotate-180 group-data-[side=left]:-rotate-90 group-data-[side=right]:rotate-90 dark:fill-[#1a1a1a] dark:stroke-[color-mix(in_srgb,#1a1a1a,white_8%)]"
                >
                  <path d="M0 0 L6.2 6 Q8 8 9.8 6 L16 0" strokeWidth="1" strokeLinejoin="round" />
                </svg>
              </Tooltip.Arrow>
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
