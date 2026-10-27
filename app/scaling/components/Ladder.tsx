'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import type { Rung, Snapshot } from '../snapshot.mjs';
import { Info } from './Info';

const BAR_Y = 50;
const BAR_H = 24;
const ROW_PX = 18;
const CHAR_PX = 7.5;
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

export type ProvenMark = { value: number; atLeast: boolean; help: string } | null;

type Props = Pick<Snapshot, 'ladder' | 'windows'> & { proven: ProvenMark; max: number };
type Label = { id: string; text: string; help: string; x: number; className: string };

const SHADES = {
  median: 'fill-base-blue bg-base-blue',
  p99: 'fill-bds-blue-30 bg-bds-blue-30',
  allowed: 'fill-bds-blue-10 bg-bds-blue-10 dark:fill-bds-blue-80 dark:bg-bds-blue-80',
  proven: 'fill-bds-gray-10 bg-bds-gray-10 dark:fill-white/10 dark:bg-white/10',
};

// Width of a label with its help button, so fanned labels can be kept apart.
const labelPx = (text: string) => text.length * CHAR_PX + 20;

export function Ladder({ ladder, windows, proven, max }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);

  const help = (r: Rung) => (r.window ? `${r.help} Window: ${windows[r.window].label}.` : r.help);
  const frac = (v: number) => Math.min(1, v / max);
  const pct = (v: number) => `${frac(v) * 100}%`;
  const px = (v: number) => frac(v) * width;
  const { p50, p99 } = ladder.observed;
  const limit = ladder.configuredLimit.value;
  const fee = ladder.operatingPoint.value;
  const median = p50.value;
  const tail = median === null ? null : p99.value;

  // p50 and p99 are the shade boundaries; their labels fan out to the right on angled leaders.
  let nextFree = 0;
  const fanned = ([['p50', median, p50], ['p99', tail, p99]] as const).flatMap(([id, value, rung]) => {
    if (value === null) return [];
    const text = `${id} ${n(value)}`;
    const left = Math.min(Math.max(px(value) + 17, nextFree), width - labelPx(text));
    nextFree = left + labelPx(text) + 8;
    return [{ id, value, text, left, help: help(rung) }];
  });
  const usedEnd = tail ?? median ?? 0;
  const below: Label[] = [
    ...(fee === null ? [] : [{ id: 'fee', text: `fee target ${n(fee)}`, help: help(ladder.operatingPoint), x: fee, className: 'text-[12px] text-bds-gray-60' }]),
    ...(limit === null ? [] : [{ id: 'limit', text: `gas limit ${n(limit)}`, help: help(ladder.configuredLimit), x: limit, className: 'text-bds-orange-60' }]),
    ...(proven ? [{ id: 'proven', text: `proven ${proven.atLeast ? '≥ ' : ''}${n(proven.value)}`, help: proven.help, x: proven.value, className: 'font-[600] text-base-blue' }] : []),
  ];
  // Labels under the bar take the first row where they clear the previous label.
  const rowEnds: number[] = [];
  const placedBelow = below.toSorted((a, b) => a.x - b.x).map((l) => {
    const w = labelPx(l.text);
    const left = Math.min(Math.max(px(l.x) - w / 2, 0), width - w);
    let row = rowEnds.findIndex((end) => end + 6 <= left);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = left + w;
    return { ...l, left, row };
  });
  const axisTop = BAR_Y + BAR_H + 10 + Math.max(1, rowEnds.length) * ROW_PX;
  const height = axisTop + 14;
  const captions = [
    limit !== null && limit > usedEnd && { text: 'allowed by policy', from: usedEnd, to: limit, className: 'text-bds-blue-60' },
    proven && limit !== null && proven.value > limit && { text: 'proven, not yet allowed', from: limit, to: proven.value, className: 'text-bds-gray-50' },
  ].filter((c) => !!c);
  const legend = [
    median !== null && ['up to median', SHADES.median],
    tail !== null && ['median to p99', SHADES.p99],
    limit !== null && ['allowed by policy', SHADES.allowed],
    proven && limit !== null && proven.value > limit && ['proven, not yet allowed', SHADES.proven],
  ].filter((l) => !!l);

  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">How close are we, and to what? <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <div ref={ref} role="group" aria-label="Usage against policy and proven capacity" className="relative text-[13px]" style={{ height }}>
        <svg aria-hidden="true" width="100%" height={height} className="absolute inset-0 overflow-visible">
          <rect width="100%" y={BAR_Y} height={BAR_H} rx={5} className={SHADES.proven} />
          {limit === null ? null : <rect width={pct(limit)} y={BAR_Y} height={BAR_H} rx={5} className={SHADES.allowed} />}
          {tail === null ? null : <rect data-band="p99" width={pct(tail)} y={BAR_Y} height={BAR_H} rx={5} className={SHADES.p99} />}
          {median === null ? null : <rect data-band="p50" width={pct(median)} y={BAR_Y} height={BAR_H} rx={5} className={SHADES.median} />}
          {fanned.map((f) => (
            <g key={f.id} className={f.id === 'p50' ? 'stroke-base-blue' : 'stroke-bds-blue-50'}>
              <line x1={px(f.value)} x2={px(f.value)} y1={BAR_Y} y2={38} />
              <line x1={px(f.value)} x2={f.left - 4} y1={38} y2={22} />
            </g>
          ))}
          {fee === null ? null : <path data-notch="fee" d={`M${px(fee)} ${BAR_Y + BAR_H + 2} l-4 6 h8 z`} className="fill-bds-gray-60" />}
          {limit === null ? null : <line x1={pct(limit)} x2={pct(limit)} y1={BAR_Y - 4} y2={BAR_Y + BAR_H + 4} strokeWidth={2} className="stroke-bds-orange-60" />}
          {proven ? <line x1={pct(proven.value)} x2={pct(proven.value)} y1={BAR_Y - 4} y2={BAR_Y + BAR_H + 4} strokeWidth={3} className="stroke-base-blue" /> : null}
        </svg>
        {fanned.map((f) => (
          <span key={f.id} className={cn('absolute flex items-center gap-1 whitespace-nowrap font-[600]', f.id === 'p50' ? 'text-base-blue' : 'text-bds-blue-50')} style={{ left: f.left, top: 10 }}>
            {f.text} <Info label={`About ${f.text}`}>{f.help}</Info>
          </span>
        ))}
        {captions.map((c) => (
          <span key={c.text} className={cn('absolute -translate-x-1/2 whitespace-nowrap text-[12px]', c.className)} style={{ left: pct((c.from + c.to) / 2), top: 30 }}>{c.text}</span>
        ))}
        {placedBelow.map((l) => (
          <span key={l.id} className={cn('absolute flex items-center gap-1 whitespace-nowrap', l.className)} style={{ left: l.left, top: BAR_Y + BAR_H + 10 + l.row * ROW_PX }}>
            {l.text} <Info label={`About ${l.text}`}>{l.help}</Info>
          </span>
        ))}
        <span className="absolute left-0 text-[11px] text-bds-gray-50" style={{ top: axisTop }}>0</span>
        <span className="absolute right-0 text-[11px] text-bds-gray-50" style={{ top: axisTop }}>{n(max)} Mgas/s</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-bds-gray-60">
        {legend.map(([label, shade]) => (
          <span key={label} className="flex items-center gap-1.5"><span aria-hidden="true" className={cn('h-2.5 w-4 rounded-sm', shade)} />{label}</span>
        ))}
      </div>
    </section>
  );
}
