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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-4 text-black">
      <SectionHeading
        title="Activation Calendar"
        description="Review Sepolia and Mainnet activation dates in one calendar."
        className="max-w-2xl"
      />
      <ScheduleClient />
    </div>
  );
}
