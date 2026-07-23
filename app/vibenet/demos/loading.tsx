import { Skeleton } from '../../components/ui/Skeleton';

export default function DemosLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-bds-gray-10 bg-white p-6 dark:border-white/10 dark:bg-white/5"
        >
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="mt-3 h-6 w-48" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-1 h-4 w-3/4" />
          <div className="mt-4 flex flex-col gap-2">
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex items-center gap-2">
                <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
