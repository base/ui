import Image from 'next/image';

type IlloProps = {
  width?: number;
  height?: number;
  className?: string;
};

const ACCENT = 'var(--illo-accent)';
const SURFACE = 'var(--bds-gray-5)';
const MUTED = 'var(--illo-muted)';

export function VibenetIllo({ width = 48, height = 48, className }: IlloProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <path d="M46 24C46 15.8569 41.5758 8.74711 35 4.94321C34.2907 4.53293 33.5565 4.1611 32.8 3.83059C30.1052 2.65317 27.1289 2 24 2C20.8711 2 17.8948 2.65317 15.2 3.83059C14.4435 4.1611 13.7093 4.53293 13 4.94321C6.42418 8.74711 2 15.8569 2 24M46 24C46 32.1431 41.5758 39.2529 35 43.0568C34.2907 43.4671 33.5565 43.8389 32.8 44.1694C30.1052 45.3468 27.1289 46 24 46C20.8711 46 17.8948 45.3468 15.2 44.1694C14.4435 43.8389 13.7093 43.4671 13 43.0568C6.42418 39.2529 2 32.1431 2 24M46 24H38.6667M2 24H9.33333M14.9744 43.7441C14.9744 43.7441 9.33333 36.9217 9.33333 24M9.33333 24C9.33333 11.0783 14.9744 4.25586 14.9744 4.25586M9.33333 24H38.6667M33.0256 4.25586C33.0256 4.25586 38.6667 11.0783 38.6667 24M38.6667 24C38.6667 36.9217 33.0256 43.7441 33.0256 43.7441M4.25586 14.9744C4.25586 14.9744 11.0783 9.33333 24 9.33333C36.9217 9.33333 43.7441 14.9744 43.7441 14.9744M43.7441 33.0256C43.7441 33.0256 36.9217 38.6667 24 38.6667C11.0783 38.6667 4.25586 33.0256 4.25586 33.0256" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25.5 -2.18557e-08C25.7761 -9.78513e-09 26 0.223858 26 0.5L26 3.5C26 3.77614 25.7761 4 25.5 4L22.5 4C22.2239 4 22 3.77614 22 3.5L22 0.5C22 0.223857 22.2239 -1.6506e-07 22.5 -1.5299e-07L25.5 -2.18557e-08Z" fill="currentColor" />
      <path d="M25.5 44C25.7761 44 26 44.2239 26 44.5L26 47.5C26 47.7761 25.7761 48 25.5 48L22.5 48C22.2239 48 22 47.7761 22 47.5L22 44.5C22 44.2239 22.2239 44 22.5 44L25.5 44Z" fill="currentColor" />
      <path d="M14 14.5C14 14.2239 14.2239 14 14.5 14H16.5C16.7761 14 17 14.2239 17 14.5V16.5C17 16.7761 16.7761 17 16.5 17H14.5C14.2239 17 14 16.7761 14 16.5V14.5Z" fill="currentColor" />
      <path d="M22.5 15.5C22.5 15.2239 22.7239 15 23 15H25C25.2761 15 25.5 15.2239 25.5 15.5V17.5C25.5 17.7761 25.2761 18 25 18H23C22.7239 18 22.5 17.7761 22.5 17.5V15.5Z" fill={MUTED} />
      <path d="M22.5 30.5051C22.5 30.229 22.7239 30.0051 23 30.0051H25C25.2761 30.0051 25.5 30.229 25.5 30.5051V32.5051C25.5 32.7813 25.2761 33.0051 25 33.0051H23C22.7239 33.0051 22.5 32.7813 22.5 32.5051V30.5051Z" fill={MUTED} />
      <rect x="31" y="14" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="14" y="31" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="31" y="31" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="19" y="19.0026" width="10" height="10" rx="1.5" fill={ACCENT} stroke={SURFACE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="6.28662" y="21.0026" width="6" height="6" rx="1.5" fill="currentColor" stroke={SURFACE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="35.7129" y="21.0026" width="6" height="6" rx="1.5" fill="currentColor" stroke={SURFACE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AccountIllo({ width = 50, height = 47, className }: IlloProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 50 47" fill="none" aria-hidden="true" className={className}>
      <ellipse cx="25" cy="23.4998" rx="18" ry="17.7978" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="25" cy="23.4998" rx="14" ry="13.8427" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.99987 40.4998L8.99988 40.4998" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40.9999 40.4998L46.9999 40.4998" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.99987 6.49988L8.99988 6.49988" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40.9999 6.49988L46.9999 6.49988" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.99988 45.4998L2.99988 1.49976" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.9999 45.4998L46.9999 1.49976" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="7" y="4.5" width="4" height="4" rx="0.5" fill={ACCENT} />
      <rect x="38.9662" y="4.5" width="4" height="4" rx="0.5" fill={ACCENT} />
      <rect x="7" y="38.5" width="4" height="4" rx="0.5" fill={ACCENT} />
      <rect x="1.5" y="44" width="3" height="3" rx="0.375" fill="currentColor" />
      <rect x="1.5" width="3" height="3" rx="0.375" fill="currentColor" />
      <rect x="45.5" y="44" width="3" height="3" rx="0.375" fill="currentColor" />
      <rect x="45.5" width="3" height="3" rx="0.375" fill="currentColor" />
      <rect x="38.9663" y="38.5" width="4" height="4" rx="0.5" fill={ACCENT} />
      <rect x="1" y="20.4998" width="6" height="6" rx="0.8" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="43" y="20.4998" width="6" height="6" rx="0.8" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25.1494 25.0769C20.8202 25.0769 17.0785 27.5887 15.2998 31.2341C17.5917 34.1531 21.1494 36.0309 25.1484 36.031C29.1479 36.031 32.7071 34.1535 34.999 31.2341C33.2205 27.5887 29.4786 25.0771 25.1494 25.0769Z" fill={ACCENT} />
      <path d="M21.7959 15.4998C21.5198 15.4998 21.2959 15.7236 21.2959 15.9998L21.2959 21.9998C21.2959 22.2759 21.5198 22.4998 21.7959 22.4998L27.7959 22.4998C28.072 22.4998 28.2959 22.2759 28.2959 21.9998L28.2959 15.9998C28.2959 15.7236 28.072 15.4998 27.7959 15.4998L21.7959 15.4998Z" fill={ACCENT} />
    </svg>
  );
}

export function TokenIllo({ width = 52, height = 52, className }: IlloProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 52 52" fill="none" aria-hidden="true" className={className}>
      <path d="M6.26569 4.23431C6.41571 4.08429 6.6192 4 6.83137 4H9H11.1686C11.3808 4 11.5843 4.08429 11.7343 4.23431L13.7657 6.26569C13.9157 6.41571 14 6.6192 14 6.83137V9V11.1686C14 11.3808 13.9157 11.5843 13.7657 11.7343L11.7343 13.7657C11.5843 13.9157 11.3808 14 11.1686 14H9H6.83137C6.6192 14 6.41571 13.9157 6.26569 13.7657L4.23431 11.7343C4.08429 11.5843 4 11.3808 4 11.1686V9V6.83137C4 6.6192 4.08429 6.41571 4.23431 6.26569L6.26569 4.23431Z" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40.2657 4.23431C40.4157 4.08429 40.6192 4 40.8314 4H43H45.1686C45.3808 4 45.5843 4.08429 45.7343 4.23431L47.7657 6.26569C47.9157 6.41571 48 6.6192 48 6.83137V9V11.1686C48 11.3808 47.9157 11.5843 47.7657 11.7343L45.7343 13.7657C45.5843 13.9157 45.3808 14 45.1686 14H43H40.8314C40.6192 14 40.4157 13.9157 40.2657 13.7657L38.2343 11.7343C38.0843 11.5843 38 11.3808 38 11.1686V9V6.83137C38 6.6192 38.0843 6.41571 38.2343 6.26569L40.2657 4.23431Z" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.26569 38.2343C6.41571 38.0843 6.6192 38 6.83137 38H9H11.1686C11.3808 38 11.5843 38.0843 11.7343 38.2343L13.7657 40.2657C13.9157 40.4157 14 40.6192 14 40.8314V43V45.1686C14 45.3808 13.9157 45.5843 13.7657 45.7343L11.7343 47.7657C11.5843 47.9157 11.3808 48 11.1686 48H9H6.83137C6.6192 48 6.41571 47.9157 6.26569 47.7657L4.23431 45.7343C4.08429 45.5843 4 45.3808 4 45.1686V43V40.8314C4 40.6192 4.08429 40.4157 4.23431 40.2657L6.26569 38.2343Z" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40.2657 38.2343C40.4157 38.0843 40.6192 38 40.8314 38H43H45.1686C45.3808 38 45.5843 38.0843 45.7343 38.2343L47.7657 40.2657C47.9157 40.4157 48 40.6192 48 40.8314V43V45.1686C48 45.3808 47.9157 45.5843 47.7657 45.7343L45.7343 47.7657C45.5843 47.9157 45.3808 48 45.1686 48H43H40.8314C40.6192 48 40.4157 47.9157 40.2657 47.7657L38.2343 45.7343C38.0843 45.5843 38 45.3808 38 45.1686V43V40.8314C38 40.6192 38.0843 40.4157 38.2343 40.2657L40.2657 38.2343Z" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="26" cy="26" rx="18" ry="17.7978" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="26" cy="25.8427" rx="14" ry="13.8427" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="7" y="7" width="4" height="4" rx="0.5" fill={ACCENT} />
      <rect x="41" y="41" width="4" height="4" rx="0.5" fill={ACCENT} />
      <rect x="45" y="7" width="4" height="4" rx="0.5" transform="rotate(90 45 7)" fill={MUTED} />
      <rect x="11" y="41" width="4" height="4" rx="0.5" transform="rotate(90 11 41)" fill={MUTED} />
      <rect x="28" y="16" width="4" height="4" rx="0.5" transform="rotate(90 28 16)" fill={MUTED} />
      <rect x="28" y="32" width="4" height="4" rx="0.5" transform="rotate(90 28 32)" fill={MUTED} />
      <rect x="36" y="28" width="4" height="4" rx="0.5" transform="rotate(-180 36 28)" fill={MUTED} />
      <rect x="20" y="28" width="4" height="4" rx="0.5" transform="rotate(-180 20 28)" fill={MUTED} />
      <path d="M26 18V34" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34.005 25.995L18.005 25.995" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="23" y="23.0645" width="6" height="6" rx="0.5" fill={ACCENT} />
    </svg>
  );
}

export function ValidityIllo({ width = 52, height = 52, className }: IlloProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 52 52" fill="none" aria-hidden="true" className={className}>
      <path d="M25.9999 41.9999L25.9999 9.99992" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="37.4444" y="15" width="22" height="22" rx="1" transform="rotate(90 37.4444 15)" fill={SURFACE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.99988 3.99993L8.99988 9.99993" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.99988 41.9999L8.99988 47.9999" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42.9999 3.99992L42.9999 9.99992" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42.9999 41.9999L42.9999 47.9999" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3.99988" y="9.99993" width="6" height="44" rx="1" transform="rotate(-90 3.99988 9.99993)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3.99988" y="47.9999" width="6" height="44" rx="1" transform="rotate(-90 3.99988 47.9999)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5557 26.1928L25.0182 29.6667L31.3335 22.3333" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="17" y="13" width="4" height="4" rx="0.5" transform="rotate(90 17 13)" fill={ACCENT} />
      <rect x="39" y="13" width="4" height="4" rx="0.5" transform="rotate(90 39 13)" fill={ACCENT} />
      <rect x="17" y="35" width="4" height="4" rx="0.5" transform="rotate(90 17 35)" fill={ACCENT} />
      <rect x="39" y="35" width="4" height="4" rx="0.5" transform="rotate(90 39 35)" fill={ACCENT} />
    </svg>
  );
}

type IlloImageProps = {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
};

export function IlloImage({ src, alt, width, height, className }: IlloImageProps) {
  switch (src) {
    case '/vibenet-illo.svg':
      return <VibenetIllo width={width} height={height} className={className} />;
    case '/account-illo.svg':
      return <AccountIllo width={width} height={height} className={className} />;
    case '/token-illo.svg':
      return <TokenIllo width={width} height={height} className={className} />;
    case '/validity-illo.svg':
      return <ValidityIllo width={width} height={height} className={className} />;
    default:
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[IlloImage] "${src}" has no inline SVG component — dark mode theming will not apply.`);
      }
      return <Image src={src} alt={alt ?? ''} width={width} height={height} className={className} />;
  }
}
