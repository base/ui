'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import type { Rung, Snapshot } from '../snapshot.mjs';
import type { Limit } from './Bottlenecks';
import { Info } from './Info';

const BAR_H = 24;
// Each label is two 12px lines; rows sit GAP_PX from the bar and touch each other, so a second row stays
// within 30px of the bar.
const ROW_PX = 24;
const GAP_PX = 6;
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

export type ProvenMark = { value: number; atLeast: boolean; help: string } | null;

type Tone = 'today' | 'p99' | 'fee' | 'da' | 'disk' | 'gas' | 'proven';
export type Point = { id: string; value: number; valueText: string; name: string; tone: Tone; help: string };
export type PlacedPoint = Point & { x: number; offScale: boolean; side: 'above' | 'below'; tier: number; left: number; width: number; compact: boolean };

const TEXT: Record<Tone, string> = {
  today: 'text-bds-blue-90 dark:text-white',
  p99: 'text-bds-blue-50',
  fee: 'text-bds-gray-60',
  da: 'text-bds-red-60',
  disk: 'text-bds-purple-60',
  gas: 'text-bds-orange-60',
  proven: 'text-base-blue',
};
const TICK: Record<Tone, string> = {
  today: 'border-bds-blue-90 dark:border-white',
  p99: 'border-bds-blue-50',
  fee: 'border-dotted border-bds-gray-60',
  da: 'border-bds-red-60',
  disk: 'border-bds-purple-60',
  gas: 'border-dashed border-bds-orange-60',
  proven: 'border-base-blue',
};
const SHADES = {
  median: 'fill-base-blue bg-base-blue',
  p99: 'fill-bds-blue-30 bg-bds-blue-30',
  allowed: 'fill-bds-blue-10 bg-bds-blue-10 dark:fill-bds-blue-80 dark:bg-bds-blue-80',
  proven: 'fill-bds-gray-10 bg-bds-gray-10 dark:fill-white/10 dark:bg-white/10',
};
const SHORT: Record<string, string> = { 'da-payment': 'DA · payments', 'da-swap': 'DA · swaps', 'da-mix': 'DA · mix (bench)', 'disk-archive': 'archive disk', 'disk-full': 'full-node disk' };

// Approximate label widths: a bold 12px value with its help icon over an 11px name.
const widthOf = (p: Point, offScale: boolean, compact: boolean) =>
  Math.max((p.valueText.length + (offScale ? 2 : 0)) * 7.6 + 24, compact ? 0 : p.name.length * 6) + 2;

// Labels alternate above and below in value order, in one row hugging the bar on each side. A label
// that collides first tries the other side, then a nudge that keeps it over its tick, then drops its
// name (listed under the ladder); only then does it take a second row. Off-scale points sit at the
// right edge without a tick.
export function layoutPoints(points: Point[], max: number, width: number): PlacedPoint[] {
  const ends: Record<'above' | 'below', number[]> = { above: [], below: [] };
  return points.toSorted((a, b) => a.value - b.value).map((p, i) => {
    const offScale = p.value > max;
    const x = offScale ? width : (Math.max(0, p.value) / max) * width;
    const preferred = i % 2 === 0 ? 'above' : 'below';
    const sides = [preferred, preferred === 'above' ? 'below' : 'above'] as const;
    for (let tier = 0; ; tier++) {
      for (const compact of [false, true]) {
        const w = Math.min(width, widthOf(p, offScale, compact));
        const centered = Math.min(Math.max(x - w / 2, 0), width - w);
        for (const nudge of [false, true]) {
          for (const side of sides) {
            const end = ends[side][tier] ?? -Infinity;
            const left = nudge ? Math.max(centered, end + GAP_PX) : centered;
            const clear = left >= end + GAP_PX && left + w <= width && Math.abs(left + w / 2 - x) <= w;
            // A new, empty row always fits, so the loop ends.
            if (clear || end === -Infinity) {
              ends[side][tier] = left + w;
              return { ...p, x, offScale, side, tier, left, width: w, compact };
            }
          }
        }
      }
    }
  });
}

type Props = Pick<Snapshot, 'ladder' | 'windows'> & { proven: ProvenMark; max: number; limits: Limit[] };

