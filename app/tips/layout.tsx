import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Metadata for the TIPS section. The app-wide chrome (sidebar, header) comes
// from AppShell; this layout just constrains the content column, matching the
// Vibenet section's treatment.
export const metadata: Metadata = {
  title: 'TIPS · Base Chain',
  description:
    'Inspect TIPS blocks, bundles, transactions, and rejected transactions across Base chains.',
};

export default function TipsLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">{children}</div>;
}
