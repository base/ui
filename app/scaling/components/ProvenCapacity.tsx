'use client';

import useSWR from 'swr';

import { Text } from '../../components/ui/Text';
import { loadProvenCapacity, type ProvenCapacity as Capacity } from '../proven/capacity';
import { LineChart } from '../runs/components/LineChart';

export type Bench = Capacity & { now: number };

export const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const mgas = (m: number | null) => (m === null ? 'none' : `${m} Mgas/s`);

export function useProvenCapacity(benchUrl?: string) {
  return useSWR(benchUrl ? ['scaling-proven-capacity', benchUrl] : null, async (): Promise<Bench> => {
    const now = Date.now();
    return { ...(await loadProvenCapacity(benchUrl!, fetch, now)), now };
  }, { revalidateOnFocus: false });
}

export function ProvenCapacity({ data, error }: { data?: Bench; error?: unknown }) {
  return error ? <Text variant="label.regular" tone="muted">Could not load bench results. The bench host is reachable only on VPN and must allow this origin via CORS.</Text>
    : !data ? <Text variant="label.regular" tone="muted">Loading bench results…</Text>
    : <Result capacity={data} />;
}

function Result({ capacity: { current, history, unknown, now } }: { capacity: Bench }) {
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
      <Text variant="label.regular" tone="muted">
        Qualified by {run.outputDir}: {run.mgas} Mgas/s run delivered {(run.gps / 1e6).toFixed(1)} Mgas/s · commit{' '}
        <a className="font-mono underline" href={`https://github.com/base/base/commit/${run.commit}`}>{run.commit.slice(0, 7)}</a> · {day(run.createdAt)}
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
