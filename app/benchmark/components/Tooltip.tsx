'use client';

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  delayDuration?: number;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

const Tooltip = ({
  children,
  content,
  className = "",
  delayDuration = 700,
  side = "top",
  align = "center",
}: TooltipProps) => {
  const trigger: ReactElement = isValidElement(children) ? (
    children
  ) : (
    <button type="button">{children}</button>
  );

  return (
    <TooltipPrimitive.Provider delay={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={trigger} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            className="z-50"
            sideOffset={14}
            side={side}
            align={align}
          >
            <TooltipPrimitive.Popup
              className={`rounded-md bg-gray-900 px-3 py-2 text-sm text-white shadow-md outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[instant]:transition-none ${className}`}
            >
              {content}
              <TooltipPrimitive.Arrow className="flex data-[side=bottom]:top-[-7px] data-[side=left]:right-[-11px] data-[side=left]:rotate-90 data-[side=right]:left-[-11px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-7px] data-[side=top]:rotate-180">
                <svg width="16" height="8" viewBox="0 0 16 8" fill="none" aria-hidden="true">
                  <path d="M0 8L8 0L16 8" className="fill-gray-900" />
                </svg>
              </TooltipPrimitive.Arrow>
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};

export default Tooltip;
