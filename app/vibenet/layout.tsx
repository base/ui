import type { ReactNode } from 'react';

import { MaintenanceBanner } from './components/MaintenanceBanner';

type VibenetLayoutProps = {
  children: ReactNode;
};

export default function VibenetLayout({ children }: VibenetLayoutProps) {
  return (
    <div className="flex w-full flex-1 flex-col">
      <MaintenanceBanner />
      <div className="mx-auto w-full max-w-5xl flex-1">
        {children}
      </div>
    </div>
  );
}
