import type { ReactNode } from 'react';

type ProgressBarProps = {
  /** Current value; clamped so the fill never exceeds `max`. */
  value: number;
  max: number;
  /** Optional label row rendered above the track. */
  label?: ReactNode;
  className?: string;
};

// Simple labeled progress/usage bar. Generalized from the snapshots disk-usage
// bar so any "X of Y" fill indicator can reuse it.
export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={className}>
      {label ? <div className="mb-2 flex items-baseline gap-2 text-[13px]">{label}</div> : null}
      <div className="h-2.5 overflow-hidden rounded-full bg-bds-gray-10">
        {/* Width is data-driven, so it stays an inline style rather than a class. */}
        <div className="h-full rounded-full bg-bds-blue-60" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
