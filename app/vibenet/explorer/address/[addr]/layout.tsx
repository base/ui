import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The address page is a client component, so this layout derives per-address
// metadata from the route param.
type LayoutProps = {
  children: ReactNode;
  params: Promise<{ addr: string }>;
};

function short(value: string): string {
  return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export async function generateMetadata(props: {
  params: Promise<{ addr: string }>;
}): Promise<Metadata> {
  const { addr } = await props.params;
  return {
    title: `Address ${short(addr)} · Vibenet Explorer`,
    description: `Balances, roles, and transactions for ${addr} on the Vibenet devnet.`,
  };
}

export default function AddressLayout({ children }: LayoutProps) {
  return children;
}
