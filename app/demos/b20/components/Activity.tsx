import Link from 'next/link';

import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../vibenet/library/config';
import { shortAddress } from '../lib/protocol';
import type { ActivityItem } from '../lib/types';

// Session-local log of decoded B20 events and errors, shown beneath every module.
export function Activity({ rows }: { rows: ActivityItem[] }) {
  return (
    <Card className="bg-white p-4 dark:bg-white/5">
      <div className="flex items-center justify-between">
        <div>
          <Text variant="headline">Recent activity</Text>
          <Text variant="footnote" tone="muted">
            See what this demo did during your current visit.
          </Text>
        </div>
        <span className="text-[12px] text-bds-gray-50">
          {rows.length ? `${rows.length} activity item${rows.length === 1 ? '' : 's'}` : '● Nothing has happened yet'}
        </span>
      </div>
      {rows.length ? (
        <div className="mt-3 divide-y divide-bds-gray-10 border-t border-bds-gray-10 dark:divide-white/10 dark:border-white/10">
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-[12px]"
            >
              <span
                className={
                  row.state === 'success'
                    ? 'text-bds-green-60'
                    : row.state === 'error'
                      ? 'text-bds-red-60'
                      : 'text-bds-orange-60'
                }
              >
                {row.state === 'success' ? '✓' : row.state === 'error' ? '×' : '◌'} {row.label}
              </span>
              {row.hash ? (
                <Link
                  href={`${VIBENET_EXPLORER_PATH}/tx/${row.hash}`}
                  className="font-mono text-base-blue hover:underline"
                >
                  {shortAddress(row.hash)} ↗
                </Link>
              ) : (
                <span className="max-w-[65%] truncate text-bds-gray-50">{row.detail ?? 'Pending…'}</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
