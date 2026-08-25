// Compact count + label pair used in the account config hero (owners, sessions,
// sub-accounts). Ported from the account demo's `Stat`.
export function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[20px] font-medium leading-none text-foreground">{n}</span>
      <span className="text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
        {label}
      </span>
    </div>
  );
}
