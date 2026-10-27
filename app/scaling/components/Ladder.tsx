'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import type { Rung, Snapshot } from '../snapshot.mjs';
import { Info } from './Info';
import { layoutRungs, type Anchor } from './ladderLayout';

const LABEL_PX = 130;
const ROW = 36;
const BAR = 22;
const ALIGN: Record<Anchor, string> = { start: 'items-start text-left', middle: 'items-center text-center', end: 'items-end text-right' };
const SHIFT: Record<Anchor, string> = { start: 'none', middle: 'translateX(-50%)', end: 'translateX(-100%)' };
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

type Marker = { id: string; label: string; value: number; help: string; tick: string; text: string };
export type ProvenMark = { value: number; atLeast: boolean; help: string } | null;

type Props = Pick<Snapshot, 'ladder' | 'windows'> & { proven: ProvenMark; max: number; dashboardUrl?: string };

export function Ladder({ ladder, windows, proven, max, dashboardUrl }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);

  const help = (r: Rung) => (r.window ? `${r.help} Window: ${windows[r.window].label}.` : r.help);
  const mark = (id: string, name: string, r: Rung, tick: string, text = ''): Marker[] =>
    r.value === null ? [] : [{ id, label: `${name} ${n(r.value)}`, value: r.value, help: help(r), tick, text }];
  const { p50, p99 } = ladder.observed;
  const limit = ladder.configuredLimit.value;
  const markers: Marker[] = [
    ...mark('p50', 'p50', p50, 'border-l-2 border-white'),
    ...mark('p99', 'p99', p99, 'border-l border-dashed border-bds-gray-100 dark:border-white'),
    ...mark('operating', 'fee target', ladder.operatingPoint, 'border-l border-dashed border-bds-gray-100 dark:border-white'),
    ...mark('limit', 'gas limit', ladder.configuredLimit, 'border-l-2 border-bds-orange-60', 'text-bds-orange-60'),
    ...(proven
      ? [{ id: 'proven', label: `proven ${proven.atLeast ? '≥ ' : ''}${n(proven.value)}`, value: proven.value, help: proven.help, tick: 'border-l-[3px] border-base-blue', text: 'font-[600] text-base-blue' }]
      : []),
  ];
  const placed = max > 0 ? layoutRungs(markers, max, LABEL_PX / width) : [];
  const depth = (side: string) => 1 + Math.max(-1, ...placed.filter((p) => p.side === side).map((p) => p.tier));
  const above = depth('above');
  const barTop = above * ROW + 6;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const used = p99.value ?? p50.value;
  const bands = [
    used !== null && { label: 'used', className: 'bg-base-blue' },
    limit !== null && { label: 'allowed by policy', className: 'bg-bds-blue-10 dark:bg-bds-blue-80' },
    proven && limit !== null && proven.value > limit && { label: 'proven, not yet allowed', className: 'bg-bds-gray-10 dark:bg-white/10' },
  ].filter((b) => b !== false && b !== null);

  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">How close are we, and to what? <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <div ref={ref} role="group" aria-label="Usage against policy and proven capacity" className="relative" style={{ height: barTop + BAR + 6 + depth('below') * ROW }}>
        <div className="absolute inset-x-0 rounded bg-bds-gray-10 dark:bg-white/10" style={{ top: barTop, height: BAR }} />
        {limit === null ? null : <div className="absolute left-0 rounded bg-bds-blue-10 dark:bg-bds-blue-80" style={{ top: barTop, height: BAR, width: pct(limit) }} />}
        {used === null ? null : <div className="absolute left-0 rounded bg-base-blue" style={{ top: barTop, height: BAR, width: pct(used) }} />}
        {placed.map((p) => {
          const m = markers.find((x) => x.id === p.id)!;
          const top = p.side === 'above' ? (above - 1 - p.tier) * ROW : barTop + BAR + 6 + p.tier * ROW;
          return (
            <div key={m.id}>
              <div className={cn('absolute', m.tick)} style={{ left: `${p.x * 100}%`, top: barTop - 4, height: BAR + 8 }} />
              <div
                className={cn('absolute z-10 flex flex-col', p.side === 'above' ? 'justify-end' : 'justify-start', ALIGN[p.anchor])}
                style={{ left: `${p.x * 100}%`, top, width: LABEL_PX, height: ROW, transform: SHIFT[p.anchor] }}
              >
                <span className={cn('flex items-center gap-1 font-mono text-[12px]', m.text)}>
                  {m.label} <Info label={`About ${m.label}`}>{m.help}</Info>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-bds-gray-60">
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {bands.map((b) => (
            <span key={b.label} className="flex items-center gap-1.5"><span aria-hidden="true" className={cn('h-2.5 w-4 rounded-sm', b.className)} />{b.label}</span>
          ))}
        </span>
        <span className="font-mono">0 – {n(max)} Mgas/s</span>
      </div>
      {dashboardUrl ? <Text variant="label.regular" tone="muted"><a className="underline" href={dashboardUrl}>Mainnet load, gas limit, DA ceiling →</a></Text> : null}
    </section>
  );
}
