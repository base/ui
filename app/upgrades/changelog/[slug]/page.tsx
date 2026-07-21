import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Button } from '../../../components/ui/Button';
import { ExternalLinkIcon } from '../../../components/ui/icons';
import { Text } from '../../../components/ui/Text';
import { CategoryBadge, KindBadge, StatusPill } from '../../components/Badges';
import { getChangeBySlug } from '../../data/changes';
import { getVibenetChangeById } from '../../data/vibenet';
import { LIFECYCLE_LABELS } from '../../library/display';

import { ChangeDetailClient } from './ChangeDetailClient';

type ChangePageProps = {
  params: Promise<{ slug: string }>;
};

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

  return (
    <div className="mx-auto w-full max-w-5xl pb-4 text-black">
      <header className="animate-in mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-start">
        <div className="max-w-3xl">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <KindBadge kind={change.kind} />
            <CategoryBadge category={change.category} />
            {vibenetChange ? (
              <StatusPill variant={vibenetChange.vibenet.status}>
                Vibenet {LIFECYCLE_LABELS[vibenetChange.vibenet.status]}
              </StatusPill>
            ) : null}
          </div>
          <Text variant="title1" className="text-balance">
            {change.title}
          </Text>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
          {change.specUrl ? (
            <Button href={change.specUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
              Documentation
              <ExternalLinkIcon />
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
              <ExternalLinkIcon />
            </Button>
          ) : null}
        </div>
      </header>
      <ChangeDetailClient change={change} />
    </div>
  );
}
