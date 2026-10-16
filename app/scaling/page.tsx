import Link from 'next/link';

import { Card } from '../components/ui/Card';
import { Text } from '../components/ui/Text';

import { CeilingCards } from './components/CeilingCards';
import { Guardrails } from './components/Guardrails';
import { Ladder } from './components/Ladder';
import { Progress } from './components/Progress';
import { formatTime, Header, loadSnapshot, Unavailable } from './loadSnapshot';
import type { Metric, Snapshot } from './snapshot.mjs';

// The snapshot is a runtime file, so render per request rather than at build.
export const dynamic = 'force-dynamic';

export default async function ScalingPage() {
  const loaded = await loadSnapshot();
  if (loaded.kind !== 'ok') return <Unavailable loaded={loaded} />;

  const { snapshot } = loaded;
  return (
    <div className="flex flex-col gap-10 pb-8">
      <Header loaded={loaded} title={`Scaling scorecard · ${snapshot.network}`} />

      <Ladder ladder={snapshot.ladder} ceilings={snapshot.ceilings} translations={snapshot.translations} windows={snapshot.windows} />
      <CeilingCards ceilings={snapshot.ceilings} />
      <Guardrails guardrails={snapshot.guardrails} />

      <Progress work={snapshot.work} />

      {snapshot.sections.map((section) => (
        <details key={section.id}>
          <summary className="cursor-pointer select-none">
            <Text as="h2" variant="headline" className="inline">{section.title}</Text>
            <Text as="span" variant="label.regular" tone="muted"> · {section.metrics.length} {section.metrics.length === 1 ? 'row' : 'rows'}</Text>
            <Text as="span" variant="label.regular" tone="muted" className="block">{section.summary}</Text>
          </summary>
          <Card className="mt-3 divide-y divide-bds-gray-10 bg-background dark:divide-white/10 dark:bg-white/5">
            {section.metrics.map((m) => (
              <div key={m.label} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Text variant="label">{m.label}</Text>
                  <Value metric={m} />
                </div>
                <MetricDetails metric={m} snapshot={snapshot} />
              </div>
            ))}
          </Card>
          {section.gaps.length > 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-bds-gray-10 px-4 py-3 dark:border-white/10">
              <Text variant="label" tone="muted">Missing evidence</Text>
              <ul className="mt-1 list-disc pl-5 text-[13px] text-bds-gray-60">
                {section.gaps.map((gap) => <li key={gap}>{gap}</li>)}
              </ul>
            </div>
          ) : null}
        </details>
      ))}

      <Text variant="label.regular" tone="muted">
        Experiment results: <Link className="underline" href="/benchmark/run">Benchmarks</Link> ·{' '}
        <Link className="underline" href="/benchmark/load-tests">Load tests</Link>
      </Text>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  observed: '', partial: 'Partial', unavailable: 'Unavailable', 'not-measured': 'Not measured',
};

function Value({ metric }: { metric: Metric }) {
  if (metric.value === null) {
    return (
      <span className="w-fit rounded-md border border-dashed border-bds-gray-40 px-2 py-0.5 text-[13px] text-bds-gray-60">
        {STATUS_LABEL[metric.status]}
      </span>
    );
  }
  return (
    <span className="flex items-baseline gap-2">
      <Text as="span" variant="label.mono">
        {metric.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        {metric.unit ? <span className="ml-1 text-bds-gray-60">{metric.unit}</span> : null}
      </Text>
      {metric.status === 'partial' ? <span className="text-[12px] text-bds-yellow-70">Partial</span> : null}
    </span>
  );
}

function MetricDetails({ metric, snapshot }: { metric: Metric; snapshot: Snapshot }) {
  const window = metric.window ? snapshot.windows[metric.window] : null;
  return (
    <details className="text-[13px] text-bds-gray-60">
      <summary className="cursor-pointer select-none">
        {window ? `${window.label} · details` : metric.value === null ? 'No measurement yet · details' : 'Details'}
      </summary>
      <div className="mt-1 flex flex-col gap-1">
        {window ? <p>{formatTime(window.start)} → {formatTime(window.end)}</p> : null}
        <p>{metric.note}</p>
        {metric.query ? <code className="break-all font-mono text-[12px]">{metric.query}</code> : null}
        {metric.source ? <ExternalLink link={metric.source} /> : null}
      </div>
    </details>
  );
}

function ExternalLink({ link }: { link: { label: string; url: string } }) {
  return (
    <a className="w-fit underline" href={link.url} target="_blank" rel="noreferrer">
      {link.label}
    </a>
  );
}
