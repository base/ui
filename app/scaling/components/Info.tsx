'use client';

import { useId, useState, type ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';

// A popover, not InfoTooltip: it must also open on tap and stay open until Escape or an outside click.
export function Info({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        aria-label={label}
        aria-controls={open ? popupId : undefined}
        aria-describedby={open ? popupId : undefined}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-bds-gray-50 outline-none transition-colors hover:text-base-blue focus-visible:ring-2 focus-visible:ring-base-blue/40 data-[popup-open]:text-base-blue"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8} collisionPadding={12} className="z-[140]">
          <Popover.Popup
            id={popupId}
            initialFocus={false}
            className="max-w-[18rem] rounded-lg bg-background px-3 py-2 text-[12px] leading-relaxed text-bds-gray-70 shadow-lg outline-none ring-1 ring-black/[0.04] dark:bg-[#1a1a1a] dark:ring-inset dark:ring-white/10"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
