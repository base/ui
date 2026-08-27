import Link from 'next/link';

import { Text } from './Text';

type BreadcrumbSegment = {
  label: string;
  href: string;
};

type BreadcrumbProps = {
  parentLabel: string;
  parentHref: string;
  childLabel: string;
  middle?: BreadcrumbSegment;
};

export function Breadcrumb({ parentLabel, parentHref, childLabel, middle }: BreadcrumbProps) {
  const backHref = middle?.href ?? parentHref;
  return (
    <span className="relative flex w-full items-center justify-center">
      <Link
        href={backHref}
        className="group absolute left-0 flex h-8 w-8 items-center justify-center rounded-full text-bds-gray-40 no-underline transition-colors hover:text-foreground"
        aria-label="Go back"
      >
        <svg width={16} height={16} viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}>
          <path d="M7.5 4L13.5 10L7.5 16" stroke="currentColor" strokeWidth={1.5} />
          <path
            d="M13.5 10H0"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="13.5"
            strokeDashoffset="13.5"
            className="transition-[stroke-dashoffset] duration-200 ease-out group-hover:[stroke-dashoffset:0]"
          />
        </svg>
      </Link>
      <span className="flex items-center gap-2">
        <Link href={parentHref} className="no-underline">
          <Text as="span" variant="headline" className="text-bds-gray-40">
            {parentLabel}
          </Text>
        </Link>
        <Text as="span" variant="headline" className="text-bds-gray-30">
          /
        </Text>
        {middle ? (
          <>
            <Link href={middle.href} className="no-underline">
              <Text as="span" variant="headline" className="text-bds-gray-40">
                {middle.label}
              </Text>
            </Link>
            <Text as="span" variant="headline" className="text-bds-gray-30">
              /
            </Text>
          </>
        ) : null}
        <Text as="span" variant="headline">
          {childLabel}
        </Text>
      </span>
    </span>
  );
}
