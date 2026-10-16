import Link from 'next/link';

import { cn } from '../../components/ui/cn';
import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import type { Guardrail } from '../snapshot.mjs';
import { Info } from './Info';
import { Tag } from './Tag';

const TH = 'px-4 py-2 text-left text-[12px] font-[500] text-bds-gray-60';
const TD = 'px-4 py-3 align-top';
const DOT: Record<Guardrail['status'], string> = { ok: 'bg-bds-green-50', breached: 'bg-bds-red-50', unknown: 'bg-bds-gray-30' };
const STATUS: Record<Guardrail['status'], string> = { ok: 'OK', breached: 'Breached', unknown: 'Unknown' };

const fmt = (n: number, unit: string) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`.trim();

export function Guardrails({ guardrails, detailed = false }: { guardrails: Guardrail[]; detailed?: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      {detailed ? null : <Text as="h2" variant="headline"><Link className="underline" href="/scaling/guardrails">Guardrails →</Link></Text>}
      <Card className="overflow-x-auto bg-background dark:bg-white/5">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-bds-gray-10 dark:border-white/10">
              <th className={TH}>Guardrail</th>
              <th className={TH}>Value</th>
              <th className={TH}>Threshold</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {guardrails.map((g) => (
              <tr key={g.id} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                <td className={TD}>
                  {detailed ? <>{g.label}<p className="text-bds-gray-60">{g.help}</p></> : (
                    <span className="flex items-center gap-1">{g.label} <Info label={`About ${g.label}`}>{g.help}</Info></span>
                  )}
                </td>
                <td className={cn(TD, 'whitespace-nowrap font-mono')}>{g.value === null ? '—' : fmt(g.value, g.unit)}</td>
                <td className={TD}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="whitespace-nowrap font-mono">{g.threshold === null ? '—' : `${g.comparator === '<=' ? '≤' : '≥'} ${fmt(g.threshold, g.unit)}`}</span>
                    {g.thresholdTag === 'set' ? null : <Tag tag={g.thresholdTag} />}
                    {g.owner ? <span className="text-bds-gray-60">{g.owner}</span> : null}
                  </span>
                </td>
                <td className={cn(TD, 'whitespace-nowrap')}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', DOT[g.status])} />
                    {STATUS[g.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Text variant="footnote" tone="muted">Breached SLOs are not attributed to saturation until triaged.</Text>
    </section>
  );
}
