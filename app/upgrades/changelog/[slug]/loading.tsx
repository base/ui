import { Skeleton } from '../../../components/ui/Skeleton';

export default function ChangeDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl pb-4 text-foreground">
      <header className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-start">
        <div className="max-w-3xl">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <Skeleton className="h-8 w-full max-w-lg" />
          <Skeleton className="mt-2 h-8 w-2/3 max-w-sm" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-3/4 max-w-lg" />
        <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
    </div>
  );
}
