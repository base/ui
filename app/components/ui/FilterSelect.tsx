import { useCallback } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

type FilterSelectProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: ReactNode;
};

// Pill-styled native select with a custom chevron. Extracted from the changelog
// filter bar so any future filter UI can reuse the same control.
export function FilterSelect({ value, onChange, ariaLabel, children }: FilterSelectProps) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
    [onChange],
  );
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={handleChange}
        aria-label={ariaLabel}
        className="h-11 w-full appearance-none rounded-full border border-bds-gray-10 bg-white pl-4 pr-9 text-[14px] text-black outline-none dark:border-white/10 dark:bg-white/10 dark:text-white"
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-bds-gray-60 dark:text-bds-gray-20"
      >
        <path d="M4 6L8 10L12 6" />
      </svg>
    </div>
  );
}
