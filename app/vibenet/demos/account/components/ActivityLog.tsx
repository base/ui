import Link from 'next/link';

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { ACTIVITY_ICON, type ActivityEntry, formatTime } from '../library/model';
import { short } from '../shared';

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// Session activity log — entries pushed as accounts are created and
// transactions are signed/broadcast. Newest first. The source captured this
// data but never surfaced it; here it gives the demo a running audit trail.
export function ActivityLog({ activity }: { activity: ActivityEntry[] }) {
  if (activity.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <Text variant="title3">Activity</Text>
      <Card className="flex flex-col divide-y divide-bds-gray-10 overflow-hidden bg-white dark:divide-white/10 dark:bg-white/5">
        {activity.map((e) => {
          const txHash = e.txHash && TX_HASH_RE.test(e.txHash) ? e.txHash : null;
          return (
            <div key={e.id} className="flex gap-3 p-4">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bds-gray-10 text-[13px] text-bds-gray-70 dark:bg-white/10 dark:text-bds-gray-20"
              >
                {ACTIVITY_ICON[e.kind]}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium">{e.title}</span>
                  <span className="font-mono text-[11px] text-bds-gray-50">{formatTime(e.ts)}</span>
                </div>
                {e.detail ? (
                  <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
                    {e.detail}
                  </span>
                ) : null}
                {e.changes && e.changes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {e.changes.map((c, i) => (
                      <span
                        key={`${e.id}-${i}`}
                        className="rounded border border-bds-gray-10 px-1.5 py-0.5 text-[11px] text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                  {typeof e.calls === 'number' ? (
                    <span>
                      {e.calls} call{e.calls === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  {e.network ? <span>{e.network}</span> : null}
                  {txHash ? (
                    <Link
                      href={`${VIBENET_EXPLORER_PATH}/tx/${txHash}`}
                      className="font-mono text-base-blue hover:underline dark:text-bds-blue-20"
                    >
                      {short(txHash, 10, 8)} →
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}
