import type { ReactNode } from 'react';

import { MaintenanceBanner } from './components/MaintenanceBanner';

type VibenetLayoutProps = {
  children: ReactNode;
};

// Scopes the chain-health maintenance banner to every /vibenet/* route (mirrors
// vibenet's own (vibenet) route-group layout). Nests inside the root AppShell,
// so the banner sits at the top of the vibenet content area only.
export default function VibenetLayout({ children }: VibenetLayoutProps) {
  return (
    <>
      <MaintenanceBanner />
      {children}
    </>
  );
}
