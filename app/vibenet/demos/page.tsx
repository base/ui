import type { Metadata } from 'next';

import { Card, LinkCard } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import { DemoHeader } from './_components/DemoHeader';

export const metadata: Metadata = {
  title: 'Demos · Vibenet',
  description: 'Interactive demos of in-flight Base features running on the vibenet devnet.',
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
    href: '/vibenet/demos/account',
    eyebrow: 'EIP-8130',
    title: 'Account',
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
    <div className="flex flex-col gap-10 pb-4 text-black dark:text-white">
      <DemoHeader
        eyebrow="Base Vibenet"
        title="Demos"
        description="Hands-on demos of in-flight Base features, running against the vibenet devnet. Everything stays in your browser — testnet only."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DEMOS.map((demo) =>
          demo.available ? (
            <LinkCard
              key={demo.href}
              href={demo.href}
              className="group flex flex-col gap-4 bg-white p-6 dark:bg-white/5"
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
      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-full border border-bds-blue-15 bg-bds-blue-0 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.6px] text-bds-blue-60 dark:border-bds-blue-80 dark:bg-bds-blue-100/40 dark:text-bds-blue-20">
          {demo.eyebrow}
        </span>
        {!demo.available ? (
          <span className="text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
            Coming soon
          </span>
        ) : null}
      </div>
      <div>
        <Text variant="title3">{demo.title}</Text>
        <Text variant="body" tone="muted" className="mt-2">
          {demo.summary}
        </Text>
      </div>
      <ul className="mt-auto flex flex-col gap-1.5">
        {demo.points.map((point) => (
          <li
            key={point}
            className="flex items-start gap-2 text-[13px] text-bds-gray-60 dark:text-bds-gray-40"
          >
            <span className="mt-[3px] text-base-blue dark:text-bds-blue-20" aria-hidden="true">
              ›
            </span>
            {point}
          </li>
        ))}
      </ul>
    </>
  );
}
