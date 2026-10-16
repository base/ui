import { cn } from '../../components/ui/cn';
import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import { formatTime } from '../loadSnapshot';
import type { Section, Snapshot } from '../snapshot.mjs';

const TH = 'px-4 py-2 text-left text-[12px] font-[500] text-bds-gray-60';
const TD = 'px-4 py-3 align-top';
const STATUS: Record<string, string> = {
  observed: 'Observed', partial: 'Partial', unavailable: 'Unavailable', 'not-measured': 'Not measured',
};

export function SectionTable({ section, windows }: { section: Section; windows: Snapshot['windows'] }) {
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">{section.title}</Text>
      <Text variant="label.regular" tone="muted">{section.summary}</Text>
      <Card className="overflow-x-auto bg-background dark:bg-white/5">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-bds-gray-10 dark:border-white/10">
              {['Metric', 'Value', 'Status', 'Window', 'Query', 'Source'].map((h) => <th key={h} className={TH}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {section.metrics.map((m) => {
              const window = m.window ? windows[m.window] : null;
              return (
                <tr key={m.label} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                  <td className={TD}>{m.label}<p className="text-bds-gray-60">{m.note}</p></td>
                  <td className={cn(TD, 'whitespace-nowrap font-mono')}>
                    {m.value === null ? '—' : `${m.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${m.unit}`.trim()}
                  </td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{STATUS[m.status]}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{window ? <>{window.label}<p className="text-bds-gray-60">{formatTime(window.start)} → {formatTime(window.end)}</p></> : '—'}</td>
                  <td className={TD}>{m.query ? <code className="break-all font-mono text-[12px]">{m.query}</code> : '—'}</td>
                  <td className={TD}>
                    {m.source ? <a className="underline" href={m.source.url} target="_blank" rel="noreferrer">{m.source.label}</a> : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {section.gaps.length > 0 ? (
        <div className="rounded-lg border border-dashed border-bds-gray-10 px-4 py-3 dark:border-white/10">
          <Text variant="label" tone="muted">Missing evidence</Text>
          <ul className="mt-1 list-disc pl-5 text-[13px] text-bds-gray-60">
            {section.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
