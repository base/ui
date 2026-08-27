'use client';

import { scaleLinear } from 'd3';
import { useMemo, useRef } from 'react';

import { WAD } from '../lib/constants';
import { formatPrice, priceWad } from '../lib/predicates';
import { ammPriceFromQuote, USDV_SYMBOL, VIBE_SYMBOL } from '../lib/quote';
import type { PlacedOrder, Rectangle, Reserves, Side } from '../lib/types';

// Plot is always dark; pin light-theme greens/reds so they stay vivid on #0c1117.
const BUY_PLOT = '#22ad73';
const SELL_PLOT = '#ed5966';

function sidePlotColor(side: Side): string {
  return side === 'buy' ? BUY_PLOT : SELL_PLOT;
}

type Props = {
  reserves: Reserves | null;
  hoverPriceWad: bigint | null;
  draft: { priceWad: bigint; side: Side; rectangle: Rectangle } | null;
  orders: PlacedOrder[];
  highlightedOrderId: string | null;
  vibeToken0: boolean;
  onHover: (priceWad: bigint | null) => void;
};

function hyperbolaPoints(r0: number, r1: number, xMin: number, xMax: number, count = 80): Array<[number, number]> {
  const k = r0 * r1;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const x = xMin * Math.pow(xMax / xMin, t);
    const y = k / x;
    if (Number.isFinite(y) && y > 0) points.push([x, y]);
  }
  return points;
}

function toTokens(amount: bigint): number {
  return Number(amount) / 1e18;
}

function recencyOpacity(orders: PlacedOrder[], order: PlacedOrder): number {
  const ranked = [...orders].sort((a, b) => a.submittedAt - b.submittedAt);
  const index = ranked.findIndex((item) => item.id === order.id);
  const newest = ranked.length <= 1 ? 1 : Math.max(index, 0) / Math.max(ranked.length - 1, 1);
  const statusMul = order.status === 'pending' ? 1 : order.status === 'filled' ? 0.78 : 0.48;
  return (0.2 + 0.8 * newest) * statusMul;
}

