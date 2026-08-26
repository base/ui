import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { ActivityLog } from '../../account/components/ActivityLog';
import type { ActivityEntry, StoredAccount } from '../../account/library/model';

// The account demo's activity history, shown in the page flow beneath every
// module rather than in the shared bottom drawer — the B20 modules narrate
// multi-transaction flows, so the log has to stay readable alongside them
// without covering the form that started them. The entries themselves come
// from the account engine, so both demos read one trail.
export function Activity({ activity, accounts }: { activity: ActivityEntry[]; accounts: StoredAccount[] }) {
  return (
    <Card className="bg-background p-4 dark:bg-white/5">
      <div className="flex items-center justify-between">
        <div>
          <Text variant="headline">Recent activity</Text>
          <Text variant="footnote" tone="muted">
            See what this demo did during your current visit.
          </Text>
        </div>
        <Text as="span" variant="footnote" tone="muted">
          {activity.length
            ? `${activity.length} activity item${activity.length === 1 ? '' : 's'}`
            : '● Your activity will appear here'}
        </Text>
      </div>
      {activity.length ? (
        <div className="mt-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
          <ActivityLog activity={activity} accounts={accounts} />
        </div>
      ) : null}
    </Card>
  );
}
