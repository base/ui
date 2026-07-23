import { Skeleton } from '../../components/ui/Skeleton';

export default function ScheduleLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-4 text-black">
      <div className="max-w-2xl">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>

      <div className="rounded-2xl border border-bds-gray-10 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
