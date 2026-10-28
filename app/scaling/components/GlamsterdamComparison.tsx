import { Text } from '../../components/ui/Text';
import { DA_WORKLOADS } from '../da/workloads';
import { runHref, successfulTps, type GlamsterdamPair, type Run } from '../proven/capacity';

type Props = {
  configured: boolean;
  comparisons?: GlamsterdamPair[];
  comparisonErrors?: number;
  error?: unknown;
};

const TH = 'px-3 py-2 text-left font-[600] text-bds-gray-60';
const TD = 'border-t border-bds-gray-10 px-3 py-2 align-top dark:border-white/10';
const tps = (run: Run) => successfulTps(run).toLocaleString('en-US', { maximumFractionDigits: 1 });

/** Shows matched Glamsterdam and main benchmark jobs side by side. */
export function GlamsterdamComparisonSection({ configured, comparisons, comparisonErrors = 0, error }: Props) {
  const message = !configured
    ? 'Benchmark source is not configured.'
    : error
      ? 'Could not load Glamsterdam benchmark data.'
      : !comparisons
        ? 'Loading Glamsterdam comparisons…'
        : comparisons.length === 0
          ? comparisonErrors > 0
            ? 'A matching Glamsterdam run could not be loaded; its comparison is omitted.'
            : 'No matching Glamsterdam and main jobs in the last 14 days.'
          : null;

  return (
    <section aria-label="Glamsterdam comparison" className="flex flex-col gap-3">
      <Text as="h2" variant="headline">
        Glamsterdam
      </Text>
      <Text variant="label.regular" tone="muted">
        Compared with main at the same workload and target Mgas/s. TPS counts successful transactions.
      </Text>
      {message ? (
        <Text variant="label.regular" tone="muted">
          {message}
        </Text>
      ) : (
        <>
          {comparisonErrors > 0 ? (
            <Text variant="label.regular" tone="muted">
              Some matching Glamsterdam runs could not be loaded; affected comparisons are omitted.
            </Text>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-bds-gray-10 dark:border-white/10">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-bds-gray-10 dark:border-white/10">
                  <th className={TH}>Workload</th>
                  <th className={TH}>Target</th>
                  <th className={TH}>Glamsterdam job</th>
                  <th className={TH}>Main job</th>
                </tr>
              </thead>
              <tbody>
                {comparisons!.map((comparison) => {
                  const workload = DA_WORKLOADS.find((item) => item.payload === comparison.workload)?.label ?? comparison.workload;
                  return (
                    <tr key={`${comparison.workload}-${comparison.mgas}`}>
                      <td className={TD}>{workload}</td>
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>{comparison.mgas.toLocaleString('en-US')} Mgas/s</td>
                      <td className={TD}>
                        <a className="break-all underline" href={runHref(comparison.glamsterdam)}>
                          {comparison.glamsterdam.id}
                        </a>
                        <span className="mt-1 block whitespace-nowrap tabular-nums text-bds-gray-60">
                          {tps(comparison.glamsterdam)} TPS ·{' '}
                          {(comparison.glamsterdam.gps / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} Mgas/s
                        </span>
                      </td>
                      <td className={TD}>
                        <a className="break-all underline" href={runHref(comparison.main)}>
                          {comparison.main.id}
                        </a>
                        <span className="mt-1 block whitespace-nowrap tabular-nums text-bds-gray-60">
                          {tps(comparison.main)} TPS ·{' '}
                          {(comparison.main.gps / 1e6).toLocaleString('en-US', {
                            maximumFractionDigits: 1,
                          })}{' '}
                          Mgas/s
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
