import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { Text } from '../../../components/ui/Text';

export const TD = 'px-3 py-2 align-top';
const TH = 'px-3 py-2 text-left text-[12px] font-[500] text-bds-gray-60';
const DOT: Record<string, string> = { success: 'bg-bds-green-50', warning: 'bg-bds-yellow-50', error: 'bg-bds-red-50', fatal: 'bg-bds-red-50' };

export function Crumbs({ here }: { here: string }) {
  return (
    <Text variant="label.regular" tone="muted">
      <Link className="underline" href="/scaling">Scaling</Link> / <Link className="underline" href="/scaling/runs">Runs</Link> / {here}
    </Text>
  );
}

export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><Text as="h2" variant="headline">{title}</Text>{action}</div>
      {children}
    </section>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Card className="overflow-x-auto bg-background dark:bg-white/5">
      <table className="w-full border-collapse text-[13px]">
        <thead><tr className="border-b border-bds-gray-10 dark:border-white/10">{head.map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

export function Status({ status }: { status: string }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap"><span aria-hidden="true" className={cn('h-2 w-2 rounded-full', DOT[status] ?? 'bg-bds-gray-30')} />{status}</span>
  );
}
