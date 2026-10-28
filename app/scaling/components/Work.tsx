import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { EmptyState } from '../../components/ui/EmptyState';
import { Text } from '../../components/ui/Text';
import { WORK_STATUSES } from '../snapshot.mjs';
import type { WorkRow } from '../linearStatus';
import type { Area, Link, WorkCategory, WorkItem } from '../snapshot.mjs';
import { Info } from './Info';

// Status labels follow Linear's project states.
const STATUS: Record<string, string> = { 'in-progress': 'In Progress', planned: 'Planned', done: 'Completed' };
// Older entries name an area instead of a category.
const CATEGORY: Record<Area, WorkCategory> = { da: 'DA', execution: 'Execution', state: 'Disk', networking: 'Latency' };
const at = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;
const TH = 'px-3 py-2 text-left text-[11px] font-[600] uppercase tracking-wide text-bds-gray-60';
const TD = 'px-3 py-2.5 align-top';

// Links in the entry's order, then its Linear project and evidence when an older entry carries them.
const linksOf = (w: WorkItem): Link[] => {
  const links = [...(w.links ?? [])];
  if (w.linear && !links.some((l) => l.url === w.linear!.url)) links.push({ label: 'Linear', url: w.linear.url });
  if (w.evidence && !links.some((l) => l.url === w.evidence!.url)) links.push(w.evidence);
  return links;
};

// In progress first, then planned, then done; entries with any other status are not shown.
export function Work({ work }: { work: WorkRow[] }) {
  const rows = work.filter((w) => WORK_STATUSES.includes(w.status)).toSorted((a, b) => WORK_STATUSES.indexOf(a.status) - WORK_STATUSES.indexOf(b.status));
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Work log</Text>
      {rows.length === 0 ? (
        <EmptyState description="No work in progress or planned for this snapshot." />
      ) : (
        <Card className="overflow-x-auto bg-background dark:bg-white/5">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-bds-gray-10 dark:border-white/10">
                {['Status', 'Work', 'Impact category', 'Effect', 'Links'].map((h) => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const effect = w.effect ?? w.expected ?? null;
                const about = [w.hypothesis && `Hypothesis: ${w.hypothesis}`, w.change && `Change: ${w.change}`, `Owner: ${w.owner ?? 'none assigned'}`].filter(Boolean);
                const links = linksOf(w);
                return (
                  <tr key={w.title} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                    <td className={cn(TD, 'whitespace-nowrap')}>
                      {/* Live rows show Linear's own status name and progress; the title says where the status came from. */}
                      <span className="rounded-md border border-bds-gray-30 px-1.5 py-px text-[12px] text-bds-gray-70 dark:text-bds-gray-30" title={w.live ? `Live from Linear, ${at(w.live.at)}` : 'From snapshot'}>{w.live?.name ?? STATUS[w.status]}</span>
                      {w.live && w.live.progress > 0 ? <span className="ml-1.5 text-[12px] tabular-nums text-bds-gray-60">{Math.round(w.live.progress * 100)}%</span> : null}
                    </td>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-1">
                        {w.title}
                        <Info label={`About ${w.title}`}>{about.join(' ')}</Info>
                      </span>
                    </td>
                    <td className={cn(TD, 'whitespace-nowrap')}>{w.category ?? (w.area ? CATEGORY[w.area] : '—')}</td>
                    <td className={cn(TD, effect === null && 'text-bds-gray-60')}>{effect ?? 'not measured yet'}</td>
                    <td className={cn(TD, 'whitespace-nowrap')}>
                      {links.length === 0 ? <span className="text-bds-gray-60">—</span> : links.map((l, i) => (
                        <span key={l.url}>
                          {i > 0 ? ' · ' : null}
                          <a className="underline" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
