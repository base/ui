import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The transaction page is a client component, so this layout derives per-tx
// metadata from the route param.
type LayoutProps = {
  children: ReactNode;
  params: Promise<{ hash: string }>;
};

function short(value: string): string {
  return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export async function generateMetadata(props: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const { hash } = await props.params;
  return {
    title: `Transaction ${short(hash)} · Vibenet Explorer`,
    description: `Execution details, logs, and calls for transaction ${hash} on the Vibenet devnet.`,
  };
}

export default function TxLayout({ children }: LayoutProps) {
  return children;
}
