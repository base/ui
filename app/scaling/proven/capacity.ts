import type { BenchmarkRun, BenchmarkRuns } from '../runs/lib/types';

export const PAYLOADS = { mix: 'mainnet-mix', payment: 'b20-transfer-existing', swap: 'uniswap-v3-swap' } as const;
export type Workload = keyof typeof PAYLOADS;

export type PipelineStep = {
  name: string;
  enabled: boolean;
  status: 'passed' | 'failed' | 'skipped' | 'not-implemented';
  reason?: string | null;
  durationSeconds?: number;
  outputs?: Record<string, unknown>;
};
type Latency = { p50Ms: number; p99Ms: number; maxMs: number };
type Counts = { samples: number; p50: number; p99: number; max: number };
export type Replay = { blocksPerSecond: number; newPayload: Latency; match: boolean };
export type Proofs = {
  headLagBlocks: Counts;
  failedProbes: number;
  methods: Record<string, { errors: number; latency: Latency }>;
  witnessBytes: Counts;
};
// `base-bench da` writes snake_case.
export type DaResult = {
  seconds: number;
  gas_used: number;
  transactions: number;
  transaction_bytes: number;
  frame_bytes: number;
  gas_per_second: number;
  bytes_per_gas: number;
  compression_ratio: number;
  blobs_per_l1_slot: number;
  blob_fill: number;
  blob_target_gas_per_second: number;
};
// `target` and `withinTarget` come from the pipeline's DA step; the blob target is recorded, not gating.
export type Da = { result: DaResult; target: number | null; withinTarget: boolean | null };

// `storage-growth.json`: disk growth measured over the run, projected to a year at its gas rate.
export type Storage = {
  diskBudgetBytes: number;
  // Proofs are null when the proofs disk usage could not be measured.
  bytesPerGas: { history: number; proofs: number | null; archive: number };
  current: { state: number };
  archive: { growthBytesPerYear: number; growthBound: string; currentBytes: number | null; runwayYears: number | null; runwayBound: string };
  fullNode: {
    stateGrowthBytesPerYear: number;
    historyWindowSeconds: number;
    historyFootprintBytes: number;
    historyFootprintBound: string;
    proofWindowSeconds: number;
    proofFootprintBytes: number;
  };
};

export type Run = {
  id: string;
  outputDir: string;
  workload: Workload;
  mgas: number;
  gps: number;
  tps: number;
  // Share of confirmed transactions that reverted; they still use gas.
  reverted: number;
  passed: boolean;
  commit: string;
  createdAt: number;
  steps: PipelineStep[];
  replay: Replay | null;
  proofNode: (Replay & { proofs: Proofs | null }) | null;
  da: Da | null;
  storage: Storage | null;
  // load-test-result.json's block_latency: transaction send to inclusion.
  blockLatency: { p50Ms: number; p99Ms: number } | null;
};

// The load result's tps includes confirmed transactions that reverted, so exclude them for successful TPS.
export const successfulTps = (run: Run) => run.tps * (1 - run.reverted);

export type Proven = { mgas: number; atTop: boolean; run: Run };

export type Step = {
  at: number;
  mgas: number | null;
  commit: string | null;
  previousCommit: string | null;
  compareUrl: string | null;
};

// `history` is the mainnet mix's; `da` is the latest counting run per workload in the window whose DA
// step passed; `latestAt` is when the newest counting run was created. Replay, proof-node and DA results are loaded only for the runs in `current` and `da`:
// replay files list every block, and every other run would download them for nothing.

export type ProvenCapacity = {
  current: Record<Workload, Proven | null>;
  da: Record<Workload, Run | null>;
  comparisons: GlamsterdamPair[];
  /** Latest eligible main run per workload and target in the comparison window. */
  mainCandidates?: Run[];
  comparisonErrors: number;
  history: Step[];
  latestAt: number | null;
  unknown: string[];
};

