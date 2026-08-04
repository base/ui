import type { Metadata } from 'next';

import { Card, LinkCard } from '../components/ui/Card';
import { Text } from '../components/ui/Text';
import { Badge } from './account/components/primitives';

export const metadata: Metadata = {
  title: 'Demos · Base Chain',
  description:
    'Interactive demos of in-flight Base features. Each demo runs on the test network that carries the feature it shows.',
};

type DemoEntry = {
  href: string;
  eyebrow: string;
  title: string;
  summary: string;
  points: string[];
  available: boolean;
};

// Demo catalogue. The account demo is the first (and, for now, only live)
// entry; further demos are listed as upcoming so the surface reflects the
// roadmap — matching how the home/features surfaces handle staged work.
const DEMOS: DemoEntry[] = [
  {
    href: '/demos/account',
    eyebrow: 'EIP-8130',
    title: 'Native Account Abstraction',
    summary:
      'Create portable account-abstraction accounts from in-browser keys, fund them from the faucet, and inspect balances across networks.',
    points: [
      'Smart & EOA accounts — deterministic addresses',
      'K1 / P-256 / passkey signers',
      'Live balances on Vibenet + Base Sepolia',
    ],
    available: true,
  },
];

export default function DemosIndexPage() {
  return (
    <div className="animate-in flex flex-col gap-10 pb-4 text-black dark:text-white">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DEMOS.map((demo) =>
          demo.available ? (
            <LinkCard
              key={demo.href}
              href={demo.href}
              interactive={false}
              className="group flex flex-col gap-4 bg-white p-6 transition-colors hover:bg-bds-gray-5 dark:bg-white/5 dark:hover:bg-white/[0.08]"
            >
              <DemoCardBody demo={demo} />
            </LinkCard>
          ) : (
            <Card
              key={demo.href}
              className="flex flex-col gap-4 bg-white p-6 opacity-60 dark:bg-white/5"
            >
              <DemoCardBody demo={demo} />
            </Card>
          ),
        )}
      </div>
    </div>
  );
}

function DemoCardBody({ demo }: { demo: DemoEntry }) {
  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <Text variant="headline">{demo.title}</Text>
          <Badge>{demo.eyebrow}</Badge>
          {!demo.available ? (
            <span className="text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
              Coming soon
            </span>
          ) : null}
        </div>
        <Text variant="body" tone="muted" className="mt-2">
          {demo.summary}
        </Text>
      </div>
      <ul className="mt-auto flex flex-col gap-2 border-t border-bds-gray-10 pt-4 dark:border-white/10">
        {demo.points.map((point) => (
          <li key={point} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-bds-gray-30 dark:bg-bds-gray-50" aria-hidden="true" />
            <Text as="span" variant="label.regular" tone="muted">{point}</Text>
          </li>
        ))}
      </ul>
    </>
  );
}
