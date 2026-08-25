import type { SVGProps } from 'react';

const VIBENET_PATH =
  'M30.2895 14.8575L20.0038 20.0002M20.0038 20.0002L10.2895 14.2861M20.0038 20.0002L20.0038 30.8571M30.8608 22.8275V17.1724C30.8608 15.3861 29.9078 13.7354 28.3608 12.8423L22.4737 9.44331C20.9267 8.55015 19.0207 8.55015 17.4737 9.44331L11.5865 12.8423C10.0395 13.7354 9.08649 15.3861 9.08649 17.1724V22.8275C9.08649 24.6138 10.0395 26.2644 11.5865 27.1576L17.4737 30.5566C19.0207 31.4497 20.9267 31.4497 22.4737 30.5566L28.3608 27.1576C29.9078 26.2644 30.8608 24.6138 30.8608 22.8275Z';

export function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 11L11 5M11 5H6M11 5V10" />
    </svg>
  );
}

export function AnimatedArrowIcon({
  size = 16,
  strokeWidth = 1.5,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M7.5 4L13.5 10L7.5 16" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M13.5 10H0"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray="13.5"
        strokeDashoffset="13.5"
        className="transition-[stroke-dashoffset] duration-200 ease-out group-hover:[stroke-dashoffset:0]"
      />
    </svg>
  );
}

export function CloseIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
    >
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  );
}

export function ClipboardIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

// Raw path data (24x24 grid, matching ClipboardIcon/CheckIcon below) for
// morphicons' <MorphIcon>, which morphs between two icons on state change
// instead of an instant swap.
export const CLIPBOARD_MORPH_ICON =
  'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z';
export const CHECK_MORPH_ICON = 'M5 13l4 4L19 7';

export function CheckIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function VibenetIcon(props: SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 18, className, ...rest } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="5 5 30 30"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={VIBENET_PATH} />
    </svg>
  );
}
