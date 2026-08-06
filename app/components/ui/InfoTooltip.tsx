'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

import { cn } from './cn';

type InfoTooltipProps = {
  /**
   * Accessible name for the trigger — describe the concept, not the icon,
   * e.g. "About policy scopes". Read by screen readers in place of the glyph.
   */
  label: string;
  /** Tooltip body. Plain text or rich nodes. */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
};

/**
 * Small "ⓘ" affordance that reveals a short explanation on hover or focus.
 *
 * The trigger is a real <button> (not a role-button span), so keyboard and
 * screen-reader users get it for free; Radix handles Escape, focus, and
 * pointer/keyboard parity. Content sits at z-[140] — above the Modal (120) and
 * Select popper (130), see the z-index ladder in globals.css — so it stays
 * usable inside dialogs. Self-contained Provider so callers can drop it in
 * anywhere without wiring one up.
 */
export function InfoTooltip({ label, children, side = 'top', className }: InfoTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-bds-gray-20 text-[10px] font-semibold leading-none text-bds-gray-50 outline-none transition-colors hover:border-base-blue hover:text-base-blue focus-visible:ring-2 focus-visible:ring-base-blue/40 dark:border-white/20 dark:text-bds-gray-30',
              className,
            )}
          >
            <span aria-hidden="true">i</span>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={side}
            sideOffset={6}
            collisionPadding={12}
            className="z-[140] max-w-[18rem] rounded-lg border border-bds-gray-10 bg-white px-3 py-2 text-[12px] leading-relaxed text-bds-gray-70 shadow-lg dark:border-white/10 dark:bg-[#1a1a1a] dark:text-bds-gray-20"
          >
            {children}
            <Tooltip.Arrow className="fill-white dark:fill-[#1a1a1a]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
