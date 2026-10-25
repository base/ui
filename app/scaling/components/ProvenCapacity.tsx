'use client';

import useSWR from 'swr';

import { Text } from '../../components/ui/Text';
import { loadProvenCapacity, type ProvenCapacity as Capacity } from '../proven/capacity';
import { LineChart } from '../runs/components/LineChart';

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const mgas = (m: number | null) => (m === null ? 'none' : `${m} Mgas/s`);

export function ProvenCapacity({ benchUrl, dashboardUrl }: { benchUrl?: string; dashboardUrl?: string }) {
  const { data, error } = useSWR(benchUrl ? ['scaling-proven-capacity', benchUrl] : null, async () => {
    const now = Date.now();
    return { ...(await loadProvenCapacity(benchUrl!, fetch, now)), now };
  }, { revalidateOnFocus: false });
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Proven capacity (bench)</Text>
      {!benchUrl ? <Text variant="label.regular" tone="muted">Bench results not configured (SCALING_BENCH_BASE_URL)</Text>
        : error ? <Text variant="label.regular" tone="muted">Could not load bench results. The bench host is reachable only on VPN and must allow this origin via CORS.</Text>
        : !data ? <Text variant="label.regular" tone="muted">Loading bench results…</Text>
        : <Result capacity={data} />}
      {dashboardUrl ? <Text variant="label.regular" tone="muted"><a className="underline" href={dashboardUrl}>Mainnet load, gas limit, DA ceiling →</a></Text> : null}
    </section>
  );
}

function Result({ capacity: { current, history, unknown, now } }: { capacity: Capacity & { now: number } }) {
  // A run whose files failed to load is skipped, so an older result at its rate may count instead.
  const partial = unknown.length ? <Text variant="label.regular" tone="muted">{unknown.length} run(s) could not be loaded, so this result may be wrong.</Text> : null;
  if (!current) return partial ?? <Text variant="label.regular" tone="muted">No main run passed in the last 14 days.</Text>;
  const { run } = current;
  const y = (m: number | null) => (m ?? 0) * 1e6;
  const points = history.flatMap((s, i): [number, number][] => (i ? [[s.at, y(history[i - 1].mgas)], [s.at, y(s.mgas)]] : [[s.at, y(s.mgas)]]));
  points.push([now, y(current.mgas)]);
  return (
    <>
      {partial}
      <Text variant="stats" className="font-mono">{current.atTop ? '≥ ' : ''}{current.mgas} <span className="text-[16px] text-bds-gray-60">Mgas/s</span></Text>
      <Text variant="label.regular" tone="muted">
        {run.mgas} Mgas/s run delivered {(run.gps / 1e6).toFixed(1)} Mgas/s · commit{' '}
        <a className="font-mono underline" href={`https://github.com/base/base/commit/${run.commit}`}>{run.commit.slice(0, 7)}</a> · {day(run.createdAt)}
        <br />
        Rule: the highest rate whose latest main run in the last 14 days was comparable and delivered ≥ 95% of target.
      </Text>
      <LineChart title="Proven capacity over time" unit="gas/s" xLabel={day}
        series={[{ name: 'proven', stroke: 'stroke-base-blue', dot: 'bg-base-blue', points }]} />
      <ul className="flex flex-col gap-1 text-[13px]">
        {history.map((s, i) => (
          <li key={s.at} className="flex gap-2">
            <span className="font-mono text-bds-gray-60">{day(s.at)}</span>
            <span>{i ? `${mgas(history[i - 1].mgas)} → ` : ''}{mgas(s.mgas)}</span>
            {s.compareUrl ? <a className="underline" href={s.compareUrl}>compare</a> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
