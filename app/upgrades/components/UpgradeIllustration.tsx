type UpgradeIllustrationProps = {
  upgradeId: string;
};

export function UpgradeIllustration({ upgradeId }: UpgradeIllustrationProps) {
  switch (upgradeId) {
    case 'azul':
      return (
        <svg viewBox="0 0 160 160" fill="none" className="h-full w-full" aria-hidden="true">
          <circle cx="80" cy="80" r="60" fill="var(--bds-blue-5)" />
          <circle cx="80" cy="80" r="40" fill="var(--bds-blue-10)" />
          <circle cx="80" cy="80" r="22" fill="var(--bds-blue-20)" />
          <path d="M80 30L80 130" stroke="var(--bds-blue-15)" strokeWidth="1.5" />
          <path d="M30 80L130 80" stroke="var(--bds-blue-15)" strokeWidth="1.5" />
          <path d="M44 44L116 116" stroke="var(--bds-blue-10)" strokeWidth="1" />
          <path d="M116 44L44 116" stroke="var(--bds-blue-10)" strokeWidth="1" />
        </svg>
      );

    case 'beryl':
      return (
        <svg viewBox="0 0 160 160" fill="none" className="h-full w-full" aria-hidden="true">
          <rect x="30" y="30" width="100" height="100" rx="20" fill="var(--bds-green-5)" />
          <rect x="50" y="50" width="60" height="60" rx="12" fill="var(--bds-green-10)" />
          <rect x="66" y="66" width="28" height="28" rx="6" fill="var(--bds-green-20)" />
          <circle cx="50" cy="50" r="4" fill="var(--bds-green-15)" />
          <circle cx="110" cy="50" r="4" fill="var(--bds-green-15)" />
          <circle cx="50" cy="110" r="4" fill="var(--bds-green-15)" />
          <circle cx="110" cy="110" r="4" fill="var(--bds-green-15)" />
        </svg>
      );

    case 'cobalt':
      return (
        <svg viewBox="0 0 160 160" fill="none" className="h-full w-full" aria-hidden="true">
          <polygon points="80,25 135,57.5 135,102.5 80,135 25,102.5 25,57.5" fill="var(--bds-purple-5)" />
          <polygon points="80,45 115,65 115,95 80,115 45,95 45,65" fill="var(--bds-purple-10)" />
          <polygon points="80,62 97,72 97,88 80,98 63,88 63,72" fill="var(--bds-purple-20)" />
          <line x1="80" y1="25" x2="80" y2="135" stroke="var(--bds-purple-10)" strokeWidth="1" />
          <line x1="25" y1="80" x2="135" y2="80" stroke="var(--bds-purple-10)" strokeWidth="1" />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 160 160" fill="none" className="h-full w-full" aria-hidden="true">
          <circle cx="80" cy="80" r="50" fill="var(--bds-gray-5)" />
          <circle cx="80" cy="80" r="30" fill="var(--bds-gray-10)" />
        </svg>
      );
  }
}
