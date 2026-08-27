import { Skeleton } from '../components/ui/Skeleton';

// Mirrors the real page's structure (sync banner + configuration card) so the swap
// from skeleton to loaded content is a quiet fill-in rather than one layout being
// replaced by a different one. Keep the wrappers in sync with SnapshotsClient.tsx.
export default function SnapshotsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-col gap-3 rounded-xl border border-bds-gray-10 bg-bds-gray-5 pt-5">
        <div className="px-4 pb-2 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
            <div className="shrink-0">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-1.5 h-4 w-72 max-w-full" />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-bds-gray-10 bg-background px-3 py-2 xl:w-full xl:max-w-[420px]">
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>

        <div className="-mx-px -mb-px flex flex-col rounded-xl border border-bds-gray-10 bg-background p-4 sm:p-6">
          <Skeleton className="mb-6 h-6 w-36" />

          <section>
            <div className="mb-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-xl border border-bds-gray-10 px-4 py-3">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="mt-1.5 h-4 w-40" />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-4 flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-1.5 h-4 w-80 max-w-full" />
              </div>
              <Skeleton className="h-8 w-[128px] rounded-full" />
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col rounded-xl border border-bds-gray-10 px-4 py-3.5">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="mt-2 h-4 w-full" />
                  <Skeleton className="mt-1 h-4 w-2/3" />
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-bds-gray-10 pt-3">
                    {[0, 1, 2].map((j) => (
                      <Skeleton key={j} className="h-4 w-28" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
