'use client';

import { useState } from 'react';
import useSWR from 'swr';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Text } from '../../../../components/ui/Text';
import { Info } from '../../../components/Info';
import { LineChart } from '../../components/LineChart';
import { Crumbs, Section, Status, Table, TD } from '../../components/parts';
import { CHART_GROUPS } from '../../lib/chartGroups';
import { getDataService } from '../../lib/dataService';
import { downloadRunInfo, downloadRunInfoCSV } from '../../lib/downloadUtils';
import { formatValue } from '../../lib/formatters';
import { SORTED_CHART_CONFIG } from '../../lib/metricDefinitions';
import { getTestRunsWithStatus, thresholdSummary, type BenchmarkRunWithStatus, type MetricData } from '../../lib/types';
import { toUnifiedRun } from '../../lib/unified';

const configLabel = ({ testConfig: c, outputDir }: BenchmarkRunWithStatus) =>
  [c.GasLimit && `${Number(c.GasLimit) / 1e6}M gas`, c.BlockTimeMilliseconds && `${c.BlockTimeMilliseconds} ms blocks`].filter(Boolean).join(' · ') || outputDir;

const mgas = (gps?: number) => (gps === undefined ? '—' : (gps / 1e6).toFixed(1));

// Thresholds are in nanoseconds; summary latencies are in seconds.
function thresholdRows(run: BenchmarkRunWithStatus) {
  const { warning = {}, error = {} } = run.thresholds ?? {};
  return [...new Set([...Object.keys(warning), ...Object.keys(error)])].map((metric) => {
    const [field, role, scale] = thresholdSummary(metric) ?? [];
    const value = field ? (run.result?.[`${role}Metrics`]?.[field as never] as number | undefined) : undefined;
    const ns = value === undefined ? undefined : value * scale!;
    const status = ns === undefined ? 'unknown' : ns > (error[metric] ?? Infinity) ? 'error' : ns > (warning[metric] ?? Infinity) ? 'warning' : 'success';
    return { metric, value, warning: warning[metric], error: error[metric], status };
  });
}

