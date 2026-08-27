import { Skeleton } from '../../../components/ui/Skeleton';

export default function UpgradeDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-24 pb-4 text-foreground">
      <div>
        <Skeleton className="mb-4 h-12 w-12 rounded-lg" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-4 w-full max-w-lg" />
        <Skeleton className="mt-2 h-4 w-3/4 max-w-md" />

        <div className="mt-8 flex gap-10">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-16" />
              <div className="mt-1.5 flex items-center gap-1.5">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-6">
          <Skeleton className="h-6 w-40" />
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5"
              >
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-3 h-4 w-full max-w-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
