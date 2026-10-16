import { durationToMs, formatTransactions, parseLoadTestTimestamp } from './formatters';
import type { BenchmarkRunWithStatus, LoadTestEntry, LoadTestResult, RunStatus, RustDuration } from './types';

export type LoadRun = LoadTestEntry & { result?: LoadTestResult };

export type UnifiedRun = {
  kind: 'bench' | 'load';
  href: string;
  env: string;
  network: string | null;
  timestamp: number;
  commit: string | null;
  machine: string | null;
  state: 'unknown';
  duration: number | null;
  profile: 'sustained' | 'burst' | null;
  workload: string;
  gasPerSecond: number | null;
  latency: { label: string; seconds: number }[];
  status: RunStatus | null;
  areas: ('execution' | 'da' | 'networking')[];
  qualifies: { ok: false; reason: string };
};

const SUSTAINED_SECONDS = 3600;
const secs = (d: RustDuration) => durationToMs(d) / 1000;

export function toUnifiedRun(run: BenchmarkRunWithStatus | LoadRun): UnifiedRun {
  return 'testConfig' in run ? fromBench(run) : fromLoad(run);
}

function fromBench(run: BenchmarkRunWithStatus): UnifiedRun {
  const r = run.result;
  // metadata.json records no block count, so a bench run's duration is unknown.
  return withQualifies({
    kind: 'bench',
    href: `/scaling/runs/bench/${run.id}`,
    env: 'bench',
    network: null,
    timestamp: Date.parse(run.createdAt),
    commit: r?.clientVersion ?? null,
    machine: [run.machineInfo?.type, run.machineInfo?.provider, run.machineInfo?.region].filter(Boolean).join(' · ') || null,
    duration: null,
    workload: String(run.testConfig.TransactionPayload ?? run.testName),
    gasPerSecond: r?.sequencerMetrics?.gasPerSecond ?? null,
    latency: [r?.sequencerMetrics && { label: 'get-payload', seconds: r.sequencerMetrics.getPayload }, r?.validatorMetrics && { label: 'new-payload', seconds: r.validatorMetrics.newPayload }].filter((l) => !!l),
    status: run.status,
    areas: ['execution'],
  });
}

function fromLoad({ network, timestamp, result }: LoadRun): UnifiedRun {
  const config = result?.config;
  const target = config ? `target ${config.target_gps / 1e6} Mgas/s` : undefined;
  return withQualifies({
    kind: 'load',
    href: `/scaling/runs/load/${network}/${timestamp}`,
    env: network,
    network,
    timestamp: parseLoadTestTimestamp(timestamp)?.getTime() ?? 0,
    commit: null,
    machine: null,
    duration: result?.throughput ? secs(result.throughput.duration) : null,
    workload: [config && formatTransactions(config), target].filter(Boolean).join(' · ') || '—',
    gasPerSecond: result?.throughput?.gps ?? null,
    latency: result?.block_latency ? [{ label: 'block p99', seconds: secs(result.block_latency.p99) }, { label: 'flashblocks p99', seconds: secs(result.flashblocks_latency.p99) }] : [],
    status: result ? (result.error ? 'fatal' : 'success') : null,
    areas: ['execution', 'da', 'networking'],
  });
}

function withQualifies(run: Omit<UnifiedRun, 'state' | 'profile' | 'qualifies'>): UnifiedRun {
  const { duration } = run;
  const profile = duration === null ? null : duration >= SUSTAINED_SECONDS ? 'sustained' : 'burst';
  const reasons = [duration === null ? 'duration not recorded' : profile === 'burst' ? `${duration} s burst, needs ≥ 1 h` : null, 'state size not recorded'];
  return { ...run, state: 'unknown', profile, qualifies: { ok: false, reason: reasons.filter(Boolean).join('; ') } };
}

export function weekOf(ts: number): string {
  const d = new Date(ts);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
