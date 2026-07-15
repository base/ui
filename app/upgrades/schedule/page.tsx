import type { Metadata } from 'next';

import { SectionHeading } from '../../components/ui/SectionHeading';

import { ScheduleClient } from './ScheduleClient';

export const metadata: Metadata = {
  title: 'Schedule | Base Upgrades',
  description: 'Calendar view of Base upgrade activations across Sepolia and Mainnet.',
  alternates: {
    canonical: '/upgrades/schedule',
  },
};

export default function SchedulePage() {
  return (
    <div className="flex flex-col gap-8 pb-4 text-black">
      <SectionHeading
        eyebrow="Schedule"
        title="Activation Calendar"
        description="Review Sepolia and Mainnet activation dates in one calendar."
        className="max-w-2xl"
      />
      <ScheduleClient />
    </div>
  );
}
