import { Skeleton } from '../../components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="-mb-20 flex min-h-[calc(100vh-116px)] flex-col gap-10 pb-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
            <Skeleton className="h-4 w-48" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
