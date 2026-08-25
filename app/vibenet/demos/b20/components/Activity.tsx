import Link from 'next/link';

import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { shortAddress } from '../lib/protocol';
import type { ActivityItem } from '../lib/types';

// Session-local log of decoded B20 events and errors. Rows only — the shared
// ActivityDrawer supplies the surrounding collapsible panel + header.
export function ActivityRows({ rows }: { rows: ActivityItem[] }) {
  if (!rows.length) return null;
  return (
    <div className="divide-y divide-bds-gray-10 dark:divide-white/10">
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
            <Text as="span" variant="footnote" tone="muted" className="max-w-[65%] truncate">
              {row.detail ?? 'Pending…'}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}
