'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { deriveBinding, type Rung, type Snapshot } from '../snapshot.mjs';
import { Info } from './Info';
import { Tag } from './Tag';
import { layoutRungs, type Anchor } from './ladderLayout';

const LABEL_PX = 150;
const ROW = 44;
const AXIS = 12;
const AREA_NAME = { da: 'DA', execution: 'execution', state: 'state', networking: 'networking' };
const ALIGN: Record<Anchor, string> = { start: 'items-start text-left', middle: 'items-center text-center', end: 'items-end text-right' };
const SHIFT: Record<Anchor, string> = { start: 'none', middle: 'translateX(-50%)', end: 'translateX(-100%)' };

type Props = Pick<Snapshot, 'ladder' | 'ceilings' | 'translations' | 'windows'>;
type Item = { id: string; label: string; value: number | null; tag: string; help: string; limit?: boolean };

function items({ ladder, ceilings, windows }: Props): Item[] {
  const rung = (id: string, label: string, r: Rung): Item =>
    ({ id, label, value: r.value, tag: r.tag, help: r.window ? `${r.help} Window: ${windows[r.window].label}.` : r.help });
  const binding = deriveBinding(ceilings);
  const ceiling: Item = binding
    ? { id: 'ceiling', label: `Ceiling · ${AREA_NAME[binding.area]}`, value: binding.value, tag: binding.tag, help: binding.help }
    : { id: 'ceiling', label: 'Ceiling', value: null, tag: 'not-modeled', help: `No area ceiling is measured or modeled yet: ${ceilings.map((c) => `${AREA_NAME[c.area]} ${c.tag}`).join(', ')}.` };
  return [
    rung('p50', 'Observed p50', ladder.observed.p50),
    rung('p99', 'Observed p99', ladder.observed.p99),
    rung('operating', 'Operating point', ladder.operatingPoint),
    rung('qualified', 'Qualified sustained', ladder.qualified),
    ceiling,
    { ...rung('limit', 'Configured limit', ladder.configuredLimit), limit: true },
  ];
}

function translation({ gasPerPayment, gasPerSwap }: Snapshot['translations']): string {
  if (!gasPerPayment && !gasPerSwap) return 'Translation to payments/s and swaps/s: constants pending';
  const per = (c: typeof gasPerPayment, noun: string) => (c ? `${Math.round(1e6 / c.value)} ${noun}/s` : `${noun}/s pending`);
  return `1 Mgas/s ≈ ${per(gasPerPayment, 'payments')} ≈ ${per(gasPerSwap, 'swaps')}`;
}

export function Ladder(props: Props) {
  const axisRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(axisRef.current!);
    return () => observer.disconnect();
  }, []);

  const all = items(props);
  const valued = all.flatMap((i) => (i.value === null ? [] : [{ id: i.id, value: i.value }]));
  const max = props.ladder.configuredLimit.value ?? Math.max(0, ...valued.map((v) => v.value));
  const placed = new Map(max > 0 ? layoutRungs(valued, max, LABEL_PX / width).map((p) => [p.id, p]) : []);
  const depth = (side: string) => 1 + Math.max(-1, ...[...placed.values()].filter((p) => p.side === side).map((p) => p.tier));
  const above = depth('above');
  const axisY = above * ROW + AXIS / 2;

  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Capacity ladder <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <div ref={axisRef} className="relative" style={{ height: (above + depth('below')) * ROW + AXIS }}>
        <div className="absolute inset-x-0 h-px bg-bds-gray-30 dark:bg-white/20" style={{ top: axisY }} />
        {all.map((item) => {
          const p = placed.get(item.id);
          if (!p) return null;
          const top = p.side === 'above' ? (above - 1 - p.tier) * ROW : above * ROW + AXIS + p.tier * ROW;
          const left = `${p.x * 100}%`;
          return (
            <div key={item.id}>
              <div
                className={cn('absolute w-px', item.limit ? 'bg-bds-gray-40' : 'bg-base-blue')}
                style={{ left, top: p.side === 'above' ? top + ROW : axisY, height: p.side === 'above' ? axisY - top - ROW : top - axisY }}
              />
              <div
                className={cn('absolute z-10 flex flex-col bg-background', p.side === 'above' ? 'justify-end' : 'justify-start', ALIGN[p.anchor])}
                style={{ left, top, width: LABEL_PX, height: ROW, transform: SHIFT[p.anchor] }}
              >
                <span className="flex items-center gap-1 text-[12px] text-bds-gray-60">
                  {item.label} <Info label={`About ${item.label}`}>{item.help}</Info>
                </span>
                <span className={cn('font-mono text-[13px]', item.limit && 'text-bds-gray-60')}>
                  {item.value!.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  {item.limit ? null : <span className="ml-1 font-sans text-[11px] text-bds-gray-60">{item.tag}</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] empty:hidden">
        {all.filter((item) => !placed.has(item.id)).map((item) => (
          <li key={item.id} className="flex items-center gap-1.5">
            <span className="text-bds-gray-60">{item.label}</span>
            <Tag tag={item.tag} />
            <Info label={`About ${item.label}`}>{item.help}</Info>
          </li>
        ))}
      </ul>
      {props.ladder.qualified.evidence?.length ? (
        <Text variant="label.regular" tone="muted">
          <span className="flex flex-wrap gap-x-3">Qualified sustained by {props.ladder.qualified.evidence.map((l) => <a key={l.url} className="underline" href={l.url}>{l.label}</a>)}</span>
        </Text>
      ) : null}
      <Text variant="label.regular" tone="muted">{translation(props.translations)}</Text>
    </section>
  );
}
