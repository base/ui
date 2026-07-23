import { Skeleton } from '../../components/ui/Skeleton';

export default function FaucetLoading() {
  return (
    <div className="flex flex-col gap-4 text-black dark:text-white">
      <div className="flex flex-wrap gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>

      <div className="rounded-2xl border border-bds-gray-10 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-1 h-4 w-full max-w-lg" />
        <Skeleton className="mt-4 h-10 w-full rounded-lg" />
        <div className="mt-4 flex flex-wrap gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
