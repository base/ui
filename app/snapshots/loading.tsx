import { Skeleton } from '../components/ui/Skeleton';

export default function SnapshotsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>

      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-2xl border border-bds-gray-10 bg-white p-5 dark:border-white/10 dark:bg-white/5"
          >
            <Skeleton className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-full max-w-md" />
              <Skeleton className="mt-1 h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
