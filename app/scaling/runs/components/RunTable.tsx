import Link from 'next/link';

import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { Info } from '../../components/Info';
import { Tag } from '../../components/Tag';
import { formatValue } from '../lib/formatters';
import type { RunStatus } from '../lib/types';
import type { UnifiedRun } from '../lib/unified';

const TH = 'px-3 py-2 text-left text-[12px] font-[500] text-bds-gray-60';
const TD = 'px-3 py-2 align-top';
const DOT: Record<RunStatus, string> = { success: 'bg-bds-green-50', warning: 'bg-bds-yellow-50', error: 'bg-bds-red-50', fatal: 'bg-bds-red-50', incomplete: 'bg-bds-gray-30' };

export function RunTable({ weeks }: { weeks: Map<string, UnifiedRun[]> }) {
  return (
    <Card className="overflow-x-auto bg-background dark:bg-white/5">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-bds-gray-10 dark:border-white/10">
            {['When', 'Kind', 'Env', 'Profile', 'Workload', 'Mgas/s', 'Latency', 'Status', 'Duration', 'Machine'].map((h) => <th key={h} className={TH}>{h}</th>)}
          </tr>
        </thead>
        {[...weeks].map(([week, rows]) => (
          <tbody key={week}>
            <tr className="bg-bds-gray-5 dark:bg-white/5"><th colSpan={10} className={TH}>Week of {week}</th></tr>
            {rows.map((r) => <Row key={r.href} run={r} />)}
          </tbody>
        ))}
      </table>
    </Card>
  );
}

function Row({ run: r }: { run: UnifiedRun }) {
  return (
    <tr className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
      <td className={cn(TD, 'whitespace-nowrap font-mono')}><Link className="underline" href={r.href}>{new Date(r.timestamp).toISOString().slice(0, 16).replace('T', ' ')}</Link></td>
      <td className={TD}><Tag tag={r.kind} /></td>
      <td className={TD}>{r.env}</td>
      <td className={TD}><span className="flex items-center gap-1">{r.profile ? <Tag tag={r.profile} /> : '—'}<Info label="Why this run does not qualify">{r.qualifies.reason}</Info></span></td>
      <td className={TD}>{r.workload}</td>
      <td className={cn(TD, 'font-mono')}>{r.gasPerSecond === null ? '—' : (r.gasPerSecond / 1e6).toFixed(1)}</td>
      <td className={cn(TD, 'whitespace-nowrap font-mono')}>
        {r.latency.length ? r.latency.map((l) => <div key={l.label}>{l.label} {formatValue(l.seconds, 's')}</div>) : '—'}
      </td>
      <td className={cn(TD, 'whitespace-nowrap')}>
        <span className="flex items-center gap-2"><span aria-hidden="true" className={cn('h-2 w-2 rounded-full', r.status ? DOT[r.status] : 'bg-bds-gray-30')} />{r.status ?? 'unknown'}</span>
      </td>
      <td className={cn(TD, 'font-mono')}>{r.duration === null ? '—' : formatValue(r.duration, 's')}</td>
      <td className={TD}>{r.machine ?? '—'}</td>
    </tr>
  );
}
