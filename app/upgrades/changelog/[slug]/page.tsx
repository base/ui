import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { CategoryBadge, KindBadge, StatusPill } from '../../components/Badges';
import { Breadcrumb } from '../../components/Breadcrumb';
import { getChangeBySlug } from '../../data/changes';
import { getVibenetChangeById } from '../../data/vibenet';
import { LIFECYCLE_LABELS } from '../../library/display';

import { ChangeDetailClient } from './ChangeDetailClient';

type ChangePageProps = {
  params: Promise<{ slug: string }>;
};

function buildBreadcrumbItems(changeTitle: string) {
  return [
    { href: '/upgrades', label: 'Upgrades' },
    { href: '/upgrades/changelog', label: 'Changelog' },
    { label: changeTitle },
  ];
}

export async function generateMetadata(props: ChangePageProps): Promise<Metadata> {
  const { slug } = await props.params;
  const change = getChangeBySlug(slug);
  if (!change) return {};
  return {
    title: `${change.title} | Base Upgrades`,
    description: change.summary,
    alternates: {
      canonical: `/upgrades/changelog/${change.slug}`,
    },
    openGraph: {
      title: `${change.title} | Base Upgrades`,
      description: change.summary,
      url: `/upgrades/changelog/${change.slug}`,
    },
  };
}

export default async function ChangePage(props: ChangePageProps) {
  const { slug } = await props.params;
  const change = getChangeBySlug(slug);
  if (!change) notFound();

  const vibenetChange = getVibenetChangeById(change.id);

  const breadcrumbItems = buildBreadcrumbItems(change.title);

  return (
    <div className="pb-4 text-black">
      <Breadcrumb items={breadcrumbItems} />
      <header className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-start">
        <div className="max-w-3xl">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <KindBadge kind={change.kind} />
            <CategoryBadge category={change.category} />
            {vibenetChange ? (
              <StatusPill variant={vibenetChange.vibenet.status}>
                Vibenet {LIFECYCLE_LABELS[vibenetChange.vibenet.status]}
              </StatusPill>
            ) : null}
          </div>
          <Text variant="display" className="text-balance">
            {change.title}
          </Text>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
          <div className="flex flex-wrap gap-2 md:justify-end">
            {change.specUrl ? (
              <Button href={change.specUrl} target="_blank" rel="noopener noreferrer" size="sm">
                View docs
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 11L11 5M11 5H6M11 5V10" />
                </svg>
              </Button>
            ) : null}
            {change.kind === 'eip' ? (
              <Button
                href={change.upstreamUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                size="sm"
              >
                Upstream EIP
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 11L11 5M11 5H6M11 5V10" />
                </svg>
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <ChangeDetailClient change={change} />
    </div>
  );
}
