import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The account demo page is a client component; this passthrough layout carries
// its title/description.
//
// Title convention: a section root is "{Section} · Base Chain" and a page within
// a section is "{Page} · {Section}" — e.g. "Faucet · Vibenet". Spelled out in
// full rather than composed from a parent title.template, because the llms/agents
// generator resolves a template to its `default` and would publish the bare page
// title, disagreeing with what the browser renders.
export const metadata: Metadata = {
  title: 'Native Account Abstraction · Vibenet',
  description:
    'Create native account abstraction accounts from in-browser keys, fund them from the faucet, and inspect balances on Vibenet.',
};

// Passthrough. The demo runs on Vibenet and lives under /vibenet/demos, so it
// inherits Vibenet's maintenance notice from app/vibenet/layout.tsx.
export default function AccountDemoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
