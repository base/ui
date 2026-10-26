import { cn } from '../../components/ui/cn';
import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import { BLOB_MAX, BLOB_TARGET, bindingWorkload, daCapacity, DA_WORKLOADS, fmt } from '../da/workloads';
import { Tag } from './Tag';

const TH = 'px-4 py-2 text-right text-[12px] font-[500] text-bds-gray-60 first:text-left';
const TD = 'whitespace-nowrap px-4 py-3 text-right font-mono first:text-left first:font-sans';

// The DA ceiling card's body: one aligned row per workload instead of the generic input list.
export function DaWorkloadRows() {
  const binding = bindingWorkload();
  const row = 'grid grid-cols-[1fr_2.75rem_3rem] items-baseline gap-x-2 py-1 text-right';
  return (
    <ul className="flex max-w-[22rem] flex-col text-[12px]">
      <li className={cn(row, 'pb-0.5 text-[11px] text-bds-gray-60')}><span /><span>Mgas/s</span><span>tx/s</span></li>
      {DA_WORKLOADS.map((w) => {
        const { mgasPerSecond, txPerSecond } = daCapacity(w, BLOB_TARGET);
        return (
          <li key={w.label} className={cn(row, 'border-t border-bds-gray-10 dark:border-white/10')}>
            <span className={cn('whitespace-nowrap text-left', w === binding && 'font-[500]')}>{w.label}</span>
            <span className="font-mono">{w.tag === 'estimated' ? '~' : ''}{fmt(mgasPerSecond)}</span>
            <span className="text-bds-gray-60">{fmt(txPerSecond)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function DaWorkloads({ observedP50 }: { observedP50: number | null }) {
  const binding = bindingWorkload();
  const rows = DA_WORKLOADS.map((w) => ({ w, target: daCapacity(w, BLOB_TARGET), max: daCapacity(w, BLOB_MAX) }));
  const scale = 1.1 * Math.max(...rows.map((r) => r.max.mgasPerSecond), observedP50 ?? 0);
  const pct = (v: number) => `${(v / scale) * 100}%`;
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">DA capacity by workload <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <Text variant="label.regular" tone="muted">
        Gas per second at which each workload&apos;s batches fill Ethereum&apos;s {BLOB_TARGET}-blob target; the pale bar is the {BLOB_MAX}-blob max.
        Full blobs, no margin.
      </Text>
      <Card className="flex flex-col gap-4 bg-background p-4 dark:bg-white/5">
        <div className="flex flex-col gap-3 pt-5">
          {rows.map(({ w, target, max }, i) => (
            <div key={w.label} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3 text-[13px] sm:grid-cols-[10rem_1fr_8rem]">
              <span>{w.label}</span>
              <div className="relative h-5 rounded-sm bg-bds-gray-10 dark:bg-white/10">
                <div className="absolute inset-y-0 left-0 rounded-sm bg-base-blue" style={{ width: pct(max.mgasPerSecond), opacity: 0.15 }} />
                <div
                  className="absolute inset-y-0 left-0 rounded-sm bg-base-blue"
                  style={{ width: pct(target.mgasPerSecond), opacity: w === binding ? 1 : 0.45 }}
                />
                {observedP50 === null ? null : (
                  <div className="absolute -inset-y-1 border-l border-dashed border-bds-gray-60" style={{ left: pct(observedP50) }}>
                    {i === 0 ? <span className="absolute -top-5 left-1 whitespace-nowrap text-[11px] text-bds-gray-60">observed p50 {fmt(observedP50)}</span> : null}
                  </div>
                )}
              </div>
              <span className="font-mono">{fmt(target.mgasPerSecond)} <span className="hidden text-bds-gray-60 sm:inline">(max {fmt(max.mgasPerSecond)})</span></span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-bds-gray-10 dark:border-white/10">
                {['Workload', 'Bytes / tx', 'Gas / tx', 'Bytes / gas', 'tx/s', 'Mgas/s', 'Source'].map((h) => <th key={h} className={cn(TH, h === 'Source' && 'text-left')}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ w, target }) => (
                <tr key={w.label} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                  <td className={TD}>
                    {w.label} {w === binding ? <span className="ml-1 rounded-md bg-base-blue px-2 py-0.5 text-[12px] text-white">Binding</span> : null}
                  </td>
                  <td className={TD}>{w.tag === 'estimated' ? '~' : ''}{fmt(w.bytesPerTx)}</td>
                  <td className={TD}>{fmt(w.gasPerTx)}</td>
                  <td className={TD}>{(w.bytesPerTx / w.gasPerTx).toFixed(5)}</td>
                  <td className={TD}>{fmt(target.txPerSecond)}</td>
                  <td className={TD}>{fmt(target.mgasPerSecond)}</td>
                  <td className={cn(TD, 'text-left font-sans')}>
                    <Tag tag={w.tag} />{' '}
                    {w.source ? (
                      <a className="underline" href={w.source.url} target="_blank" rel="noreferrer">{w.source.label}</a>
                    ) : (
                      <span className="text-bds-gray-60">bench <code className="font-mono">{w.benchWorkload}</code>, pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
