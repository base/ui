import Link from 'next/link';

import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import { deriveBinding, type Ceiling, type CeilingInput } from '../snapshot.mjs';
import { Info } from './Info';
import { Tag } from './Tag';

const AREAS: [Ceiling['area'], string][] = [['da', 'DA'], ['execution', 'Execution'], ['state', 'State'], ['networking', 'Networking']];

function input({ name, value, unit, status, asOf }: CeilingInput): string {
  const shown = value === null ? status : `${value} ${unit}`.trim();
  return [name, shown, value === null ? null : status, asOf && new Date(asOf).toISOString().slice(0, 10)].filter(Boolean).join(' · ');
}

export function CeilingCards({ ceilings }: { ceilings: Ceiling[] }) {
  const binding = deriveBinding(ceilings);
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Ceilings by bottleneck <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {AREAS.map(([area, name]) => {
          const c = ceilings.find((x) => x.area === area)!;
          return (
            <Card key={area} className="flex flex-col gap-2 bg-background p-4 text-[13px] dark:bg-white/5">
              <span className="flex items-center gap-1">
                <Link className="underline" href={`/scaling/${area}`}><Text as="span" variant="label">{name}</Text></Link>
                <Info label={`About the ${name} ceiling`}>{c.help}</Info>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[20px]">{c.value === null ? '—' : c.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                <Tag tag={c.tag} />
                {c === binding ? <span className="rounded-md bg-base-blue px-2 py-0.5 text-[12px] text-white">Binding</span> : null}
              </span>
              <code className="break-words font-mono text-[12px] text-bds-gray-60">{c.formula}</code>
              {c.reason ? <p className="text-bds-gray-60">{c.reason}</p> : null}
              <ul className="flex flex-col gap-0.5 text-[12px] text-bds-gray-60 empty:hidden">
                {c.inputs.map((i) => <li key={i.name}>{input(i)}</li>)}
              </ul>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
