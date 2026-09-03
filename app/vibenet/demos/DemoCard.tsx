import Image from 'next/image';

import { Card, LinkCard } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';

import type { DemoEntry } from './catalogue';

// Shared demo card used by the Vibenet demos grid and the homepage carousel, so
// the two surfaces can't drift on layout or copy. An available demo links to its
// route; an unavailable one renders a static, dimmed card with a "Coming soon" tag.
export function DemoCard({ demo, className }: { demo: DemoEntry; className?: string }) {
  if (demo.available) {
    return (
      <LinkCard
        href={demo.href}
        interactive={false}
        className={cn(
          'group flex flex-col gap-4 bg-background p-6 transition-colors hover:bg-bds-gray-5 dark:bg-white/5 dark:hover:bg-white/[0.08]',
          className,
        )}
      >
        <DemoCardBody demo={demo} />
      </LinkCard>
    );
  }

  return (
    <Card className={cn('flex flex-col gap-4 bg-background p-6 opacity-60 dark:bg-white/5', className)}>
      <DemoCardBody demo={demo} />
    </Card>
  );
}

function DemoCardBody({ demo }: { demo: DemoEntry }) {
  return (
    <>
      {demo.icon && (
        <Image src={demo.icon} alt="" width={48} height={48} />
      )}
      <div>
        <div className="flex items-center gap-2">
          <Text variant="headline">{demo.title}</Text>
          {!demo.available ? (
            <span className="text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
              Coming soon
            </span>
          ) : null}
        </div>
        <Text variant="label.regular" tone="muted" className="mt-2">
          {demo.summary}
        </Text>
      </div>
      <ul className="mt-auto flex flex-col gap-2 border-t border-bds-gray-10 pt-4 dark:border-white/10">
        {demo.points.map((point) => (
          <li key={point} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-bds-gray-30" aria-hidden="true" />
            <Text as="span" variant="label.regular" tone="muted">
              {point}
            </Text>
          </li>
        ))}
      </ul>
    </>
  );
}
