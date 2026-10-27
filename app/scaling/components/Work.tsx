import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { EmptyState } from '../../components/ui/EmptyState';
import { Text } from '../../components/ui/Text';
import type { Area, WorkItem } from '../snapshot.mjs';
import { Info } from './Info';

const LIMIT: Record<Area, string> = { da: 'DA', execution: 'Execution', state: 'State', networking: 'Networking' };
const TD = 'px-3 py-2.5 align-top';

// Work on the binding limit's area comes first; the rest keep the snapshot's order.
export function Work({ work, binding }: { work: WorkItem[]; binding: Area | null }) {
  const rows = work.toSorted((a, b) => Number(b.area === binding) - Number(a.area === binding));
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Work by limit</Text>
      {rows.length === 0 ? (
        <EmptyState description="No current work supplied for this snapshot." />
      ) : (
        <Card className="overflow-x-auto bg-background dark:bg-white/5">
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {rows.map((w) => {
                const link = w.linear?.url ?? w.links[0]?.url ?? w.evidence?.url;
                return (
                  <tr key={w.title} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                    <td className={cn(TD, 'whitespace-nowrap', w.area === binding && 'text-bds-red-60')}>{LIMIT[w.area]}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-1">
                        {link ? <a className="underline" href={link} target="_blank" rel="noreferrer">{w.title}</a> : w.title}
                        <Info label={`About ${w.title}`}>
                          <p>Hypothesis: {w.hypothesis}</p>
                          <p>Change: {w.change}</p>
                          <p>Owner: {w.owner ?? 'none assigned'}</p>
                        </Info>
                      </span>
                    </td>
                    <td className={cn(TD, !w.expected && 'text-bds-gray-60')}>{w.expected ?? 'not estimated'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Text variant="footnote" tone="muted">Expected effects are not summed.</Text>
    </section>
  );
}
