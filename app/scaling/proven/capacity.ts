import type { BenchmarkRun, BenchmarkRuns } from '../runs/lib/types';

export type Run = {
  outputDir: string;
  mgas: number;
  gps: number;
  passed: boolean;
  commit: string;
  createdAt: number;
};

export type Proven = { mgas: number; atTop: boolean; run: Run };

export type Step = {
  at: number;
  mgas: number | null;
  commit: string | null;
  previousCommit: string | null;
  compareUrl: string | null;
};

export type ProvenCapacity = { current: Proven | null; history: Step[]; unknown: string[] };

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const PASS_RATIO = 0.95;
const CONCURRENCY = 6;
const SCENARIO = /^sustained-(\d+)mgas$/;

// Run outputs never change once written. `null` marks a run not built from main.
const runCache = new Map<string, Run | null>();

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
  const unknown: string[] = [];
  await forEachLimit(candidates(await res.json()), CONCURRENCY, async (meta) => {
    try {
      if (!runCache.has(meta.outputDir)) runCache.set(meta.outputDir, await loadRun(root, meta, fetchImpl));
      const run = runCache.get(meta.outputDir);
      if (run) runs.push(run);
    } catch {
      unknown.push(meta.outputDir);
    }
  });
  return { current: provenAt(runs, now), history: history(runs, now), unknown };
}

function candidates({ runs }: BenchmarkRuns): BenchmarkRun[] {
  const byDir = new Map<string, BenchmarkRun>();
  for (const run of runs) {
    const c = run.testConfig;
    if (
      c.ChainId === 8453 &&
      c.TransactionPayload === 'mainnet-mix' &&
      SCENARIO.test(String(c.Scenario)) &&
      !String(c.BenchmarkRun).endsWith('--latest')
    ) {
      byDir.set(run.outputDir, run);
    }
  }
  return [...byDir.values()];
}

async function loadRun(root: string, meta: BenchmarkRun, fetchImpl: typeof fetch): Promise<Run | null> {
  const get = async (file: string) => {
    const res = await fetchImpl(`${root}${meta.outputDir}/${file}`);
    if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
    return res;
  };
  const [validation, load, provenance] = await Promise.all([
    get('validation.json').then((r) => r.json()),
    get('load-test-result.json').then((r) => r.json()),
    // Only main-tracking runs write provenance.json; for others the host serves its HTML fallback with a 200.
    get('provenance.json').then((r) => r.json().catch(() => null)),
  ]);
  if (provenance?.source?.ref !== 'main') return null;
  const mgas = Number(SCENARIO.exec(String(meta.testConfig.Scenario))![1]);
  const gps: number = load.throughput.gps;
  return {
    outputDir: meta.outputDir,
    mgas,
    gps,
    passed: validation.comparable === true && gps >= PASS_RATIO * mgas * 1e6,
    commit: provenance.source.revision,
    createdAt: Date.parse(meta.createdAt),
  };
}

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
