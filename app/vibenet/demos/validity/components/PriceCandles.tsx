'use client';

import { scaleLinear } from 'd3';
import { useEffect, useMemo, useState } from 'react';

import { CANDLE_BUCKET_MS, CANDLE_SAMPLE_MS, CANDLE_WINDOW_MS } from '../lib/constants';
import type { Side } from '../lib/types';

const BUY_PLOT = '#22ad73';
const SELL_PLOT = '#ed5966';
const TICKER = '#c8ff4a';
const BUCKET_MS = CANDLE_BUCKET_MS;
const WINDOW_MS = CANDLE_WINDOW_MS;
const WIDTH = 960;
const HEIGHT = 440;
const PAD = { top: 20, right: 20, bottom: 40, left: 68 };

export type PriceSample = { t: number; price: number };

export type PriceLevel = {
  id: string;
  price: number;
  side: Side;
  kind: 'draft' | 'resting';
  highlighted?: boolean;
};

export type Candle = { t: number; o: number; h: number; l: number; c: number };

export function toCandles(
  samples: PriceSample[],
  opts?: { now?: number; windowMs?: number; bucketMs?: number },
): Candle[] {
  if (!samples || samples.length === 0) return [];
  const windowMs = opts?.windowMs ?? WINDOW_MS;
  const bucketMs = opts?.bucketMs ?? BUCKET_MS;
  const lastSample = samples[samples.length - 1].t;
  const now = opts?.now ?? lastSample;
  const end = Math.floor(now / bucketMs) * bucketMs;
  const start = end - windowMs + bucketMs;
  const buckets = new Map<number, Candle>();
  let seed: number | undefined;
  for (const sample of samples) {
    if (!Number.isFinite(sample.price) || sample.price <= 0) continue;
    if (sample.t < start) {
      seed = sample.price;
      continue;
    }
    const bucket = Math.floor(sample.t / bucketMs) * bucketMs;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, { t: bucket, o: sample.price, h: sample.price, l: sample.price, c: sample.price });
      continue;
    }
    existing.h = Math.max(existing.h, sample.price);
    existing.l = Math.min(existing.l, sample.price);
    existing.c = sample.price;
  }
  const stitched: Candle[] = [];
  let prevClose = seed;
  for (let t = start; t <= end; t += bucketMs) {
    const raw = buckets.get(t);
    if (raw) {
      const open = prevClose ?? raw.o;
      stitched.push({
        t,
        o: open,
        h: Math.max(raw.h, open),
        l: Math.min(raw.l, open),
        c: raw.c,
      });
      prevClose = raw.c;
      continue;
    }
    if (prevClose === undefined) continue;
    stitched.push({ t, o: prevClose, h: prevClose, l: prevClose, c: prevClose });
  }
  return stitched;
}

export function isUpCandle(candle: Candle, prev?: Candle): boolean {
  if (candle.c > candle.o) return true;
  if (candle.c < candle.o) return false;
  if (!prev) return true;
  return candle.c >= prev.c;
}

function formatAxisPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.1) return `$${price.toFixed(3)}`;
  return `$${price.toFixed(4)}`;
}

function formatAxisTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function VibeMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="#c8ff4a" />
      <path d="M7 13.5c1.2 2.4 3 3.6 5 3.6s3.8-1.2 5-3.6" fill="none" stroke="#0c1117" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1.2" fill="#0c1117" />
      <circle cx="15" cy="10" r="1.2" fill="#0c1117" />
    </svg>
  );
}

export type FillMark = {
  id: string;
  t: number;
  price: number;
  target: number;
  side: Side;
  highlighted?: boolean;
};

type Props = {
  samples: PriceSample[];
  levels?: PriceLevel[];
  fills?: FillMark[];
};

