import { Skeleton } from '../components/ui/Skeleton';

export default function VibenetLoading() {
  return (
    <div className="flex flex-col gap-16 text-black dark:text-white">
      <header className="flex flex-col gap-4 pb-4 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="flex max-w-xl flex-1 flex-col gap-6">
          <Skeleton className="mt-4 h-16 w-16 rounded-lg" />
          <div>
            <Skeleton className="h-7 w-full max-w-lg" />
            <Skeleton className="mt-2 h-7 w-3/4 max-w-sm" />
          </div>
        </div>
        <div className="rounded-2xl border border-bds-gray-10 bg-white p-5 dark:border-white/10 dark:bg-white/5 md:min-w-[360px]">
          <Skeleton className="mb-3 h-5 w-36" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4 h-9 w-28 rounded-lg" />
        </div>
      </header>

      <section className="flex flex-col gap-6">
        <Skeleton className="h-6 w-24" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-bds-gray-10 bg-white p-6 dark:border-white/10 dark:bg-white/5"
            >
              <Skeleton className="h-5 w-56" />
              <Skeleton className="mt-3 h-4 w-full max-w-md" />
              <Skeleton className="mt-2 h-4 w-3/4 max-w-sm" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
