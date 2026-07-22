import type { ReactNode } from 'react';

import { ExplorerSearch } from '../components/ExplorerSearch';

type ExplorerLayoutProps = {
  children: ReactNode;
};

export default function ExplorerLayout({ children }: ExplorerLayoutProps) {
  return (
    <div className="flex flex-col gap-8 text-black dark:text-white">
      <ExplorerSearch />
      {children}
    </div>
  );
}
