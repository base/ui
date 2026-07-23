import { Skeleton } from '../components/ui/Skeleton';

export default function UpgradesLoading() {
  return (
    <div className="flex flex-col gap-8 text-black dark:text-white">
      <Skeleton className="h-6 w-40" />
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-bds-gray-10 bg-white p-6 dark:border-white/10 dark:bg-white/5"
          >
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-3 h-4 w-full max-w-lg" />
            <Skeleton className="mt-2 h-4 w-2/3 max-w-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