export function BenchRun({ id }: { id: string }) {
  const { data, error } = useSWR('scaling-bench-metadata', () => getDataService().getMetadata());
  const runs = data ? getTestRunsWithStatus({ runs: data.runs.filter((r) => `${r.testConfig.BenchmarkRun}` === id) }) : [];
  const first = runs[0];
  const thresholds = runs.flatMap((run) => thresholdRows(run).map((t) => ({ run, ...t })));

  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="flex flex-col gap-3">
        <Crumbs here={id} />
        <Text as="h1" variant="title2">
          <span className="inline-flex items-center gap-2">
            {first?.testName ?? 'Bench run'}
            {first?.testDescription ? <Info label="About this benchmark"><span className="whitespace-pre-line">{first.testDescription}</span></Info> : null}
          </span>
        </Text>
        {first ? <Text variant="label.regular" tone="muted">{first.createdAt.slice(0, 16).replace('T', ' ')} UTC · {first.sourceFile} · {runs.length} configuration{runs.length === 1 ? '' : 's'}</Text> : null}
      </header>
      {error ? (
        <EmptyState title="Run could not be loaded" description={error instanceof Error ? error.message : String(error)} />
      ) : !data ? (
        <Text tone="muted">Loading run…</Text>
      ) : !first ? (
        <EmptyState title="Run not found" description={`No base-bench run has id ${id}.`} />
      ) : (
        <>
          <Section title="Summary" action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadRunInfo(runs, id)}>Download JSON</Button>
              <Button size="sm" variant="outline" onClick={() => downloadRunInfoCSV(runs, id)}>Download CSV</Button>
            </div>
          }>
            <Table head={['Configuration', 'Workload', 'Sequencer Mgas/s', 'Validator Mgas/s', 'Latency', 'Status', 'Machine', 'Client']}>
              {runs.map((run) => {
                const u = toUnifiedRun(run);
                return (
                  <tr key={run.outputDir} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                    <td className={cn(TD, 'whitespace-nowrap')}>{configLabel(run)}</td>
                    <td className={TD}>{u.workload}</td>
                    <td className={cn(TD, 'font-mono')}>{mgas(run.result?.sequencerMetrics?.gasPerSecond)}</td>
                    <td className={cn(TD, 'font-mono')}>{mgas(run.result?.validatorMetrics?.gasPerSecond)}</td>
                    <td className={cn(TD, 'whitespace-nowrap font-mono')}>{u.latency.length ? u.latency.map((l) => <div key={l.label}>{l.label} {formatValue(l.seconds, 's')}</div>) : '—'}</td>
                    <td className={TD}><Status status={run.status} /></td>
                    <td className={TD}>{u.machine ?? '—'}</td>
                    <td className={TD}>{u.commit ?? '—'}</td>
                  </tr>
                );
              })}
            </Table>
          </Section>
          <Section title="Thresholds">
            {thresholds.length ? (
              <Table head={['Metric', 'Value', 'Warning', 'Error', 'Status']}>
                {thresholds.map(({ run, ...t }) => (
                  <tr key={`${run.outputDir}-${t.metric}`} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                    <td className={TD}>{t.metric}{runs.length > 1 ? <p className="text-bds-gray-60">{configLabel(run)}</p> : null}</td>
                    <td className={cn(TD, 'whitespace-nowrap font-mono')}>{t.value === undefined ? '—' : formatValue(t.value, 's')}</td>
                    <td className={cn(TD, 'whitespace-nowrap font-mono')}>{t.warning === undefined ? '—' : `> ${formatValue(t.warning, 'ns')}`}</td>
                    <td className={cn(TD, 'whitespace-nowrap font-mono')}>{t.error === undefined ? '—' : `> ${formatValue(t.error, 'ns')}`}</td>
                    <td className={TD}><Status status={t.status} /></td>
                  </tr>
                ))}
              </Table>
            ) : <Text tone="muted">No thresholds recorded.</Text>}
          </Section>
          <Charts runs={runs} />
          <Section title="Raw config">
            {runs.map((run) => (
              <Card key={run.outputDir} className="overflow-x-auto bg-background p-4 dark:bg-white/5">
                {runs.length > 1 ? <Text variant="label.regular" tone="muted">{configLabel(run)}</Text> : null}
                <pre className="font-mono text-[12px]">{JSON.stringify(run.testConfig, null, 2)}</pre>
              </Card>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

const CONFIG = new Map(SORTED_CHART_CONFIG);
const ROLES = [
  { name: 'sequencer', stroke: 'stroke-base-blue', dot: 'bg-base-blue' },
  { name: 'validator', stroke: 'stroke-bds-orange-50', dot: 'bg-bds-orange-50' },
];

async function loadMetrics(outputDir: string): Promise<MetricData[][]> {
  const settled = await Promise.allSettled(ROLES.map((r) => getDataService().getMetrics(outputDir, r.name)));
  if (settled.every((r) => r.status === 'rejected')) throw (settled[0] as PromiseRejectedResult).reason;
  return settled.map((r) => (r.status === 'fulfilled' ? r.value : []));
}

function Charts({ runs }: { runs: BenchmarkRunWithStatus[] }) {
  const [selected, setSelected] = useState(0);
  const run = runs[selected];
  const { data, error } = useSWR(['scaling-bench-metrics', run.outputDir], () => loadMetrics(run.outputDir));
  const groups = CHART_GROUPS.map(([group, metrics]) => [group, metrics.map((key) => {
    const config = CONFIG.get(key)!;
    const keys = [key, ...(config.aliases ?? [])];
    const series = ROLES.map((role, i) => ({ ...role, points: (data?.[i] ?? []).flatMap((m): [number, number][] => {
      const k = keys.find((k) => m.ExecutionMetrics[k] !== undefined);
      return k ? [[m.BlockNumber, m.ExecutionMetrics[k]]] : [];
    }) }));
    return { key, config, series };
  }).filter((c) => c.series.some((s) => s.points.length))] as const);

  return (
    <Section title="Per-block metrics">
      {runs.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {runs.map((r, i) => (
            <button key={r.outputDir} type="button" aria-pressed={i === selected} onClick={() => setSelected(i)} className={cn('rounded-full border px-3 py-1 text-[12px]', i === selected ? 'border-base-blue text-base-blue' : 'border-bds-gray-20 text-bds-gray-60')}>{configLabel(r)}</button>
          ))}
        </div>
      ) : null}
      {error ? <Text tone="muted">Metrics could not be loaded: {error instanceof Error ? error.message : String(error)}</Text> : !data ? <Text tone="muted">Loading metrics…</Text> : groups.map(([group, charts], i) => (
        <details key={group} open={i === 0} className="rounded-lg border border-bds-gray-10 px-4 py-3 dark:border-white/10">
          <summary className="cursor-pointer text-[14px] font-[500]">{group} <span className="font-[400] text-bds-gray-60">· {charts.length} chart{charts.length === 1 ? '' : 's'}</span></summary>
          {charts.length ? (
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              {charts.map((c) => <LineChart key={c.key} title={c.config.title} unit={c.config.unit} series={c.series} xLabel={(x) => `block ${x}`} />)}
            </div>
          ) : <Text tone="muted">No data for this stage in this run.</Text>}
        </details>
      ))}
    </Section>
  );
}
