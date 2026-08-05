const ILLO_MAP: Record<string, string> = {
  azul: '/azul-illo.svg',
  beryl: '/beryl-illo.svg',
  cobalt: '/cobalt-illo.svg',
  denim: '/denim-illo.svg',
};

type UpgradeIllustrationProps = {
  upgradeId: string;
};

export function UpgradeIllustration({ upgradeId }: UpgradeIllustrationProps) {
  const src = ILLO_MAP[upgradeId];
  if (!src) {
    return (
      <svg viewBox="0 0 160 160" fill="none" className="h-full w-full" aria-hidden="true">
        <circle cx="80" cy="80" r="50" fill="var(--bds-gray-5)" />
        <circle cx="80" cy="80" r="30" fill="var(--bds-gray-10)" />
      </svg>
    );
  }
  return <img src={src} alt="" className="h-full w-full" aria-hidden="true" />;
}
