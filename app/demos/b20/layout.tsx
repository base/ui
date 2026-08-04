import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { MaintenanceBanner } from '../../vibenet/components/MaintenanceBanner';

// Title convention: a page inside a section is "{Page} · {Section}".
export const metadata: Metadata = {
  title: 'Native Token Issuance · Demos',
  description: 'Inspect, configure, and issue Base-native B20 tokens on Vibenet.',
};

// This demo runs on Vibenet, so it carries Vibenet's maintenance notice — the
// demo is unusable while the devnet is down. It used to inherit this from
// app/vibenet/layout.tsx; that stopped applying when demos moved to /demos, so
// the demo now owns it, matching app/demos/account/layout.tsx.
export default function B20DemoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MaintenanceBanner />
      {children}
    </>
  );
}
