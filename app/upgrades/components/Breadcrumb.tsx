import Link from 'next/link';

import { Text } from '../../components/ui/Text';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.href ?? item.label} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link href={item.href}>
                  <Text
                    variant="label"
                    tone="muted"
                    className="transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Text>
                </Link>
              ) : (
                <Text variant="label" tone={isLast ? 'default' : 'muted'}>
                  {item.label}
                </Text>
              )}
              {!isLast ? (
                <Text variant="label" tone="muted" aria-hidden>
                  /
                </Text>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
