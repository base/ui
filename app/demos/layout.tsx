import type { ReactNode } from 'react';

// Metadata lives on the routes themselves: app/demos/page.tsx for the index and
// app/demos/account/layout.tsx for the demo.

type DemosLayoutProps = {
  children: ReactNode;
};

// Section chrome only. Demos run on whichever test network carries the feature
// they show, so nothing network-specific belongs here — a demo that depends on
// a particular network owns that concern (see app/demos/account/layout.tsx,
// which carries Vibenet's maintenance notice).
export default function DemosLayout({ children }: DemosLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">{children}</div>
  );
}