export function ReserveChart({
  reserves,
  hoverPriceWad,
  draft,
  orders,
  highlightedOrderId,
  vibeToken0,
  onHover,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const width = 960;
  const height = 560;
  const pad = { top: 28, right: 24, bottom: 56, left: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const layout = useMemo(() => {
    if (!reserves || reserves.reserve0 === 0n || reserves.reserve1 === 0n) return null;
    const r0 = toTokens(reserves.reserve0);
    const r1 = toTokens(reserves.reserve1);
    const xMin = r0 * 0.45;
    const xMax = r0 * 1.7;
    const yMin = r1 * 0.45;
    const yMax = r1 * 1.7;
    const x = scaleLinear().domain([xMin, xMax]).range([0, innerW]);
    const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);
    const curve = hyperbolaPoints(r0, r1, xMin, xMax)
      .map(([px, py]) => `${x(px).toFixed(1)},${y(py).toFixed(1)}`)
      .join(' ');
    const spot = priceWad(reserves.reserve0, reserves.reserve1);
    const quote = vibeToken0 || spot === 0n ? spot : (WAD * WAD) / spot;
    return { r0, r1, x, y, curve, spot, quote };
  }, [innerH, innerW, reserves, vibeToken0]);

  const priceAt = (clientX: number, clientY: number): bigint | null => {
    if (!layout || !svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * width;
    const sy = ((clientY - rect.top) / rect.height) * height;
    const dx = sx - pad.left;
    const dy = sy - pad.top;
    if (dx < 0 || dy < 0 || dx > innerW || dy > innerH) return null;
    const rx = layout.x.invert(dx);
    const ry = layout.y.invert(dy);
    if (rx <= 0 || ry <= 0) return null;
    const amm = BigInt(Math.round((ry / rx) * 1e18));
    if (!vibeToken0) {
      if (amm === 0n) return null;
      return (WAD * WAD) / amm;
    }
    return amm;
  };

  const rectanglePath = (rect: Rectangle) => {
    if (!layout) return '';
    const [x0, x1] = layout.x.domain() as [number, number];
    const [y0, y1] = layout.y.domain() as [number, number];
    const left = Math.max(toTokens(rect.r0Min), x0);
    const right = Math.min(toTokens(rect.r0Max), x1);
    const bottom = Math.max(toTokens(rect.r1Min), y0);
    const top = Math.min(toTokens(rect.r1Max), y1);
    if (left >= right || bottom >= top) return '';
    return `M ${layout.x(left)} ${layout.y(bottom)} H ${layout.x(right)} V ${layout.y(top)} H ${layout.x(left)} Z`;
  };

  const painted = [...orders].sort((a, b) => {
    if (a.id === highlightedOrderId) return 1;
    if (b.id === highlightedOrderId) return -1;
    return a.submittedAt - b.submittedAt;
  });

  const hoverAmmWad = hoverPriceWad
    ? ammPriceFromQuote(hoverPriceWad, vibeToken0)
    : null;
  const hoverIsBuy = hoverPriceWad !== null && layout !== null && hoverPriceWad <= layout.quote;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-bds-gray-10 bg-[#0c1117] dark:border-white/10">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-[min(56vh,30rem)] w-full min-h-[420px]"
        role="img"
        aria-label="Constant-product reserve curve with the price-condition box overlaid."
        onMouseLeave={() => onHover(null)}
        onMouseMove={(event) => onHover(priceAt(event.clientX, event.clientY))}
      >
        <defs>
          <pattern id="validity-hatch-buy" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="8" stroke={BUY_PLOT} strokeOpacity="0.45" strokeWidth="1.5" />
          </pattern>
          <pattern id="validity-hatch-sell" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="8" stroke={SELL_PLOT} strokeOpacity="0.45" strokeWidth="1.5" />
          </pattern>
          <filter id="validity-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={width} height={height} fill="#0c1117" />
        {layout ? (
          <g transform={`translate(${pad.left},${pad.top})`}>
            {Array.from({ length: 6 }, (_, i) => {
              const gx = (innerW / 5) * i;
              const gy = (innerH / 5) * i;
              return (
                <g key={i} stroke="#1e2a36">
                  <line x1={gx} y1={0} x2={gx} y2={innerH} />
                  <line x1={0} y1={gy} x2={innerW} y2={gy} />
                </g>
              );
            })}
            {painted.map((order) => {
              const highlighted = order.id === highlightedOrderId;
              const opacity = highlighted ? 1 : recencyOpacity(orders, order);
              return (
                <path
                  key={order.id}
                  d={rectanglePath(order.rectangle)}
                  fill={`url(#validity-hatch-${order.side})`}
                  fillOpacity={highlighted ? 0.7 : 0.35 + opacity * 0.35}
                  stroke={sidePlotColor(order.side)}
                  strokeOpacity={highlighted ? 1 : 0.4 + opacity * 0.55}
                  strokeWidth={highlighted ? 2.4 : 1}
                  filter={highlighted ? 'url(#validity-glow)' : undefined}
                />
              );
            })}
            {draft ? (
              <path
                d={rectanglePath(draft.rectangle)}
                fill={`url(#validity-hatch-${draft.side})`}
                fillOpacity={0.4}
                stroke={sidePlotColor(draft.side)}
                strokeDasharray="4 3"
                strokeWidth={1.25}
              />
            ) : null}
            <polyline
              fill="none"
              stroke="#4d9eff"
              strokeWidth={2.4}
              points={layout.curve}
              strokeLinejoin="round"
            />
            <line
              x1={layout.x(layout.x.domain()[0])}
              y1={layout.y(layout.x.domain()[0] * (Number(layout.spot) / 1e18))}
              x2={layout.x(layout.x.domain()[1])}
              y2={layout.y(layout.x.domain()[1] * (Number(layout.spot) / 1e18))}
              stroke="#f5c542"
              strokeWidth={1}
              strokeDasharray="5 4"
              opacity={0.85}
            />
            <circle
              cx={layout.x(layout.r0)}
              cy={layout.y(layout.r1)}
              r={6}
              fill="#f5c542"
              stroke="#0c1117"
              strokeWidth={2}
            />
            {hoverAmmWad ? (
              <line
                x1={0}
                y1={layout.y(layout.x.domain()[0] * (Number(hoverAmmWad) / 1e18))}
                x2={innerW}
                y2={layout.y(layout.x.domain()[1] * (Number(hoverAmmWad) / 1e18))}
                stroke="#ffffff"
                strokeOpacity={0.35}
                strokeDasharray="3 3"
              />
            ) : null}
            <text x={0} y={-8} fill="#7d8a96" fontSize={11} fontFamily="ui-monospace, monospace">
              {vibeToken0 ? USDV_SYMBOL : VIBE_SYMBOL}
            </text>
            <text x={innerW} y={innerH + 28} textAnchor="end" fill="#7d8a96" fontSize={11} fontFamily="ui-monospace, monospace">
              {vibeToken0 ? VIBE_SYMBOL : USDV_SYMBOL}
            </text>
          </g>
        ) : (
          <text x={width / 2} y={height / 2} textAnchor="middle" fill="#7d8a96" fontSize={14}>
            Deploy the pool to see the curve
          </text>
        )}
      </svg>
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#7d8a96]">
          x · y = k
        </span>
        <span className="font-mono text-[22px] tabular-nums text-[#f5c542]">
          {layout ? `$${formatPrice(layout.quote)}` : '—'}
        </span>
        <span className="text-[12px] text-[#9aa8b5]">
          USDV per VIBE · condition box
        </span>
      </div>
      {hoverPriceWad ? (
        <div
          className="pointer-events-none absolute bottom-4 right-4 rounded-md bg-black/55 px-2 py-1 font-mono text-[12px]"
          style={{ color: hoverIsBuy ? BUY_PLOT : SELL_PLOT }}
        >
          {hoverIsBuy ? 'buy VIBE <= ' : 'sell VIBE >= '}
          ${formatPrice(hoverPriceWad)}
        </div>
      ) : null}
    </div>
  );
}