/** A Glamsterdam run paired with the closest-TPS main run for the same workload. */
export type GlamsterdamPair = { workload: Workload; main: Run; glamsterdam: Run };

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const PASS_RATIO = 0.95;
const CONCURRENCY = 6;
const SCENARIO = /^(glamsterdam-)?sustained-(\d+)mgas$/;
const WORKLOADS = Object.keys(PAYLOADS) as Workload[];
type Candidate = { meta: BenchmarkRun; kind: 'main' | 'glamsterdam'; mgas: number; workload: Workload };

// Run outputs never change once written. `null` marks a run that does not count: not built from
// main, or written before the step pipeline.
const runCache = new Map<string, Run | null>();
const detailCache = new Map<string, Pick<Run, 'replay' | 'proofNode' | 'da' | 'storage'>>();

export const runHref = (run: Run) => `/scaling/runs/bench/${encodeURIComponent(run.id)}`;

export async function loadProvenCapacity(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<ProvenCapacity> {
  const root = baseUrl.replace(/\/*$/, '/output/');
  // The index changes after every run; revalidate instead of trusting a heuristically fresh cached copy.
  const res = await fetchImpl(`${root}metadata.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch metadata: ${res.status} ${res.statusText}`);
  const runs: Run[] = [];
  const glamRuns: Run[] = [];
  const unknown: string[] = [];
  const failedGlamRuns = new Map<string, number>();
  await forEachLimit(candidates(await res.json()), CONCURRENCY, async (candidate) => {
    const { meta, kind } = candidate;
    try {
      if (!runCache.has(meta.outputDir)) runCache.set(meta.outputDir, await loadRun(root, candidate, fetchImpl));
      const run = runCache.get(meta.outputDir);
      if (run) (kind === 'glamsterdam' ? glamRuns : runs).push(run);
    } catch {
      if (kind === 'main') {
        unknown.push(meta.outputDir);
      } else {
        const key = `${candidate.workload}:${candidate.mgas}`;
        const failedAt = Date.parse(meta.createdAt);
        const previous = failedGlamRuns.get(key);
        if (previous === undefined || failedAt > previous) failedGlamRuns.set(key, failedAt);
      }
    }
  });
  const inWindow = (r: Run) => r.createdAt > now - WINDOW_MS && r.createdAt <= now;
  const daPassed = (r: Run) => r.steps.some((s) => s.name === 'da' && s.status === 'passed');
  const latestDa = (rs: Run[]) => rs.filter((r) => inWindow(r) && daPassed(r)).sort((a, b) => b.createdAt - a.createdAt)[0];
  const of = (rs: Run[], w: Workload) => rs.filter((r) => r.workload === w);
  const selected = new Set(WORKLOADS.flatMap((w) => [provenAt(of(runs, w), now)?.run, latestDa(of(runs, w))]).filter((r) => r !== undefined));
  await forEachLimit([...selected], CONCURRENCY, async (run) => {
    try {
      if (!detailCache.has(run.outputDir)) detailCache.set(run.outputDir, await loadDetails(root, run, fetchImpl));
    } catch {
      unknown.push(run.outputDir);
    }
  });
  const full = runs.map((r) => ({ ...r, ...detailCache.get(r.outputDir) }));
  const daRun = (w: Workload) => {
    const run = latestDa(of(full, w));
    return run?.da ? run : null;
  };
  const comparison = glamsterdamComparisons(full, glamRuns, now, failedGlamRuns);
  return {
    current: Object.fromEntries(WORKLOADS.map((w) => [w, provenAt(of(full, w), now)])) as ProvenCapacity['current'],
    da: Object.fromEntries(WORKLOADS.map((w) => [w, daRun(w)])) as ProvenCapacity['da'],
    comparisons: comparison.pairs,
    comparisonErrors: comparison.errors,
    mainCandidates: comparison.mainCandidates,
    history: history(of(full, 'mix'), now),
    latestAt: runs.length ? Math.max(...runs.map((r) => r.createdAt)) : null,
    unknown,
  };
}

function candidates({ runs }: BenchmarkRuns): Candidate[] {
  const payloads: string[] = Object.values(PAYLOADS);
  const byDir = new Map<string, Candidate>();
  for (const run of runs) {
    const c = run.testConfig;
    const scenario = SCENARIO.exec(String(c.Scenario));
    if (
      c.ChainId === 8453 &&
      payloads.includes(String(c.TransactionPayload)) &&
      scenario &&
      !String(c.BenchmarkRun).endsWith('--latest')
    ) {
      byDir.set(run.outputDir, {
        meta: run,
        kind: scenario[1] ? 'glamsterdam' : 'main',
        workload: WORKLOADS.find((w) => PAYLOADS[w] === c.TransactionPayload)!,
        mgas: Number(scenario[2]),
      });
    }
  }
  return [...byDir.values()];
}

// A missing file comes back as the host's HTML fallback with a 200, so non-JSON means missing.
async function getJson(fetchImpl: typeof fetch, url: string) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json().catch(() => null);
}

async function loadRun(root: string, candidate: Candidate, fetchImpl: typeof fetch): Promise<Run | null> {
  const { meta, kind, mgas } = candidate;
  const get = (file: string) => getJson(fetchImpl, `${root}${meta.outputDir}/${file}`);
  const [pipeline, provenance] = await Promise.all([get('pipeline-result.json'), get('provenance.json')]);
  const source = provenance?.source;
  if (!pipeline || !source || (kind === 'main' && source.ref !== 'main')) return null;
  const [validation, load] = await Promise.all([get('validation.json'), get('load-test-result.json')]);
  if (!validation || !load) throw new Error(`Missing results for ${meta.outputDir}`);
  const gps: number = load.throughput.gps;
  return {
    id: String(meta.testConfig.BenchmarkRun),
    outputDir: meta.outputDir,
    workload: candidate.workload,
    mgas,
    gps,
    tps: load.throughput.tps,
    reverted: load.throughput.total_confirmed ? (load.throughput.total_reverted ?? 0) / load.throughput.total_confirmed : 0,
    blockLatency: load.block_latency?.p50 && load.block_latency?.p99 ? { p50Ms: durationMs(load.block_latency.p50), p99Ms: durationMs(load.block_latency.p99) } : null,
    passed: validation.comparable === true && gps >= PASS_RATIO * mgas * 1e6,
    commit: source.revision,
    createdAt: Date.parse(meta.createdAt),
    steps: pipeline.steps,
    replay: null,
    proofNode: null,
    da: null,
    storage: null,
  };
}

async function loadDetails(root: string, run: Run, fetchImpl: typeof fetch): Promise<Pick<Run, 'replay' | 'proofNode' | 'da' | 'storage'>> {
  const get = (file: string) => getJson(fetchImpl, `${root}${run.outputDir}/${file}`);
  const [replay, proofNode, da, storage] = await Promise.all([
    get('replay-result.json'),
    get('proof-node/replay-result.json'),
    get('da-result.json'),
    // Newer than the other files and only shown as context, so its failure must not drop them.
    get('storage-growth.json').catch(() => null),
  ]);
  const daOutputs = run.steps.find((s) => s.name === 'da')?.outputs;
  return {
    replay: replay && pickReplay(replay),
    proofNode: proofNode && { ...pickReplay(proofNode), proofs: proofNode.proofs ?? null },
    da: da && { result: da, target: (daOutputs?.target as number) ?? null, withinTarget: (daOutputs?.withinTarget as boolean) ?? null },
    storage,
  };
}

/** Keeps the latest in-window run for each workload and target gas rate. */
function latestByWorkloadAndRate(runs: Run[], now: number): Map<string, Run> {
  const latest = new Map<string, Run>();
  for (const run of runs) {
    if (run.createdAt <= now - WINDOW_MS || run.createdAt > now) continue;
    const key = `${run.workload}:${run.mgas}`;
    const previous = latest.get(key);
    if (!previous || run.createdAt > previous.createdAt) latest.set(key, run);
  }
  return latest;
}

/** Pairs each latest Glamsterdam run with the closest-TPS main run for the same workload. */
function glamsterdamComparisons(
  mainRuns: Run[],
  glamRuns: Run[],
  now: number,
  failedGlamRuns: Map<string, number>,
): { pairs: GlamsterdamPair[]; errors: number; mainCandidates: Run[] } {
  const latestMain = latestByWorkloadAndRate(mainRuns, now);
  const mainCandidates = [...latestMain.values()].sort(
    (a, b) => WORKLOADS.indexOf(a.workload) - WORKLOADS.indexOf(b.workload) || a.mgas - b.mgas,
  );
  const mainByWorkload = new Map<Workload, Run[]>();
  for (const run of latestMain.values()) {
    mainByWorkload.set(run.workload, [...(mainByWorkload.get(run.workload) ?? []), run]);
  }
  const latestGlam = latestByWorkloadAndRate(glamRuns, now);
  const blocked = new Set(
    [...failedGlamRuns].flatMap(([key, failedAt]) => {
      const loaded = latestGlam.get(key);
      const workload = key.split(':')[0] as Workload;
      const hasMainRun = (mainByWorkload.get(workload)?.length ?? 0) > 0;
      return hasMainRun && failedAt > now - WINDOW_MS && failedAt <= now && (!loaded || failedAt >= loaded.createdAt) ? [key] : [];
    }),
  );
  const pairs = [...latestGlam.entries()]
    .flatMap(([key, glamsterdam]) => {
      const baselines = mainByWorkload.get(glamsterdam.workload) ?? [];
      if (blocked.has(key) || baselines.length === 0) return [];
      const main = baselines.reduce((closest, candidate) => {
        const candidateGap = Math.abs(successfulTps(candidate) - successfulTps(glamsterdam));
        const closestGap = Math.abs(successfulTps(closest) - successfulTps(glamsterdam));
        return candidateGap < closestGap || (candidateGap === closestGap && candidate.createdAt > closest.createdAt)
          ? candidate
          : closest;
      });
      return [{ workload: glamsterdam.workload, main, glamsterdam }];
    })
    .sort(
      (a, b) =>
        WORKLOADS.indexOf(a.workload) - WORKLOADS.indexOf(b.workload) ||
        a.glamsterdam.mgas - b.glamsterdam.mgas,
    );
  return { pairs, errors: blocked.size, mainCandidates };
}

// Rust Durations serialize as { secs, nanos }.
const durationMs = (d: { secs: number; nanos: number }) => d.secs * 1e3 + d.nanos / 1e6;

// replay-result.json also lists every block's timings; keep only the summary.
const pickReplay = ({ blocksPerSecond, newPayload, match }: Replay): Replay => ({ blocksPerSecond, newPayload, match });

function provenAt(runs: Run[], t: number): Proven | null {
  const latest = new Map<number, Run>();
  for (const run of runs) {
    if (run.createdAt <= t - WINDOW_MS || run.createdAt > t) continue;
    const prev = latest.get(run.mgas);
    if (!prev || run.createdAt > prev.createdAt) latest.set(run.mgas, run);
  }
  const best = [...latest.values()].filter((r) => r.passed).sort((a, b) => b.mgas - a.mgas)[0];
  return best ? { mgas: best.mgas, atTop: best.mgas === Math.max(...latest.keys()), run: best } : null;
}

function history(runs: Run[], now: number): Step[] {
  // Capacity can only change when a run lands or ages out of the window.
  const times = runs
    .flatMap((r) => [r.createdAt, r.createdAt + WINDOW_MS])
    .concat(now)
    .filter((t) => t <= now)
    .sort((a, b) => a - b);
  const steps: Step[] = [];
  for (const t of times) {
    const proven = provenAt(runs, t);
    const mgas = proven?.mgas ?? null;
    const prev = steps[steps.length - 1];
    if ((prev?.mgas ?? null) === mgas) continue;
    const commit = proven?.run.commit ?? null;
    const previousCommit = prev?.commit ?? null;
    const compareUrl =
      commit && previousCommit && commit !== previousCommit
        ? `https://github.com/base/base/compare/${previousCommit}...${commit}`
        : null;
    steps.push({ at: t, mgas, commit, previousCommit, compareUrl });
  }
  return steps;
}

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: limit }, worker));
}
