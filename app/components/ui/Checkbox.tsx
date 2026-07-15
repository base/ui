import { cn } from './cn';

type CheckboxProps = {
  checked: boolean;
  className?: string;
};

// Presentational checkbox indicator (the visual box + checkmark only). The
// caller owns the click target and state. Extracted from the snapshots
// component picker.
export function Checkbox({ checked, className }: CheckboxProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]',
        checked ? 'border-bds-blue-60 bg-bds-blue-60' : 'border-bds-gray-40 bg-white',
        className,
      )}
    >
      {checked && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}