export function PriceCandles({ samples, levels = [], fills = [] }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CANDLE_SAMPLE_MS);
    return () => window.clearInterval(id);
  }, []);
  const candles = useMemo(() => toCandles(samples ?? [], { now }), [now, samples]);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const visibleLevels = levels.filter((level) => Number.isFinite(level.price) && level.price > 0);
  const visibleFills = fills.filter((fill) => Number.isFinite(fill.price) && fill.price > 0 && fill.t > 0);

  const layout = useMemo(() => {
    if (candles.length === 0) return null;
    let lo = candles[0].l;
    let hi = candles[0].h;
    for (const candle of candles) {
      lo = Math.min(lo, candle.l);
      hi = Math.max(hi, candle.h);
    }
    for (const level of visibleLevels) {
      lo = Math.min(lo, level.price);
      hi = Math.max(hi, level.price);
    }
    for (const fill of visibleFills) {
      lo = Math.min(lo, fill.price, fill.target);
      hi = Math.max(hi, fill.price, fill.target);
    }
    const last = candles[candles.length - 1].c;
    const minSpan = Math.max(last * 0.06, 0.002);
    if (hi - lo < minSpan) {
      const mid = (hi + lo) / 2;
      lo = mid - minSpan / 2;
      hi = mid + minSpan / 2;
    }
    const pad = (hi - lo) * 0.08;
    const yMin = Math.max(lo - pad, 0);
    const yMax = hi + pad;
    const t1 = candles[candles.length - 1].t + BUCKET_MS;
    const t0 = t1 - WINDOW_MS;
    const x = scaleLinear().domain([t0, t1]).range([0, innerW]);
    const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);
    const yTicks = y.ticks(6);
    const xTicks = x.ticks(5);
    return { x, y, yMin, yMax, yTicks, xTicks, last, slot: innerW / (WINDOW_MS / BUCKET_MS) };
  }, [candles, innerH, innerW, visibleFills, visibleLevels]);

  const firstOpen = candles[0]?.o;
  const lastClose = layout?.last;
  const change =
    firstOpen && lastClose ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
  const up = change >= 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-bds-gray-10 bg-[#0c1117] dark:border-white/10">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="flex items-center gap-2">
          <VibeMark />
          <div>
            <div className="font-mono text-[13px] tracking-[0.08em] text-white">VIBE / USDV</div>
            <div className="font-mono text-[11px] text-[#7d8a96]">simulated pool · 5s candles</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[28px] tabular-nums leading-none" style={{ color: TICKER }}>
            {layout ? formatAxisPrice(layout.last) : '—'}
          </div>
          <div className={`mt-1 font-mono text-[12px] tabular-nums ${up ? 'text-[#22ad73]' : 'text-[#ed5966]'}`}>
            {layout ? `${up ? '+' : ''}${change.toFixed(2)}%` : ''}
          </div>
        </div>
      </div>
      {layout ? (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[min(62vh,32rem)] w-full min-h-[380px]" role="img" aria-label="VIBE price in USDV">
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {layout.yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line x1={0} x2={innerW} y1={layout.y(tick)} y2={layout.y(tick)} stroke="#1e2a36" />
                <text
                  x={-8}
                  y={layout.y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#7d8a96"
                  fontSize={11}
                  fontFamily="ui-monospace, monospace"
                >
                  {formatAxisPrice(tick)}
                </text>
              </g>
            ))}
            {layout.xTicks.map((tick) => (
              <text
                key={`x-${tick}`}
                x={layout.x(tick)}
                y={innerH + 22}
                textAnchor="middle"
                fill="#7d8a96"
                fontSize={10}
                fontFamily="ui-monospace, monospace"
              >
                {formatAxisTime(tick)}
              </text>
            ))}
            <text x={innerW} y={-6} textAnchor="end" fill="#7d8a96" fontSize={10} fontFamily="ui-monospace, monospace">
              USDV
            </text>
            {candles.map((candle, index) => {
              const color = isUpCandle(candle, candles[index - 1]) ? BUY_PLOT : SELL_PLOT;
              const cx = layout.x(candle.t + BUCKET_MS / 2);
              const highY = layout.y(candle.h);
              const lowY = layout.y(candle.l);
              const bodyTop = layout.y(Math.max(candle.o, candle.c));
              const bodyBot = layout.y(Math.min(candle.o, candle.c));
              const rawBody = Math.max(bodyBot - bodyTop, 0);
              const doji = rawBody < 0.8;
              const bodyH = doji ? 1.6 : Math.max(rawBody, 2);
              const bodyW = Math.min(Math.max(layout.slot * 0.55, 4), 14);
              return (
                <g key={candle.t}>
                  <line x1={cx} x2={cx} y1={highY} y2={lowY} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
                  <rect
                    x={cx - bodyW / 2}
                    y={doji ? (highY + lowY) / 2 - bodyH / 2 : bodyTop}
                    width={bodyW}
                    height={bodyH}
                    fill={color}
                    rx={0.4}
                  />
                </g>
              );
            })}
            {visibleLevels.map((level) => {
              const y = layout.y(level.price);
              const color = level.side === 'buy' ? BUY_PLOT : SELL_PLOT;
              const draft = level.kind === 'draft';
              return (
                <g key={level.id} opacity={level.highlighted ? 1 : draft ? 0.42 : 0.88}>
                  <line
                    x1={0}
                    x2={innerW}
                    y1={y}
                    y2={y}
                    stroke={color}
                    strokeWidth={level.highlighted ? 1.8 : 1.25}
                    strokeDasharray={draft ? '3 5' : '7 5'}
                    strokeLinecap="round"
                  />
                  <text
                    x={innerW - 2}
                    y={y - 5}
                    textAnchor="end"
                    fill={color}
                    fontSize={10}
                    fontFamily="ui-monospace, monospace"
                  >
                    {draft ? 'draft' : level.side} {formatAxisPrice(level.price)}
                  </text>
                </g>
              );
            })}
            {visibleFills.map((fill) => {
              const cx = layout.x(fill.t);
              const cy = layout.y(fill.price);
              if (cx < -8 || cx > innerW + 8) return null;
              const color = fill.side === 'buy' ? BUY_PLOT : SELL_PLOT;
              const r = fill.highlighted ? 7 : 4.5;
              return (
                <g key={`fill-${fill.id}`} opacity={fill.highlighted ? 1 : 0.8}>
                  {fill.highlighted ? (
                    <line
                      x1={cx}
                      x2={cx}
                      y1={0}
                      y2={innerH}
                      stroke={color}
                      strokeWidth={1}
                      strokeDasharray="3 4"
                      opacity={0.7}
                    />
                  ) : null}
                  <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke={color} strokeWidth={fill.highlighted ? 1.6 : 1} opacity={0.45} />
                  <circle cx={cx} cy={cy} r={r} fill={color} stroke="#0c1117" strokeWidth={1.4} />
                  {fill.highlighted ? (
                    <text
                      x={cx > innerW * 0.62 ? cx - 10 : cx + 10}
                      y={cy - 10}
                      textAnchor={cx > innerW * 0.62 ? 'end' : 'start'}
                      fill={color}
                      fontSize={10}
                      fontFamily="ui-monospace, monospace"
                    >
                      included {formatAxisPrice(fill.price)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <p className="px-4 pb-6 pt-8 text-[13px] text-[#7d8a96]">
          Tape starts once the simulated pool prints a mid.
        </p>
      )}
    </div>
  );
}
