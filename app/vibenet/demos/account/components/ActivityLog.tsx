import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { type ActivityEntry, type StoredAccount, formatTime } from '../library/model';
import { short } from '../shared';
import { AccountIdentity, Badge } from '../../_shared/primitives';
import { ViewTransactionButton } from '../../_shared/ViewTransactionButton';

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export function ActivityLog({ activity, accounts }: { activity: ActivityEntry[]; accounts: StoredAccount[] }) {
  const reducedMotion = useReducedMotion();
  const knownIds = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (knownIds.current === null) {
      knownIds.current = new Set(activity.map((e) => e.id));
      return;
    }
    const fresh = new Set<string>();
    for (const e of activity) {
      if (!knownIds.current.has(e.id)) {
        fresh.add(e.id);
        knownIds.current.add(e.id);
      }
    }
    if (fresh.size > 0) {
      setNewIds((prev) => new Set([...prev, ...fresh]));
      const t = setTimeout(() => setNewIds((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      }), 700);
      return () => clearTimeout(t);
    }
  }, [activity]);

  if (activity.length === 0) return null;
  return (
    <section>
      {/* Desktop table */}
      <table className="hidden w-full text-left text-sm sm:table">
        <thead className="border-b border-bds-gray-10 text-bds-gray-50 dark:border-white/10">
          <tr>
            <th scope="col" className="px-4 py-3 text-[13px] font-normal">Event</th>
            <th scope="col" className="px-4 py-3 text-[13px] font-normal">Account</th>
            <th scope="col" className="px-4 py-3 text-[13px] font-normal">Detail</th>
            <th scope="col" className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {activity.map((e, i) => {
            const txHash = e.txHash && TX_HASH_RE.test(e.txHash) ? e.txHash : null;
            const acct = e.account
              ? accounts.find((a) => a.address.toLowerCase() === e.account!.toLowerCase())
              : undefined;
            return (
              <motion.tr
                key={e.id}
                initial={{ opacity: 0, transform: reducedMotion ? undefined : 'translateY(4px)' }}
                animate={{ opacity: 1, transform: reducedMotion ? undefined : 'translateY(0px)' }}
                transition={{
                  duration: reducedMotion ? 0.15 : 0.2,
                  ease: [0.23, 1, 0.32, 1],
                  delay: reducedMotion ? 0 : Math.min(i * 0.03, 0.24),
                }}
                className={cn(
                  'border-b border-bds-gray-10 transition-colors duration-700 hover:bg-bds-gray-5/50 dark:border-white/10 dark:hover:bg-white/5',
                  newIds.has(e.id) && 'bg-bds-blue-0',
                )}
              >
                <td className="px-4 py-3.5">
                  <div className="flex flex-col gap-0.5">
                    <Text variant="label">{e.title}</Text>
                    <Text variant="footnote" tone="muted">{formatTime(e.ts)}</Text>
                  </div>
                </td>
                <td className="px-4 py-3.5 align-top">
                  {e.account ? (
                    <Link
                      href={`${VIBENET_EXPLORER_PATH}/address/${e.account}`}
                      className="no-underline transition-colors hover:opacity-80"
                    >
                      <AccountIdentity label={acct?.label} address={e.account} variant={acct?.parentId ? 'spending' : 'default'} hideAvatar />
                    </Link>
                  ) : null}
                </td>
                <td className="px-4 py-3.5 align-top">
                  <div className="flex flex-col gap-1.5">
                    {e.detail ? (
                      <Text variant="label.regular" tone="muted">{e.detail}</Text>
                    ) : null}
                    {typeof e.calls === 'number' ? (
                      <Text variant="label.regular" tone="muted">{e.calls} call{e.calls === 1 ? '' : 's'}</Text>
                    ) : null}
                    {e.changes && e.changes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {e.changes.map((c, ci) => (
                          <Badge key={`${e.id}-${ci}`}>{c}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3.5 align-top text-right">
                  {txHash ? (
                    <ViewTransactionButton href={`${VIBENET_EXPLORER_PATH}/tx/${txHash}`} />
                  ) : null}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile stacked */}
      <div className="flex flex-col sm:hidden">
        {activity.map((e, i) => {
          const txHash = e.txHash && TX_HASH_RE.test(e.txHash) ? e.txHash : null;
          const acct = e.account
            ? accounts.find((a) => a.address.toLowerCase() === e.account!.toLowerCase())
            : undefined;
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, transform: reducedMotion ? undefined : 'translateY(4px)' }}
              animate={{ opacity: 1, transform: reducedMotion ? undefined : 'translateY(0px)' }}
              transition={{
                duration: reducedMotion ? 0.15 : 0.2,
                ease: [0.23, 1, 0.32, 1],
                delay: reducedMotion ? 0 : Math.min(i * 0.03, 0.24),
              }}
              className={cn(
                'flex flex-col gap-2.5 border-b border-bds-gray-10 px-4 py-3.5 transition-colors duration-700 dark:border-white/10',
                newIds.has(e.id) && 'bg-bds-blue-0',
              )}
            >
              <div className="flex flex-col gap-0.5">
                <Text variant="label">{e.title}</Text>
                <Text variant="footnote" tone="muted">{formatTime(e.ts)}</Text>
              </div>

              {e.account ? (
                <Link
                  href={`${VIBENET_EXPLORER_PATH}/address/${e.account}`}
                  className="no-underline"
                >
                  <AccountIdentity label={acct?.label} address={e.account} variant={acct?.parentId ? 'spending' : 'default'} hideAvatar />
                </Link>
              ) : null}

              {e.detail ? (
                <Text variant="label.regular" tone="muted">{e.detail}</Text>
              ) : null}

              {typeof e.calls === 'number' ? (
                <Text variant="label.regular" tone="muted">{e.calls} call{e.calls === 1 ? '' : 's'}</Text>
              ) : null}

              {e.changes && e.changes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {e.changes.map((c, ci) => (
                    <Badge key={`${e.id}-${ci}`}>{c}</Badge>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                {txHash ? (
                  <ViewTransactionButton href={`${VIBENET_EXPLORER_PATH}/tx/${txHash}`} />
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
