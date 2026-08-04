import type { ReactNode } from 'react';

import { MaintenanceBanner } from '../vibenet/components/MaintenanceBanner';

// Metadata lives on the routes themselves: app/demos/page.tsx for the index and
// app/demos/account/layout.tsx for the demo.

type DemosLayoutProps = {
  children: ReactNode;
};

// Demos run against Vibenet, so this section keeps Vibenet's maintenance notice
// — it previously inherited it from app/vibenet/layout.tsx, and a demo is
// unusable while the devnet is down. The content column matches that layout too.
export default function DemosLayout({ children }: DemosLayoutProps) {
  return (
    <div className="flex w-full flex-1 flex-col">
      <MaintenanceBanner />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
