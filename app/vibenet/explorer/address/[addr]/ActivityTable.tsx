'use client';

// Shared on-chain activity table for an address, used by both the public
// inspector and the owned management view's Activity tab.

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { ExplorerLink } from '../../../components/ExplorerLink';
import type { ActivityRow } from '../../../library/api-types';
import { roleLabel } from '../../../library/explorer';

const TH = 'px-4 py-3 text-left text-[13px] font-normal text-bds-gray-50';
const TD = 'px-4 py-3 text-[13px]';

export function ActivityTable({ activity }: { activity: ActivityRow[] }) {
  if (activity.length === 0) {
    return (
      <Card className="bg-background p-4 dark:bg-white/[0.03]">
        <Text variant="label.regular" tone="muted">
          No activity indexed yet.
        </Text>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden bg-background dark:bg-white/[0.03]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr aria-label="Column headers" className="border-b border-bds-gray-10 dark:border-white/10">
              <th className={TH}>Block</th>
              <th className={TH}>Tx</th>
              <th className={TH}>Role</th>
              <th className={TH}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((row) => (
              <tr
                key={`${row.tx_hash}-${row.role}-${row.log_index}`}
                aria-label={`Activity ${row.tx_hash}`}
                className="border-b border-bds-gray-10 last:border-0 dark:border-white/10"
              >
                <td className={TD}>
                  <ExplorerLink kind="block" value={String(row.block_num)} label={row.block_num.toLocaleString()} />
                </td>
                <td className={TD}>
                  <ExplorerLink kind="tx" value={row.tx_hash} />
                </td>
                <td className={TD}>{roleLabel(row.role)}</td>
                <td className={TD}>
                  {row.token ? (
                    <span>
                      via <ExplorerLink kind="address" value={row.token} />
                    </span>
                  ) : (
                    <span className="text-bds-gray-60 dark:text-bds-gray-40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