export function Ladder({ ladder, windows, proven, max, limits }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);

  const help = (r: Rung) => (r.window ? `${r.help} Window: ${windows[r.window].label}.` : r.help);
  const pct = (v: number) => `${Math.min(1, v / max) * 100}%`;
  const { p50, p99 } = ladder.observed;
  const limit = ladder.configuredLimit.value;
  const median = p50.value;
  const tail = median === null ? null : p99.value;
  const rung = (id: string, r: Rung, name: string, tone: Tone): Point[] => (r.value === null ? [] : [{ id, value: r.value, valueText: n(r.value), name, tone, help: help(r) }]);
  const points: Point[] = [
    ...rung('today', p50, 'today', 'today'),
    ...(tail === null ? [] : rung('p99', p99, 'p99', 'p99')),
    ...rung('fee', ladder.operatingPoint, 'fee target', 'fee'),
    ...rung('gas', ladder.configuredLimit, 'gas limit', 'gas'),
    ...(proven ? [{ id: 'proven', value: proven.value, valueText: `${proven.atLeast ? '≥ ' : ''}${n(proven.value)}`, name: 'proven', tone: 'proven' as const, help: proven.help }] : []),
    // The ranked breaking points from What breaks first; unranked rows have no ceiling to mark.
    ...limits.filter((l) => l.value !== null && SHORT[l.id]).map((l): Point => ({
      id: l.id,
      value: l.value!,
      valueText: l.ceiling,
      name: SHORT[l.id],
      tone: l.id.startsWith('disk-') ? 'disk' : 'da',
      help: l.help ?? l.evidence,
    })),
  ];
  const placed = layoutPoints(points, max, width);
  const tiers = (side: 'above' | 'below') => placed.filter((p) => p.side === side).reduce((h, p) => Math.max(h, (p.tier + 1) * ROW_PX), 0);
  const barTop = tiers('above') + GAP_PX;
  const height = barTop + BAR_H + GAP_PX + tiers('below') + 16;
  const nearEdge = (p: PlacedPoint) => (p.side === 'above' ? barTop - GAP_PX - p.tier * ROW_PX : barTop + BAR_H + GAP_PX + p.tier * ROW_PX);
  const legend = [
    median !== null && ['up to median', SHADES.median],
    tail !== null && ['median to p99', SHADES.p99],
    limit !== null && ['allowed by policy', SHADES.allowed],
    proven && limit !== null && proven.value > limit && ['proven, not yet allowed', SHADES.proven],
  ].filter((l) => !!l);
  const compact = placed.filter((p) => p.compact);

  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">How close are we, and to what? <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <div ref={ref} role="group" aria-label="Usage against policy, breaking points and proven capacity" className="relative" style={{ height }}>
        <svg aria-hidden="true" width="100%" height={height} className="absolute inset-0 overflow-visible">
          <rect width="100%" y={barTop} height={BAR_H} rx={5} className={SHADES.proven} />
          {limit === null ? null : <rect width={pct(limit)} y={barTop} height={BAR_H} rx={5} className={SHADES.allowed} />}
          {tail === null ? null : <rect data-band="p99" width={pct(tail)} y={barTop} height={BAR_H} rx={5} className={SHADES.p99} />}
          {median === null ? null : <rect data-band="p50" width={pct(median)} y={barTop} height={BAR_H} rx={5} className={SHADES.median} />}
        </svg>
        {placed.filter((p) => !p.offScale).map((p) => (
          <span key={p.id} data-tick={p.id} className={cn('absolute w-0 border-l-2', TICK[p.tone])} style={{ left: p.x, top: barTop - 4, height: BAR_H + 8 }} />
        ))}
        {placed.map((p) => {
          const top = p.side === 'above' ? nearEdge(p) - ROW_PX : nearEdge(p);
          return (
            <span key={p.id}>
              {p.tier > 0 && !p.offScale ? (
                <span
                  data-connector={p.id}
                  className={cn('absolute w-0 border-l', TICK[p.tone])}
                  style={p.side === 'above' ? { left: p.x, top: nearEdge(p), height: barTop - nearEdge(p) } : { left: p.x, top: barTop + BAR_H, height: nearEdge(p) - barTop - BAR_H }}
                />
              ) : null}
            <span
              data-label={p.id}
              data-tier={p.tier}
              className={cn('absolute flex flex-col items-center whitespace-nowrap text-center', TEXT[p.tone], p.side === 'above' ? 'justify-end' : 'justify-start')}
              style={{ left: p.left, width: p.width, top, height: ROW_PX }}
            >
              <span className="flex h-3 items-center gap-1 text-[12px] font-[700] leading-3 tabular-nums">
                {p.valueText}{p.offScale ? ' →' : ''}
                <Info label={`About ${p.name}`}>{p.help}</Info>
              </span>
              {p.compact ? null : <span className="text-[11px] leading-3 opacity-80">{p.name}</span>}
            </span>
            </span>
          );
        })}
        <span className="absolute left-0 text-[11px] text-bds-gray-50" style={{ top: height - 14 }}>0</span>
        <span className="absolute right-0 text-[11px] text-bds-gray-50" style={{ top: height - 14 }}>{n(max)} Mgas/s</span>
      </div>
      {compact.length ? (
        <p data-legend="names" className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          {compact.map((p) => <span key={p.id} className={TEXT[p.tone]}><b>{p.valueText}</b> {p.name}</span>)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-bds-gray-60">
        {legend.map(([label, shade]) => (
          <span key={label} className="flex items-center gap-1.5"><span aria-hidden="true" className={cn('h-2.5 w-4 rounded-sm', shade)} />{label}</span>
        ))}
      </div>
    </section>
  );
}
