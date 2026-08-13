import { Skeleton } from '../../components/ui/Skeleton';

export default function ExplorerLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-12 w-full rounded-xl" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-bds-gray-10 bg-background p-4 dark:border-white/10 dark:bg-white/5"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5"
          >
            <Skeleton className="h-5 w-32" />
            <div className="mt-4 flex flex-col gap-3">
              {[0, 1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
