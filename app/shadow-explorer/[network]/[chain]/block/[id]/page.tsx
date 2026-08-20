import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Card } from '../../../../../components/ui/Card';
import { Text } from '../../../../../components/ui/Text';
import {
  ShadowBlockNotFoundError,
  fetchShadowBlockDetail,
  type ShadowBlockDetail,
} from '../../../../../api/shadow-explorer/block-detail';
import { resolveShadowChainUrl } from '../../../../../api/shadow-explorer/config';
import { ShadowNav } from '../../../../components/ShadowNav';
import { formatAge, formatInteger, shortHash } from '../../../../library/format';
import { shadowHref, tipsCanonicalBlockHref } from '../../../../library/links';
import { isShadowNetwork } from '../../../../networks';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-bds-gray-50 dark:text-bds-gray-40">
        {label}
      </span>
      <span className="break-all text-sm text-black dark:text-white">{children}</span>
    </div>
  );
}

export default async function ShadowBlockDetailPage({
  params,
}: {
  params: Promise<{ network: string; chain: string; id: string }>;
}) {
  const { network, chain, id } = await params;
  if (!isShadowNetwork(network)) notFound();

  const baseUrl = resolveShadowChainUrl(network, chain);
  if (!baseUrl) notFound();

  let detail: ShadowBlockDetail | null = null;
  let error: string | null = null;
  try {
    detail = await fetchShadowBlockDetail(baseUrl, id);
  } catch (err) {
    if (err instanceof ShadowBlockNotFoundError) notFound();
    error = 'Failed to load block';
  }

  // Shadow Explorer only owns reorged-out shadow candidates. Canonical blocks
  // belong to TIPS, so hand a canonical hit off to the TIPS block explorer.
  if (detail && !detail.reorgedOut) {
    redirect(tipsCanonicalBlockHref(network, detail.hash));
  }

  return (
    <div className="animate-in flex flex-col gap-6">
      <ShadowNav network={network} chain={chain} active="shadow-blocks" />

      <div className="flex items-center gap-3">
        <Link
          href={shadowHref(network, chain, '/shadow-blocks')}
          className="text-sm text-base-blue hover:underline dark:text-bds-blue-20"
        >
          ← Shadow Blocks
        </Link>
      </div>

      {error ? (
        <Card className="border-bds-red-30 bg-bds-red-0 p-4 dark:border-bds-red-60 dark:bg-bds-red-90/20">
          <Text variant="label.regular" className="text-bds-red-70 dark:text-bds-red-20">
            {error}
          </Text>
        </Card>
      ) : detail ? (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Text variant="title2">Block #{formatInteger(detail.number)}</Text>
              <span
                className={
                  detail.reorgedOut
                    ? 'inline-flex rounded-full bg-bds-red-0 px-2 py-0.5 text-xs font-medium text-bds-red-70 dark:bg-bds-red-90/20 dark:text-bds-red-20'
                    : 'inline-flex rounded-full bg-bds-gray-5 px-2 py-0.5 text-xs font-medium text-bds-gray-70 dark:bg-white/10 dark:text-bds-gray-20'
                }
              >
                {detail.reorgedOut ? 'Reorged-out shadow' : 'Canonical'}
              </span>
            </div>
            <Text variant="label.regular" tone="muted" className="mt-1 break-all font-mono">
              {detail.hash}
            </Text>
          </div>

          <Card className="grid grid-cols-1 gap-4 bg-white p-5 sm:grid-cols-2 dark:bg-white/5">
            <Field label="Age">{formatAge(detail.timestamp)}</Field>
            <Field label="Transactions">{formatInteger(detail.txCount)}</Field>
            <Field label="Gas used">{formatInteger(detail.gasUsed)}</Field>
            <Field label="Gas limit">{formatInteger(detail.gasLimit)}</Field>
            {detail.baseFeePerGas !== undefined ? (
              <Field label="Base fee (wei)">{formatInteger(detail.baseFeePerGas)}</Field>
            ) : null}
            <Field label="Parent hash">
              <span className="font-mono" title={detail.parentHash}>
                {shortHash(detail.parentHash)}
              </span>
            </Field>
            {detail.canonicalHash ? (
              <Field label="Canonical replacement">
                <Link
                  href={tipsCanonicalBlockHref(network, detail.canonicalHash)}
                  className="font-mono text-base-blue hover:underline dark:text-bds-blue-20"
                  title={`View canonical block in TIPS: ${detail.canonicalHash}`}
                >
                  {shortHash(detail.canonicalHash)} <span aria-hidden>↗</span>
                </Link>
              </Field>
            ) : null}
          </Card>

          <div className="flex flex-col gap-3">
            <Text variant="headline">Transactions</Text>
            <Card className="overflow-hidden bg-white dark:bg-white/5">
              {detail.transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-bds-gray-10 bg-bds-gray-5/60 dark:border-white/10 dark:bg-white/[0.03]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          Hash
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          From
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          To
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          Gas used
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bds-gray-10 dark:divide-white/10">
                      {detail.transactions.map((tx) => (
                        <tr key={tx.index} className="text-black dark:text-white">
                          <td className="px-4 py-3">{tx.index}</td>
                          <td className="px-4 py-3 font-mono text-xs" title={tx.hash}>
                            {shortHash(tx.hash)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs" title={tx.from ?? undefined}>
                            {tx.from ? shortHash(tx.from, 6, 4) : '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs" title={tx.to ?? undefined}>
                            {tx.to ? shortHash(tx.to, 6, 4) : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {tx.gasUsed !== undefined ? formatInteger(tx.gasUsed) : '—'}
                          </td>
                          <td className="px-4 py-3">{tx.txType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-bds-gray-60 dark:text-bds-gray-40">
                  No transactions in this block
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
