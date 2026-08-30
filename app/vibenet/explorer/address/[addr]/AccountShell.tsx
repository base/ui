'use client';

// Shared chrome for the explorer address page: a hero header (avatar + name +
// copyable address + badges + an actions slot) and a horizontal underline tab
// bar. Both the read-only public view and the owned management view render
// inside it, so an address you own and one you don't look like the same page.

import { useCallback, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Tabs } from '../../../../components/ui/Tabs';
import { Text } from '../../../../components/ui/Text';
import { CopyableValue } from '../../../components/CopyableValue';
import { AccountAvatar } from '../../../demos/_shared/primitives';

export type ShellSection = { id: string; label: string };

/**
 * Section selection synced to `?section=`. The URL is the source of truth —
 * `useSearchParams` supplies the active id on the first render (so a deep link
 * does not paint the fallback tab and then animate the pill), and the setter
 * rewrites just that param via `router.replace`. Callers need a Suspense
 * boundary: `useSearchParams` opts the subtree out of static prerendering.
 */
export function useSectionParam({
  valid,
  fallback,
}: {
  valid: string[];
  fallback: string;
}): [string, (next: string) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const requested = searchParams.get('section');
  const section = requested && valid.includes(requested) ? requested : fallback;

  const select = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete('section');
      else params.set('section', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [fallback, pathname, router, searchParams],
  );

  return [section, select];
}

type AccountShellProps = {
  name: string;
  address: string;
  avatarVariant?: 'default' | 'spending';
  badges?: ReactNode;
  actions?: ReactNode;
  sections: ShellSection[];
  activeSection: string;
  onSelectSection: (id: string) => void;
  children: ReactNode;
};

export function AccountShell({
  name,
  address,
  avatarVariant = 'default',
  badges,
  actions,
  sections,
  activeSection,
  onSelectSection,
  children,
}: AccountShellProps) {
  return (
    <div className="animate-in -mb-20 flex min-w-0 flex-1 flex-col gap-6 pb-12 text-foreground">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AccountAvatar variant={avatarVariant} size={52} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Text as="h1" variant="title2" className="truncate">
                {name}
              </Text>
              {badges}
            </div>
            <CopyableValue value={address} className="text-bds-gray-60 dark:text-bds-gray-40" />
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>

      <div className="overflow-x-auto">
        <Tabs
          items={sections.map((s) => ({ value: s.id, label: s.label }))}
          value={activeSection}
          onChange={onSelectSection}
          ariaLabel="Account sections"
        />
      </div>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
