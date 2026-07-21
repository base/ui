import Link from 'next/link';

import { Text } from './Text';

type BreadcrumbProps = {
  parentLabel: string;
  parentHref: string;
  childLabel: string;
};

export function Breadcrumb({ parentLabel, parentHref, childLabel }: BreadcrumbProps) {
  return (
    <span className="flex items-center gap-2">
      <Link href={parentHref} className="no-underline">
        <Text as="span" variant="headline" className="text-bds-gray-40">
          {parentLabel}
        </Text>
      </Link>
      <Text as="span" variant="headline" className="text-bds-gray-30">
        /
      </Text>
      <Text as="span" variant="headline">
        {childLabel}
      </Text>
    </span>
  );
}
