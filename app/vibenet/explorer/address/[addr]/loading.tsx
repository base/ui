import { Skeleton } from '../../../../components/ui/Skeleton';

export default function AddressLoading() {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero header */}
      <div className="flex flex-col gap-6 border-b border-bds-gray-10 pb-8 dark:border-white/10">
        <div className="flex items-center gap-4">
          <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
      </div>

      {/* Nav + content */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="hidden flex-col gap-2 md:flex">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <div className="rounded-2xl border border-bds-gray-10 bg-background p-6 dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-20 shrink-0" />
                <Skeleton className="h-4 w-full max-w-xs" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
