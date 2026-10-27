'use client';

import { daWorkloads } from '../da/workloads';
import type { Proven } from '../proven/capacity';
import type { Area, Snapshot } from '../snapshot.mjs';
import { bottleneckBars, Bottlenecks, diskLimits, pickStorage, rankLimits, type Limit } from './Bottlenecks';
import { Guardrails } from './Guardrails';
import { Headline } from './Headline';
import { Ladder, type ProvenMark } from './Ladder';
import { day, useProvenCapacity } from './ProvenCapacity';
import { Work } from './Work';
import { WorkloadSubsystems } from './WorkloadSubsystems';

function benchMark({ mgas, atTop, run }: Proven): ProvenMark {
  const top = atTop ? ` ≥ because ${mgas} Mgas/s is the highest rate the bench runs.` : '';
  const help = `Bench-proven: the highest rate whose latest main run in the last 14 days was comparable and delivered ≥ 95% of target. Run ${run.outputDir}, commit ${run.commit.slice(0, 7)}, ${day(run.createdAt)}.${top} Comparable requires every enabled pipeline step to pass; the DA blob target and proof-node lag and latency are recorded, not gated.`;
  return { value: mgas, atLeast: atTop, help };
}

const at = (t: number) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const areaOf = (limit: Limit | null): Area | null => (!limit ? null : limit.id.startsWith('da-') ? 'da' : limit.id.startsWith('disk-') ? 'state' : 'execution');

function Freshness({ snapshot, latestAt }: { snapshot: Snapshot; latestAt: number | null }) {
  const usageWindow = snapshot.usage?.transactionsPerSecond.window ?? snapshot.ladder.observed.p50.window;
  const slos = snapshot.guardrails.flatMap((g) => (g.asOf ? [Date.parse(g.asOf)] : []));
  const parts = [
    `Usage to ${day(Date.parse(usageWindow ? snapshot.windows[usageWindow].end : snapshot.collectedAt))}`,
    latestAt !== null && `bench ${at(latestAt)}`,
    slos.length > 0 && `SLOs ${day(Math.max(...slos))}`,
  ].filter(Boolean);
  return <p className="-mt-8 text-[12px] text-bds-gray-60">{parts.join(' · ')}</p>;
}

// Every section shares one bench fetch and the Mgas/s scale. Without a bench host, the proven rate
// falls back to the snapshot's qualified rung.
export function Scorecard({ snapshot, benchUrl }: { snapshot: Snapshot; benchUrl?: string }) {
  const bench = useProvenCapacity(benchUrl);
  const data = bench.error ? undefined : bench.data;
  const { ladder } = snapshot;
  const proven = data?.current.mix ?? null;
  const qualified = ladder.qualified;
  const mark = proven ? benchMark(proven) : !benchUrl && qualified.value !== null ? { value: qualified.value, atLeast: false, help: qualified.help } : null;
  const workloads = daWorkloads(data?.da);
  const limits = rankLimits(bottleneckBars(workloads, proven), workloads, proven, diskLimits(pickStorage(data), snapshot));
  const next = limits[0]?.value != null ? limits[0] : null;
  const values = [ladder.observed.p50, ladder.observed.p99, ladder.operatingPoint, ladder.configuredLimit].map((r) => r.value ?? 0);
  const max = Math.max(mark?.value ?? 0, ladder.configuredLimit.value ?? 0) || Math.max(0, ...values);
  return (
    <>
      <Freshness snapshot={snapshot} latestAt={data?.latestAt ?? null} />
      <Headline ladder={ladder} usage={snapshot.usage} bench={{ configured: !!benchUrl, data, error: bench.error }} proven={mark} next={next} limits={limits} />
      <Ladder ladder={ladder} windows={snapshot.windows} proven={mark} max={max} />
      <Bottlenecks limits={limits} max={max} gasLimit={ladder.configuredLimit.value} proven={proven} />
      <WorkloadSubsystems current={data?.current} />
      <Guardrails guardrails={snapshot.guardrails} collectedAt={snapshot.collectedAt} benchUrl={benchUrl} />
      <Work work={snapshot.work} binding={areaOf(next)} />
    </>
  );
}
