import { readFile } from 'node:fs/promises';
import Link from 'next/link';

import { Banner } from '../components/ui/Banner';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Text } from '../components/ui/Text';

import { isStale, parseSnapshot, type Ladder, type Metric, type Rung, type Snapshot, type WorkItem } from './snapshot.mjs';

// The snapshot is a runtime file, so render per request rather than at build.
export const dynamic = 'force-dynamic';

const STALE_AFTER_DAYS = 10;
const DAY_MS = 86_400_000;

type Loaded =
  | { kind: 'unconfigured' }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'ok'; snapshot: Snapshot; ageDays: number; stale: boolean };

async function loadSnapshot(): Promise<Loaded> {
  const path = process.env.SCALING_SNAPSHOT_PATH;
  if (!path) return { kind: 'unconfigured' };
  try {
    const result = parseSnapshot(JSON.parse(await readFile(path, 'utf8')));
    if (!result.ok) return { kind: 'invalid', errors: result.errors };
    const { collectedAt } = result.snapshot;
    const ageDays = Math.floor((Date.now() - Date.parse(collectedAt)) / DAY_MS);
    return { kind: 'ok', snapshot: result.snapshot, ageDays, stale: isStale(collectedAt, new Date(), STALE_AFTER_DAYS) };
  } catch (error) {
    return { kind: 'invalid', errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export default async function ScalingPage() {
  const loaded = await loadSnapshot();
  if (loaded.kind === 'unconfigured') {
    return (
      <EmptyState
        title="No scaling snapshot configured"
        description="Set SCALING_SNAPSHOT_PATH to a reviewed snapshot file (validate it with npm run scaling:check)."
      />
    );
  }
  if (loaded.kind === 'invalid') {
    return (
      <EmptyState
        title="Scaling snapshot could not be loaded"
        description={<span className="whitespace-pre-line font-mono text-[13px]">{loaded.errors.join('\n')}</span>}
      />
    );
  }

  const { snapshot, ageDays, stale } = loaded;
  return (
    <div className="flex flex-col gap-10 pb-8">
      <header className="flex flex-col gap-3">
        <Text as="h1" variant="title2">Scaling scorecard · {snapshot.network}</Text>
        <Text variant="label.regular" tone="muted">
          As of {formatTime(snapshot.collectedAt)} ({ageDays === 0 ? 'today' : `${ageDays}d old`}) · manually refreshed
          snapshot, not live data. {snapshot.context}
        </Text>
        {stale ? (
          <Banner>Stale: this snapshot is older than {STALE_AFTER_DAYS} days. Refresh it before using these numbers.</Banner>
        ) : null}
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {headline(snapshot.ladder).map((m) => (
          <Card key={m.label} className="flex flex-col gap-1 bg-background p-4 dark:bg-white/5">
            <Text variant="label" tone="muted">{m.label}</Text>
            <Value metric={m} large />
            <MetricDetails metric={m} snapshot={snapshot} />
          </Card>
        ))}
      </section>

      {snapshot.sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-3">
          <div>
            <Text as="h2" variant="headline">{section.title}</Text>
            <Text variant="label.regular" tone="muted">{section.summary}</Text>
          </div>
          <Card className="divide-y divide-bds-gray-10 bg-background dark:divide-white/10 dark:bg-white/5">
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
            <div className="rounded-lg border border-dashed border-bds-gray-10 px-4 py-3 dark:border-white/10">
              <Text variant="label" tone="muted">Missing evidence</Text>
              <ul className="mt-1 list-disc pl-5 text-[13px] text-bds-gray-60">
                {section.gaps.map((gap) => <li key={gap}>{gap}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <Text as="h2" variant="headline">What we&apos;re working on</Text>
        {snapshot.work.length === 0 ? (
          <EmptyState description="No current work supplied for this snapshot." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {snapshot.work.map((w) => <WorkCard key={w.title} item={w} />)}
          </div>
        )}
      </section>

      <Text variant="label.regular" tone="muted">
        Experiment results: <Link className="underline" href="/benchmark/run">Benchmarks</Link> ·{' '}
        <Link className="underline" href="/benchmark/load-tests">Load tests</Link>
      </Text>
    </div>
  );
}

type Shown = Omit<Metric, 'status'> & { status: string };

function headline(ladder: Ladder): Shown[] {
  const rungs: [string, Rung][] = [
    ['Observed gas/s (p50)', ladder.observed.p50],
    ['Operating point', ladder.operatingPoint],
    ['Configured limit', ladder.configuredLimit],
    ['Qualified sustained', ladder.qualified],
  ];
  return rungs.map(([label, r]) => ({
    label, status: r.value === null ? r.tag : 'observed', value: r.value, unit: r.unit, window: r.window, note: r.help, source: r.source,
  }));
}

const STATUS_LABEL: Record<string, string> = {
  observed: '', partial: 'Partial', unavailable: 'Unavailable', 'not-measured': 'Not measured',
  'not-modeled': 'Not modeled', 'not-established': 'Not established',
};

function Value({ metric, large = false }: { metric: Shown; large?: boolean }) {
  if (metric.value === null) {
    return (
      <span className="w-fit rounded-md border border-dashed border-bds-gray-40 px-2 py-0.5 text-[13px] text-bds-gray-60">
        {STATUS_LABEL[metric.status]}
      </span>
    );
  }
  return (
    <span className="flex items-baseline gap-2">
      <Text as="span" variant={large ? 'title2' : 'label.mono'}>
        {metric.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        {metric.unit ? <span className="ml-1 text-bds-gray-60">{metric.unit}</span> : null}
      </Text>
      {metric.status === 'partial' ? <span className="text-[12px] text-bds-yellow-70">Partial</span> : null}
    </span>
  );
}

function MetricDetails({ metric, snapshot }: { metric: Shown; snapshot: Snapshot }) {
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

function WorkCard({ item }: { item: WorkItem }) {
  const rows = [
    ['Hypothesis', item.hypothesis],
    ['Change', item.change],
    ['Expected impact', item.expected ?? 'Not estimated'],
    ['Realized impact', item.realized ?? 'Not measured'],
  ];
  return (
    <Card className="flex flex-col gap-2 bg-background p-4 text-[13px] dark:bg-white/5">
      <Text variant="label">{item.title}</Text>
      <Text variant="footnote" tone="muted">{item.status} · {item.owner ?? 'No owner assigned'}</Text>
      {rows.map(([term, text]) => (
        <p key={term}><span className="text-bds-gray-60">{term}:</span> {text}</p>
      ))}
      <div className="flex flex-wrap gap-3">
        {item.evidence ? <ExternalLink link={item.evidence} /> : null}
        {item.links.map((l) => <ExternalLink key={l.url} link={l} />)}
      </div>
    </Card>
  );
}

function ExternalLink({ link }: { link: { label: string; url: string } }) {
  return (
    <a className="w-fit underline" href={link.url} target="_blank" rel="noreferrer">
      {link.label}
    </a>
  );
}

function formatTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
