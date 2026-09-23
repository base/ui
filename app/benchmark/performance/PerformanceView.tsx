'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';

import ChartGrid from '../components/ChartGrid';
import type { BenchmarkRuns, DataSeries, LoadTestResult, MetricData, ThroughputSample } from '../types';
import { formatGps, formatTps } from '../utils/formatters';
import { featuredResult, latestPerformanceRelease, payloadLabel, type Cadence, type PerformanceResult } from './data';

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load performance results (${response.status}).`);
  return response.json();
};

const formatDate = (value: string) => Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value));
const COLORS = ['#0052ff', '#7c3aed', '#e11d48', '#0891b2', '#16a34a', '#d97706', '#4f46e5'];

type Metric = 'tps' | 'gps';
type Comparison = 'cadence' | 'payload';
type Series = { label: string; color: string; samples: ThroughputSample[]; average: number };

const ResultValue = ({ result }: { result?: PerformanceResult }) => result ? <div className="font-semibold text-slate-900 tabular-nums">{formatGps(result.validatorGasPerSecond)}</div> : <span className="text-slate-400">Not yet published</span>;

function ComparisonChart({ metric, series }: { metric: Metric; series: Series[] }) {
  const usable = series.filter((entry) => entry.samples.length > 1);
  if (usable.length === 0) return <div className="grid min-h-72 place-items-center text-sm text-slate-500">No published time-series data for this comparison.</div>;
  const width = 1000;
  const height = 360;
  const pad = { top: 24, right: 30, bottom: 38, left: 76 };
  const points = usable.flatMap((entry) => entry.samples);
  const values = points.map((point) => point[metric]);
  const times = points.map((point) => point.elapsed_secs);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const niceStep = (range: number) => {
    const base = 10 ** Math.floor(Math.log10(Math.max(range, 1)));
    return [1, 2, 2.5, 5, 10].map((factor) => factor * base).find((step) => range / step <= 5) ?? 10 * base;
  };
  const step = niceStep(rawMax - rawMin);
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const span = Math.max(max - min, step);
  const timeMax = Math.max(...times);
  const timeMin = 0;
  const x = (value: number) => pad.left + ((value - timeMin) / Math.max(timeMax - timeMin, 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - min) / span) * (height - pad.top - pad.bottom);
  const label = (value: number) => metric === 'tps' ? formatTps(value) : formatGps(value);
  const guides = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step);

  return <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/60 p-4 sm:p-6">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label={`${metric === 'tps' ? 'Transactions per second' : 'Gas per second'} comparison chart`}>
      <defs>{usable.map((entry, index) => <linearGradient key={entry.label} id={`area-${index}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={entry.color} stopOpacity="0.16" /><stop offset="100%" stopColor={entry.color} stopOpacity="0" /></linearGradient>)}</defs>
      {guides.map((guide) => <g key={guide}><line x1={pad.left} x2={width - pad.right} y1={y(guide)} y2={y(guide)} stroke="#e2e8f0" /><text x={pad.left - 12} y={y(guide) + 4} textAnchor="end" fontSize="12" fill="#64748b">{label(guide)}</text></g>)}
      {usable.map((entry, index) => {
        const line = entry.samples.map((sample, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${x(sample.elapsed_secs)} ${y(sample[metric])}`).join(' ');
        const area = `${line} L ${x(entry.samples[entry.samples.length - 1].elapsed_secs)} ${height - pad.bottom} L ${x(entry.samples[0].elapsed_secs)} ${height - pad.bottom} Z`;
        return <g key={entry.label}><path d={area} fill={`url(#area-${index})`} /><path d={line} fill="none" stroke={entry.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>;
      })}
      <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="#cbd5e1" />
      <text x={pad.left} y={height - 12} fontSize="12" fill="#64748b">0s</text><text x={width - pad.right} y={height - 12} textAnchor="end" fontSize="12" fill="#64748b">{Math.round(timeMax)}s</text>
    </svg>
  </div>;
}

export default function PerformanceView() {
  const { data, error, isLoading } = useSWR<BenchmarkRuns>('/api/benchmark/performance', fetcher, { revalidateOnFocus: true, dedupingInterval: 300_000 });
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [metric, setMetric] = useState<Metric>('tps');
  const [comparison, setComparison] = useState<Comparison>('cadence');
  const [payload, setPayload] = useState('eth-transfer-existing');
  const [cadence, setCadence] = useState<Cadence>(2_000);
  const release = data ? latestPerformanceRelease(data) : null;
  const featured = release ? featuredResult(release) : undefined;
  const runIds = release?.results.map((result) => result.id).sort().join(',') ?? '';
  const { data: runResults, error: runsError } = useSWR<Record<string, LoadTestResult>>(
    runIds ? `performance-runs:${runIds}` : null,
    async () => Object.fromEntries(await Promise.all(release!.results.map(async (result) => [result.id, await fetcher<LoadTestResult>(`/api/benchmark/performance/${result.id}`)]))),
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );

  const payloads = useMemo(() => release ? [...new Set(release.results.map((result) => result.payload))].sort((a, b) => payloadLabel(a).localeCompare(payloadLabel(b))) : [], [release]);
  const comparedResults = useMemo(() => {
    if (!release) return [];
    return comparison === 'cadence'
      ? release.results.filter((result) => result.payload === payload).sort((a, b) => a.blockTimeMilliseconds - b.blockTimeMilliseconds)
      : release.results.filter((result) => result.blockTimeMilliseconds === cadence).sort((a, b) => payloadLabel(a.payload).localeCompare(payloadLabel(b.payload)));
  }, [release, comparison, payload, cadence]);
  const metricRunIds = comparedResults.map((result) => result.id).sort().join(',');
  const { data: metricResults } = useSWR<Record<string, MetricData[]>>(
    metricRunIds ? `performance-metrics:${metricRunIds}` : null,
    async () => Object.fromEntries(await Promise.all(comparedResults.map(async (result) => [result.id, await fetcher<MetricData[]>(`/api/benchmark/performance/${result.id}?artifact=metrics-validator`)]))),
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
  const metricSeries: DataSeries[] = comparedResults.map((result, index) => ({ data: metricResults?.[result.id] ?? [], name: comparison === 'cadence' ? `${result.blockTimeMilliseconds}ms blocks` : payloadLabel(result.payload), color: COLORS[index % COLORS.length] }));

  const series = useMemo<Series[]>(() => comparedResults.map((result, index) => {
    const summary = runResults?.[result.id];
    return { label: comparison === 'cadence' ? `${result.blockTimeMilliseconds}ms blocks` : payloadLabel(result.payload), color: COLORS[index % COLORS.length], samples: summary?.throughput_timeseries ?? [], average: summary?.throughput[metric] ?? 0 };
  }), [comparedResults, runResults, comparison, metric]);

  if (isLoading) return <div className="animate-pulse space-y-5"><div className="h-8 w-44 rounded bg-slate-200" /><div className="h-56 rounded-xl bg-slate-100" /></div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Unable to load the latest performance results. {error.message}</div>;
  if (!release) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-600">No complete performance results have been published yet.</div>;
  const featuredSummary = featured ? runResults?.[featured.id] : undefined;
  const resultFor = (currentPayload: string, currentCadence: Cadence) => release.results.find((result) => result.payload === currentPayload && result.blockTimeMilliseconds === currentCadence);

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
    <header><p className="text-sm font-medium text-blue-600">Latest release</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Performance</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">End-to-end throughput from saturated Base Sepolia snapshot benchmarks. Historical releases are intentionally excluded.</p></header>
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-sm font-medium text-blue-700">Transactions per second</p>{featuredSummary ? <p className="mt-2 text-5xl font-semibold tracking-tight text-slate-950 tabular-nums">{formatTps(featuredSummary.throughput.tps)}</p> : <p className="mt-2 text-2xl font-semibold text-slate-800">Loading result…</p>}<p className="mt-3 text-sm text-slate-700">2s blocks · ETH transfers to existing accounts</p>{featuredSummary && <div className="mt-5 border-t border-blue-100 pt-4"><span className="text-xs font-medium uppercase tracking-wide text-slate-500">Gas per second</span><span className="ml-3 font-semibold tabular-nums text-slate-900">{formatGps(featuredSummary.throughput.gps)}</span></div>}</div><dl className="grid gap-2 text-sm text-slate-600 sm:text-right"><div><dt className="sr-only">Release</dt><dd className="font-mono text-xs text-slate-700">{release.clientVersion}</dd></div><div><dt className="sr-only">Updated</dt><dd>Published {formatDate(release.publishedAt)} UTC</dd></div></dl></div></section>
    <section className="rounded-xl border border-slate-200 bg-white"><button type="button" className="flex w-full items-center justify-between gap-4 p-5 text-left" onClick={() => setShowDetails((value) => !value)} aria-expanded={showDetails}><span><span className="block text-base font-semibold text-slate-900">Show more details</span><span className="mt-1 block text-sm text-slate-500">View throughput graphs and detailed validator metrics for the selected comparison.</span></span><span className="text-xl text-slate-500" aria-hidden="true">{showDetails ? '−' : '+'}</span></button></section>
    {showDetails && <>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-col justify-between gap-5 border-b border-slate-100 pb-5 lg:flex-row lg:items-start"><div><h2 className="text-lg font-semibold text-slate-950">Throughput comparison</h2><p className="mt-1 text-sm text-slate-500">Compare throughput over the measured duration.</p></div><div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium"><button onClick={() => setMetric('tps')} className={`rounded-md px-3 py-1.5 ${metric === 'tps' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>TPS</button><button onClick={() => setMetric('gps')} className={`rounded-md px-3 py-1.5 ${metric === 'gps' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Gas/s</button></div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[190px_1fr]"><div><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Compare</label><select value={comparison} onChange={(event) => setComparison(event.target.value as Comparison)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value="cadence">Block time</option><option value="payload">Transaction payload</option></select></div>{comparison === 'cadence' ? <div><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction payload</label><select value={payload} onChange={(event) => setPayload(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">{payloads.map((entry) => <option key={entry} value={entry}>{payloadLabel(entry)}</option>)}</select></div> : <div><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Block time</label><select value={cadence} onChange={(event) => setCadence(Number(event.target.value) as Cadence)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value={200}>200ms blocks</option><option value={2000}>2s blocks</option></select></div>}</div>
      {runsError && <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Some time-series data is temporarily unavailable.</p>}
      <div className="mt-6"><div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">{series.map((entry) => <div key={entry.label} className="flex items-center gap-2 text-sm text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} /><span>{entry.label}</span>{entry.average > 0 && <span className="font-semibold tabular-nums text-slate-900">{metric === 'tps' ? formatTps(entry.average) : formatGps(entry.average)}</span>}</div>)}</div><ComparisonChart metric={metric} series={series} /></div>
    </section>
    {metricSeries.some((entry) => entry.data.length > 0) && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-slate-950">Detailed validator metrics</h2><p className="mt-1 text-sm text-slate-500">The same selected workloads, grouped into the benchmark report's execution, builder, storage, and latency metrics.</p></div><ChartGrid data={metricSeries} role="validator" /></section>}
    </>}
    <section className="rounded-xl border border-slate-200 bg-white"><button type="button" className="flex w-full items-center justify-between gap-4 p-5 text-left" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}><span><span className="block text-base font-semibold text-slate-900">See all workloads</span><span className="mt-1 block text-sm text-slate-500">Compare every published payload at 200ms and 2s block times.</span></span><span className="text-xl text-slate-500" aria-hidden="true">{expanded ? '−' : '+'}</span></button>{expanded && <div className="overflow-x-auto border-t border-slate-200"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-medium">Workload</th><th className="px-5 py-3 font-medium">200ms blocks</th><th className="px-5 py-3 font-medium">2s blocks</th></tr></thead><tbody className="divide-y divide-slate-100">{payloads.map((entry) => <tr key={entry}><th scope="row" className="px-5 py-4 text-left font-medium text-slate-800">{payloadLabel(entry)}</th><td className="px-5 py-4"><ResultValue result={resultFor(entry, 200)} /></td><td className="px-5 py-4"><ResultValue result={resultFor(entry, 2000)} /></td></tr>)}</tbody></table></div>}</section>
  </main>;
}
