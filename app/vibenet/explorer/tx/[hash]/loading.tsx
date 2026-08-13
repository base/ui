import { Skeleton } from '../../../../components/ui/Skeleton';

export default function TxLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
      </div>

      <div className="rounded-2xl border border-bds-gray-10 bg-background p-6 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-bds-gray-10 bg-background p-6 dark:border-white/10 dark:bg-white/5">
        <Skeleton className="mb-4 h-5 w-28" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
