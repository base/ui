'use client';

import dynamic from 'next/dynamic';

import { Text } from '../../../components/ui/Text';

// The account demo bundles the ~781KB `@aa` client library and depends on
// browser-only APIs (crypto, localStorage, WebAuthn). It is dynamically
// imported with SSR disabled so `@aa` stays out of every other route's bundle
// and never runs on the server.
const AccountDemo = dynamic(() => import('./AccountDemo').then((m) => m.AccountDemo), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Text variant="label.regular" tone="muted">
        Loading account demo…
      </Text>
    </div>
  ),
});

export default function AccountDemoPage() {
  return <AccountDemo />;
}
