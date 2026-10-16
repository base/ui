import { cn } from '../../../components/ui/cn';
import { formatValue } from '../lib/formatters';
import type { ChartConfig } from '../lib/types';

export type Series = { name: string; stroke: string; dot: string; points: [x: number, y: number][] };

const W = 600;
const H = 140;

export function LineChart({ title, unit, series, xLabel }: { title: string; unit?: ChartConfig['unit']; series: Series[]; xLabel: (x: number) => string }) {
  const drawn = series.filter((s) => s.points.length > 0);
  const all = drawn.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const [x0, x1, y0, y1] = all.reduce(([a, b, c, d], [x, y]) => [Math.min(a, x), Math.max(b, x), Math.min(c, y), Math.max(d, y)], [Infinity, -Infinity, 0, 0]);
  const px = (x: number) => (x1 === x0 ? W / 2 : ((x - x0) / (x1 - x0)) * W);
  const py = (y: number) => (y1 === y0 ? H : H - ((y - y0) / (y1 - y0)) * H);
  return (
    <figure className="flex min-w-0 flex-col gap-1 text-[12px]">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3">
        <span>{title}</span>
        <span className="flex items-center gap-3 text-bds-gray-60">
          {drawn.length > 1 ? drawn.map((s) => <span key={s.name} className="flex items-center gap-1"><span aria-hidden="true" className={cn('h-2 w-2 rounded-full', s.dot)} />{s.name}</span>) : null}
          <span className="font-mono">max {formatValue(y1, unit)}</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title} className="h-[140px] w-full rounded-md border border-bds-gray-10 dark:border-white/10">
        {drawn.map((s) => (
          <polyline key={s.name} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={s.stroke} points={s.points.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} />
        ))}
      </svg>
      <span className="flex justify-between font-mono text-[11px] text-bds-gray-60"><span>{xLabel(x0)}</span><span>{xLabel(x1)}</span></span>
    </figure>
  );
}
