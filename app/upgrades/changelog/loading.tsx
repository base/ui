import { Skeleton } from '../../components/ui/Skeleton';

export default function ChangelogLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-4 text-black">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Skeleton className="h-10 w-full rounded-lg" />

      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-bds-gray-10 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5"
          >
            <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
