import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Text } from '../../components/ui/Text';
import type { WorkItem } from '../snapshot.mjs';
import { Info } from './Info';
import { RunEvidence } from './RunEvidence';
import { Tag } from './Tag';

export function Progress({ work }: { work: WorkItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Progress</Text>
      {work.length === 0 ? (
        <EmptyState description="No current work supplied for this snapshot." />
      ) : (
        <Card className="divide-y divide-bds-gray-10 bg-background text-[13px] dark:divide-white/10 dark:bg-white/5">
          {work.map((w) => <Row key={w.title} item={w} />)}
        </Card>
      )}
      <Text variant="footnote" tone="muted">Expected effects are not summed.</Text>
    </section>
  );
}

function Row({ item: w }: { item: WorkItem }) {
  const l = w.linear;
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <span className="flex flex-wrap items-center gap-2">
        <Text as="span" variant="label">{w.title}</Text>
        <Info label={`About ${w.title}`}>
          <p>Hypothesis: {w.hypothesis}</p>
          <p>Change: {w.change}</p>
          <p>Owner: {w.owner ?? 'none assigned'}</p>
        </Info>
        <Tag tag={w.area} />
        <Tag tag={l ? l.state : 'proposed'} />
      </span>
      {l ? (
        <span className="flex items-center gap-2">
          <span
            role="progressbar"
            aria-label={`${l.scopeDone} of ${l.scopeTotal} issues done`}
            aria-valuemin={0}
            aria-valuemax={l.scopeTotal}
            aria-valuenow={l.scopeDone}
            className="h-1.5 w-40 overflow-hidden rounded-full bg-bds-gray-10 dark:bg-white/10"
          >
            <span className="block h-full bg-base-blue" style={{ width: `${l.scopeTotal ? (100 * l.scopeDone) / l.scopeTotal : 0}%` }} />
          </span>
          <span className="font-mono text-[12px] text-bds-gray-60">{l.scopeDone}/{l.scopeTotal}</span>
        </span>
      ) : null}
      <p><span className="text-bds-gray-60">Expected:</span> {w.expected ?? 'Not estimated'}</p>
      {w.evidence && w.realized ? <p><span className="text-bds-gray-60">Realized:</span> {w.realized}</p> : null}
      {w.evidence ? <RunEvidence url={w.evidence.url} /> : null}
      <div className="flex flex-wrap gap-3">
        {[w.evidence, l && { label: 'Linear', url: l.url }, ...w.links].map((link) => link ? (
          <a key={link.url} className="w-fit underline" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
        ) : null)}
      </div>
    </div>
  );
}
