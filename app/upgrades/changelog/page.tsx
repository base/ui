import type { Metadata } from 'next';

import { SectionHeading } from '../../components/ui/SectionHeading';

import { ChangelogClient } from './ChangelogClient';

export const metadata: Metadata = {
  title: 'Changelog | Base Upgrades',
  description: 'Search and filter Base protocol changes across upgrades and Vibenet testing.',
  alternates: {
    canonical: '/upgrades/changelog',
  },
};

export default function ChangelogPage() {
  return (
    <div className="flex flex-col gap-8 pb-4 text-black">
      <SectionHeading
        eyebrow="Changelog"
        title="Protocol Changes"
        description="Search adopted EIPs and Base-specific protocol changes. Filter by type, category, upgrade, or lifecycle."
        className="max-w-2xl"
      />
      <ChangelogClient />
    </div>
  );
}
