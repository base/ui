import { Skeleton } from './components/ui/Skeleton';

export default function HomeLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 text-foreground">
      <header className="flex flex-col gap-8 border-b border-bds-gray-10 pb-12">
        <div className="max-w-3xl">
          <Skeleton className="mb-4 h-4 w-20" />
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="mt-2 h-10 w-3/4 max-w-md" />
        </div>
      </header>

      <section>
        <div className="mb-8">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5"
            >
              <Skeleton className="h-5 w-24" />
              <Skeleton className="mt-2 h-4 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
