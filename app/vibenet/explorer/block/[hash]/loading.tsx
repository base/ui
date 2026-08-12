import { Skeleton } from '../../../../components/ui/Skeleton';

export default function BlockLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-7 w-36" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
      </div>

      <div className="rounded-2xl border border-bds-gray-10 bg-background p-6 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="mb-3 h-5 w-32" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-bds-gray-10 bg-background px-4 py-3 dark:border-white/10 dark:bg-white/5"
            >
              <Skeleton className="h-4 w-full max-w-xs" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
