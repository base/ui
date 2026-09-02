'use client';

import { cn } from './cn';

type SliderMark = {
  value: number;
  label: string;
};

// Matches the h-4/w-4 thumb below. The thumb's center travels from
// THUMB_PX/2 to width - THUMB_PX/2, so marks must follow that geometry
// instead of the raw track percentage or they drift near the ends.
const THUMB_PX = 16;

type SliderProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Labeled stops rendered under the track; clicking one jumps to its value. */
  marks?: SliderMark[];
  'aria-label'?: string;
  className?: string;
};

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  marks,
  'aria-label': ariaLabel,
  className,
}: SliderProps) {
  const span = max - min;
  const position = (markValue: number) => (span > 0 ? ((markValue - min) / span) * 100 : 0);
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bds-gray-10 outline-none dark:bg-white/10',
          '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground',
          '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      />
      {marks && marks.length > 0 ? (
        <div className="relative h-4 select-none">
          {marks.map((mark) => {
            const pct = position(mark.value);
            return (
              <button
                key={mark.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange(mark.value)}
                style={{
                  left: `calc(${pct}% + ${((50 - pct) / 100) * THUMB_PX}px)`,
                  transform: 'translateX(-50%)',
                }}
                className={cn(
                  'absolute top-0 font-mono text-[10px] leading-4 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  mark.value === value
                    ? 'font-medium text-foreground'
                    : 'text-bds-gray-50 hover:text-foreground',
                )}
              >
                {mark.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
