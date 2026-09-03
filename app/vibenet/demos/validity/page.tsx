import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { FeatureCard } from '../../components/FeatureCard';
import type { VibenetFeature } from '../../library/types';
import { FeatureGridCard } from '../_shared/FeatureGridCard';
import { demoForPath } from '../catalogue';

const VALIDITY_PATH = '/vibenet/demos/validity';

const VALIDITY_FEATURE: VibenetFeature = {
  id: 'validity-transactions',
  tag: 'EIP-8130',
  title: 'Validity Transactions',
  summary:
    'Submit transactions with onchain conditions, then let the sequencer include them only while those conditions are valid.',
  status: 'live',
  availability: 'Coming soon in ',
  availabilityLabel: 'Base Cobalt',
  availabilityHref: {
    label: 'Base Cobalt',
    href: 'https://docs.base.org/base-chain/specs/upgrades/cobalt/overview',
    external: true,
  },
  highlights: [
    {
      title: 'State-Aware Inclusion',
      detail: 'The sequencer evaluates current onchain state immediately before including a transaction.',
    },
    {
      title: 'Submit Before It Is Valid',
      detail: 'Sign and submit intent now, then let it wait until its execution conditions are satisfied.',
    },
    {
      title: 'Storage Conditions',
      detail: 'Require contract storage values to match ranges or expected values at inclusion time.',
    },
    {
      title: 'Block Bounds & Expiry',
      detail: 'Constrain execution to explicit block windows so stale transactions expire safely.',
    },
    {
      title: 'Concurrent Intents',
      detail: 'Nonce-isolated transactions can wait independently without blocking other account activity.',
    },
    {
      title: 'No Keeper Required',
      detail: 'Build intent-like flows from ordinary account transactions without a separate settlement contract.',
    },
  ],
};

export default function ValidityTransactionsPage() {
  const validity = demoForPath(VALIDITY_PATH);
  if (!validity) return null;

  return (
    <div className="animate-in flex min-w-0 flex-1 flex-col gap-10 pb-16 text-foreground">
      <FeatureCard feature={VALIDITY_FEATURE} />

      <Text variant="headline" className="mt-5 -mb-5">
        Demos
      </Text>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {validity.children?.map((demo) => (
          <FeatureGridCard
            key={demo.href}
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 5.5V10L13 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 10H1.5M18.5 10H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            }
            title={demo.title}
            description={demo.summary}
          >
            <Button size="sm" href={demo.href}>
              Open Demo
            </Button>
          </FeatureGridCard>
        ))}
      </div>
    </div>
  );
}
