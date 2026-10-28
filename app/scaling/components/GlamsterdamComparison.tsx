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
const rate = (run: Run) => (run.gps / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 });
const tpsGap = (comparison: GlamsterdamPair) =>
  Math.abs(successfulTps(comparison.main) - successfulTps(comparison.glamsterdam)).toLocaleString('en-US', {
    maximumFractionDigits: 1,
  });

/** Shows Glamsterdam runs beside the closest-TPS main run for the same workload. */
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
            : 'No Glamsterdam and main jobs for the same workload in the last 14 days.'
          : null;

  return (
    <section aria-label="Glamsterdam comparison" className="flex flex-col gap-3">
      <Text as="h2" variant="headline">
        Glamsterdam
      </Text>
      <Text variant="label.regular" tone="muted">
        Latest run per target in the last 14 days; each Glamsterdam run is paired with the closest successful-TPS main run for the same workload. Targets are independent; TPS excludes reverted transactions.
      </Text>
      {message ? (
        <Text variant="label.regular" tone="muted">
          {message}
        </Text>
      ) : (
        <>
          {comparisonErrors > 0 ? (
            <Text variant="label.regular" tone="muted">
              Some Glamsterdam runs could not be loaded; affected comparisons are omitted.
            </Text>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-bds-gray-10 dark:border-white/10">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-bds-gray-10 dark:border-white/10">
                  <th className={TH}>Workload</th>
                  <th className={TH}>Glamsterdam job</th>
                  <th className={TH}>Main job · closest TPS</th>
                  <th className={TH}>TPS gap</th>
                </tr>
              </thead>
              <tbody>
                {comparisons!.map((comparison) => {
                  const workload = DA_WORKLOADS.find((item) => item.payload === comparison.workload)?.label ?? comparison.workload;
                  return (
                    <tr key={`${comparison.glamsterdam.outputDir}-${comparison.glamsterdam.mgas}`}>
                      <td className={TD}>{workload}</td>
                      {[comparison.glamsterdam, comparison.main].map((run) => (
                        <td className={TD} key={`${run.outputDir}-${run.mgas}`}>
                          <a className="break-all underline" href={runHref(run)}>
                            {run.id}
                          </a>
                          <span className="mt-1 block whitespace-nowrap tabular-nums text-bds-gray-60">
                            Target: {run.mgas.toLocaleString('en-US')} Mgas/s
                          </span>
                          <span className="block whitespace-nowrap tabular-nums text-bds-gray-60">
                            {tps(run)} TPS · {rate(run)} Mgas/s actual
                          </span>
                        </td>
                      ))}
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>{tpsGap(comparison)} TPS</td>
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
