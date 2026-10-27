'use client';

import { daWorkloads } from '../da/workloads';
import type { Proven } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { bindingBar, bottleneckBars, Bottlenecks } from './Bottlenecks';
import { Headline } from './Headline';
import { Ladder, type ProvenMark } from './Ladder';
import { day, useProvenCapacity } from './ProvenCapacity';
import { Subsystems } from './Subsystems';

function benchMark({ mgas, atTop, run }: Proven): ProvenMark {
  const top = atTop ? ` ≥ because ${mgas} Mgas/s is the highest rate the bench runs.` : '';
  const help = `Bench-proven: the highest rate whose latest main run in the last 14 days was comparable and delivered ≥ 95% of target. Run ${run.outputDir}, commit ${run.commit.slice(0, 7)}, ${day(run.createdAt)}.${top} Comparable requires every enabled pipeline step to pass; the DA blob target and proof-node lag and latency are recorded, not gated.`;
  return { value: mgas, atLeast: atTop, help };
}

// Sections A–D share one bench fetch and one scale. Without a bench host, the proven rate falls back to
// the snapshot's qualified rung.
export function Scorecard({ snapshot, benchUrl, dashboardUrl }: { snapshot: Snapshot; benchUrl?: string; dashboardUrl?: string }) {
  const bench = useProvenCapacity(benchUrl);
  const data = bench.error ? undefined : bench.data;
  const { ladder } = snapshot;
  const proven = data?.current.mix ?? null;
  const qualified = ladder.qualified;
  const mark = proven ? benchMark(proven) : !benchUrl && qualified.value !== null ? { value: qualified.value, atLeast: false, help: qualified.help } : null;
  const bars = bottleneckBars(daWorkloads(data?.da), proven);
  const values = [ladder.observed.p50, ladder.observed.p99, ladder.operatingPoint, ladder.configuredLimit].map((r) => r.value ?? 0);
  const max = Math.max(mark?.value ?? 0, ladder.configuredLimit.value ?? 0) || Math.max(0, ...values);
  return (
    <>
      <Headline ladder={ladder} windows={snapshot.windows} translations={snapshot.translations} bench={{ configured: !!benchUrl, data, error: bench.error }} proven={mark} bars={bars} binding={bindingBar(bars)} />
      <Ladder ladder={ladder} windows={snapshot.windows} proven={mark} max={max} dashboardUrl={dashboardUrl} />
      <Bottlenecks bars={bars} max={max} p50={ladder.observed.p50.value} limit={ladder.configuredLimit.value} />
      <Subsystems proven={proven} guardrails={snapshot.guardrails} ceilings={snapshot.ceilings} />
    </>
  );
}
