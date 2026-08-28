'use client';

import type { ReactNode } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';

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

/** Open chevron: fill covers the popup’s inset ring at the join; stroke only the slants. */
function TooltipCaret() {
  return (
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
  );
}

/**
 * Small "ⓘ" affordance that reveals a short explanation on hover or focus.
 *
 * The trigger is a real <button> (not a role-button span), so keyboard and
 * screen-reader users get it for free; Base UI handles Escape, focus, and
 * pointer/keyboard parity. Content sits at z-[140] — above the Modal (120) and
 * Select popper (130), see the overlay layer scale in globals.css — so it stays
 * usable inside dialogs. Self-contained Provider so callers can drop it in
 * anywhere without wiring one up.
 */
export function InfoTooltip({ label, children, side = 'top', className }: InfoTooltipProps) {
  return (
    <Tooltip.Provider delay={150} timeout={300}>
      <Tooltip.Root>
        <Tooltip.Trigger
          type="button"
          aria-label={label}
          closeOnClick={false}
          className={cn(
            'inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-bds-gray-20 text-[10px] font-semibold leading-none text-bds-gray-50 outline-none transition-colors hover:border-base-blue hover:text-base-blue focus-visible:ring-2 focus-visible:ring-base-blue/40 dark:border-white/20',
            className,
          )}
        >
          <span aria-hidden="true">i</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner side={side} sideOffset={14} collisionPadding={12} className="z-[140]">
            <Tooltip.Popup className="max-w-[18rem] origin-[var(--transform-origin)] rounded-lg bg-background px-3 py-2 text-[12px] leading-relaxed text-bds-gray-70 shadow-lg outline-none ring-1 ring-black/[0.04] will-change-transform transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.97)] data-[instant]:transition-none data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.97)] dark:bg-[#1a1a1a] dark:ring-inset dark:ring-[color-mix(in_srgb,#1a1a1a,white_8%)] motion-reduce:transition-none">
              {children}
              <TooltipCaret />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
