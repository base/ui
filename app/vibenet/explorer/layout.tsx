import type { ReactNode } from 'react';

type ExplorerLayoutProps = {
  children: ReactNode;
};

export default function ExplorerLayout({ children }: ExplorerLayoutProps) {
  return (
    <div className="flex flex-col gap-8 text-black dark:text-white">
      {children}
    </div>
  );
}
