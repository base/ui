import { Skeleton } from '../../../../components/ui/Skeleton';

export default function AddressLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-full max-w-sm" />
      </div>

      <div className="rounded-2xl border border-bds-gray-10 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-20 shrink-0" />
              <Skeleton className="h-4 w-full max-w-xs" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="mb-3 h-5 w-20" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-bds-gray-10 bg-white p-4 dark:border-white/10 dark:bg-white/5"
            >
              <Skeleton className="h-4 w-full max-w-[200px]" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-5 w-16 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
