import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CommandLine } from '../components/ui/CommandLine';
import { Text } from '../components/ui/Text';

import { formatBytes, formatDate, formatNumber, type Snapshot } from './data';

// The archive preset built by the snapshots configurator, hoisted to the
// homepage so a node operator can copy-and-go without opening the full page.
// Mirrors buildDownloadCommand's archive branch in SnapshotsClient.
const ARCHIVE_COMMAND = 'base-reth-node download --chain base --archive --resumable';

// Compact, read-only snapshot of the latest Mainnet archive: headline stats plus
// the ready-to-run download command, with a link out to the configurator for
// anything smaller than a full archive.
export function SnapshotDownloadBox({ snapshot }: { snapshot: Snapshot }) {
  const stats = [
    { label: 'Total Size', value: formatBytes(snapshot.size) },
    { label: 'Block', value: formatNumber(snapshot.block) },
    { label: 'Version', value: snapshot.rethVersion },
    { label: 'Updated', value: formatDate(snapshot.date) },
  ];

  return (
    <Card className="flex flex-col gap-5 bg-background p-6 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <Text variant="headline">Mainnet Archive</Text>
        <span className="rounded-full border border-bds-gray-15 px-2.5 py-0.5 text-[13px] text-bds-gray-60 dark:border-white/15">
          Full historical data
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <Text variant="label.regular" tone="muted">
              {stat.label}
            </Text>
            <Text variant="headline">{stat.value}</Text>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <CommandLine command={ARCHIVE_COMMAND} className="sm:w-3/4" />
        <Button
          href="/snapshots"
          variant="outline"
          size="sm"
          arrow
          className="sm:h-auto sm:w-auto sm:flex-1"
        >
          Customize
        </Button>
      </div>
    </Card>
  );
}
