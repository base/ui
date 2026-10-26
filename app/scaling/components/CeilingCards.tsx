import Link from 'next/link';

import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import type { UnifiedRun } from '../runs/lib/unified';
import { deriveBinding, type Ceiling, type CeilingInput } from '../snapshot.mjs';
import { DaWorkloadRows } from './DaWorkloads';
import { Info } from './Info';
import { RunBackedCeilingCard } from './RunBackedCeilingCard';
import { Tag } from './Tag';

export const AREAS: [Ceiling['area'], string][] = [['da', 'DA'], ['execution', 'Execution'], ['state', 'State'], ['networking', 'Networking']];

function input({ name, value, unit, status, asOf }: CeilingInput): string {
  const shown = value === null ? status : `${value} ${unit}`.trim();
  return [name, shown, value === null ? null : status, asOf && new Date(asOf).toISOString().slice(0, 10)].filter(Boolean).join(' · ');
}

export function CeilingCards({ ceilings }: { ceilings: Ceiling[] }) {
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Ceilings by bottleneck <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {AREAS.map(([area]) => <RunBackedCeilingCard key={area} area={area} ceilings={ceilings} />)}
      </div>
    </section>
  );
}

export function CeilingCard({ area, ceilings, run }: { area: Ceiling['area']; ceilings: Ceiling[]; run?: UnifiedRun }) {
  const name = AREAS.find(([a]) => a === area)![1];
  const c = ceilings.find((x) => x.area === area)!;
  return (
    <Card className="flex flex-col gap-2 bg-background p-4 text-[13px] dark:bg-white/5">
      <span className="flex items-center gap-1">
        <Link className="underline" href={`/scaling/${area}`}><Text as="span" variant="label">{name}</Text></Link>
        <Info label={`About the ${name} ceiling`}>{c.help}</Info>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[20px]">{c.value === null ? '—' : c.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        <Tag tag={c.tag} />
        {c === deriveBinding(ceilings) ? <span className="rounded-md bg-base-blue px-2 py-0.5 text-[12px] text-white">Binding</span> : null}
      </span>
      {area === 'da' ? (
        <>
          <p className="text-[12px] text-bds-gray-60">{c.reason}</p>
          <DaWorkloadRows />
        </>
      ) : (
        <>
          <code className="break-words font-mono text-[12px] text-bds-gray-60">{c.formula}</code>
          {c.reason ? <p className="text-bds-gray-60">{c.reason}</p> : null}
          {run ? <Link className="underline" href={run.href}>Bench run {new Date(run.timestamp).toISOString().slice(0, 10)} →</Link> : null}
          <ul className="flex flex-col gap-0.5 text-[12px] text-bds-gray-60 empty:hidden">
            {c.inputs.map((i) => <li key={i.name}>{input(i)}</li>)}
          </ul>
        </>
      )}
    </Card>
  );
}
