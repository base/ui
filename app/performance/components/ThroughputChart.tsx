'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

import type { ThroughputSample } from '../../benchmark/types';
import { formatGps } from '../../benchmark/utils/formatters';
import { Text } from '../../components/ui/Text';

type ThroughputChartProps = {
  samples: ThroughputSample[];
  avgTps: number;
  avgGps: number;
  height?: number;
};

type HoverState = {
  pixelX: number;
  pixelY: number;
  sample: ThroughputSample;
};

const TPS_COLOR = 'var(--bds-blue-60)';
const GPS_COLOR = 'var(--bds-orange-60)';
const GRID_COLOR = 'var(--bds-gray-10)';
const AXIS_COLOR = 'var(--bds-gray-15)';
const MUTED_COLOR = 'var(--bds-gray-60)';
const FOCUS_COLOR = 'var(--bds-gray-50)';
const MARGIN = { top: 16, right: 60, bottom: 36, left: 56 };

export function ThroughputChart({
  samples,
  avgTps,
  avgGps,
  height = 280,
}: ThroughputChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || width === 0 || samples.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    const maxElapsed = d3.max(samples, (d) => d.elapsed_secs) ?? 1;
    const maxTps = d3.max(samples, (d) => d.tps) ?? 1;
    const maxGps = d3.max(samples, (d) => d.gps) ?? 1;

    const x = d3.scaleLinear().domain([0, maxElapsed]).range([0, innerW]);
    const yTps = d3
      .scaleLinear()
      .domain([0, maxTps * 1.05])
      .nice()
      .range([innerH, 0]);
    const yGps = d3
      .scaleLinear()
      .domain([0, maxGps * 1.05])
      .nice()
      .range([innerH, 0]);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    g.append('g')
      .call(d3.axisLeft(yTps).ticks(5).tickSize(-innerW).tickFormat(() => ''))
      .call((sel) => sel.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', GRID_COLOR)
      .attr('stroke-dasharray', '2,3');

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}s`))
      .call((sel) => sel.select('.domain').attr('stroke', AXIS_COLOR))
      .selectAll('text')
      .attr('fill', MUTED_COLOR)
      .attr('font-size', 11);

    g.append('g')
      .call(d3.axisLeft(yTps).ticks(5).tickFormat((d) => `${(d as number).toFixed(0)}`))
      .call((sel) => sel.select('.domain').attr('stroke', AXIS_COLOR))
      .selectAll('text')
      .attr('fill', TPS_COLOR)
      .attr('font-size', 11);

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', -42)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', TPS_COLOR)
      .text('TPS');

    g.append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(
        d3.axisRight(yGps).ticks(5).tickFormat((d) => `${((d as number) / 1e6).toFixed(0)}M`),
      )
      .call((sel) => sel.select('.domain').attr('stroke', AXIS_COLOR))
      .selectAll('text')
      .attr('fill', GPS_COLOR)
      .attr('font-size', 11);

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', innerW + 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', GPS_COLOR)
      .text('Gas/s');

    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', yTps(avgTps))
      .attr('y2', yTps(avgTps))
      .attr('stroke', TPS_COLOR)
      .attr('stroke-opacity', 0.35)
      .attr('stroke-dasharray', '4,4');

    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', yGps(avgGps))
      .attr('y2', yGps(avgGps))
      .attr('stroke', GPS_COLOR)
      .attr('stroke-opacity', 0.35)
      .attr('stroke-dasharray', '4,4');

    const tpsLine = d3
      .line<ThroughputSample>()
      .x((d) => x(d.elapsed_secs))
      .y((d) => yTps(d.tps))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(samples)
      .attr('fill', 'none')
      .attr('stroke', TPS_COLOR)
      .attr('stroke-width', 2)
      .attr('d', tpsLine);

    const gpsLine = d3
      .line<ThroughputSample>()
      .x((d) => x(d.elapsed_secs))
      .y((d) => yGps(d.gps))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(samples)
      .attr('fill', 'none')
      .attr('stroke', GPS_COLOR)
      .attr('stroke-width', 2)
      .attr('d', gpsLine);

    // d3.bisector handles the irregular sample spacing — array index is NOT
    // proportional to elapsed time, so naive index lookup would mismap hover.
    const bisect = d3.bisector<ThroughputSample, number>((d) => d.elapsed_secs).left;
    const focusLine = g
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', FOCUS_COLOR)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('display', 'none');
    const focusTpsDot = g.append('circle').attr('r', 4).attr('fill', TPS_COLOR).style('display', 'none');
    const focusGpsDot = g.append('circle').attr('r', 4).attr('fill', GPS_COLOR).style('display', 'none');

    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mouseleave', () => {
        focusLine.style('display', 'none');
        focusTpsDot.style('display', 'none');
        focusGpsDot.style('display', 'none');
        setHover(null);
      })
      .on('mousemove', function onMove(event) {
        const [mx] = d3.pointer(event, this);
        const xv = x.invert(mx);
        const i = bisect(samples, xv);
        const a = samples[Math.max(0, i - 1)];
        const b = samples[Math.min(samples.length - 1, i)];
        const sample =
          Math.abs(xv - a.elapsed_secs) < Math.abs(xv - b.elapsed_secs) ? a : b;
        const px = x(sample.elapsed_secs);
        focusLine.attr('x1', px).attr('x2', px).style('display', null);
        focusTpsDot.attr('cx', px).attr('cy', yTps(sample.tps)).style('display', null);
        focusGpsDot.attr('cx', px).attr('cy', yGps(sample.gps)).style('display', null);
        setHover({
          pixelX: px + MARGIN.left,
          pixelY: Math.min(yTps(sample.tps), yGps(sample.gps)) + MARGIN.top,
          sample,
        });
      });
  }, [samples, avgTps, avgGps, width, height]);

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} width={width} height={height} role="img" aria-label="Throughput over time" />
      {hover && width > 0 ? (
        <div
          className="pointer-events-none absolute z-10 min-w-[140px] rounded-lg bg-background px-3 py-2 shadow-lg ring-1 ring-black/[0.04] dark:bg-[#1a1a1a] dark:ring-inset dark:ring-[color-mix(in_srgb,#1a1a1a,white_8%)]"
          style={{
            left: Math.min(hover.pixelX + 12, width - 160),
            top: Math.max(hover.pixelY - 8, 0),
          }}
        >
          <Text variant="label.mono" tone="muted">
            t = {hover.sample.elapsed_secs.toFixed(1)}s
          </Text>
          <div className="mt-1 flex items-center gap-x-2">
            <span className="inline-block h-2 w-2 rounded-full bg-bds-blue-60" />
            <Text as="span" variant="footnote">
              {hover.sample.tps.toFixed(1)} TPS
            </Text>
          </div>
          <div className="mt-0.5 flex items-center gap-x-2">
            <span className="inline-block h-2 w-2 rounded-full bg-bds-orange-60" />
            <Text as="span" variant="footnote">
              {formatGps(hover.sample.gps)}
            </Text>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-center gap-x-6">
        <span className="flex items-center gap-x-2">
          <span className="inline-block h-2 w-4 rounded-sm bg-bds-blue-60" />
          <Text as="span" variant="footnote" tone="muted">
            TPS
          </Text>
        </span>
        <span className="flex items-center gap-x-2">
          <span className="inline-block h-2 w-4 rounded-sm bg-bds-orange-60" />
          <Text as="span" variant="footnote" tone="muted">
            Gas/s
          </Text>
        </span>
        <span className="flex items-center gap-x-2">
          <span className="inline-block h-px w-4 border-t border-dashed border-bds-gray-40" />
          <Text as="span" variant="footnote" tone="muted">
            avg
          </Text>
        </span>
      </div>
    </div>
  );
}
