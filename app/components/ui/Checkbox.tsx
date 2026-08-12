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
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-[background-color,border-color] duration-150 ease-out',
        checked ? 'border-foreground bg-foreground' : 'border-bds-gray-20 bg-background',
        className,
      )}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          // The box fills with the foreground, so the tick has to be the
          // background to stay legible in either mode.
          'text-background transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
          checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
        )}
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}
