import type { ReactNode } from 'react';

import { ExplorerSearch } from '../components/ExplorerSearch';

type ExplorerLayoutProps = {
  children: ReactNode;
};

// Scopes the explorer search bar to every /vibenet/explorer route (the section
// tabs live in the app top bar; this is the explorer-specific sub-header).
export default function ExplorerLayout({ children }: ExplorerLayoutProps) {
  return (
    <div className="flex flex-col gap-8 text-black dark:text-white">
      <ExplorerSearch />
      {children}
    </div>
  );
}
