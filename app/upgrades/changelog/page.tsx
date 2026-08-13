import type { Metadata } from 'next';

import { ChangelogClient } from './ChangelogClient';

export const metadata: Metadata = {
  title: 'Changelog · Base Upgrades',
  description: 'Search and filter Base protocol changes across upgrades and Vibenet testing.',
  alternates: {
    canonical: '/upgrades/changelog',
  },
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-4 text-foreground">
      <ChangelogClient />
    </div>
  );
}
