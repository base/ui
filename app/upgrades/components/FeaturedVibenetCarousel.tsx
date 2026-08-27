import { LinkCard } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { EmptyState } from '../../components/ui/EmptyState';
import { Text } from '../../components/ui/Text';
import type { VibenetChange } from '../data/vibenet';
import { CATEGORY_METADATA, LIFECYCLE_LABELS } from '../library/display';
import { formatShortDate, toPlainText } from '../library/format';

import { KindBadge, StatusPill } from './Badges';
import { Carousel } from './Carousel';

type FeaturedVibenetCarouselProps = {
  changes: VibenetChange[];
};

export function FeaturedVibenetCarousel({ changes }: FeaturedVibenetCarouselProps) {
  return (
    <Carousel
      perView={3}
      emptyState={<EmptyState description="No featured Vibenet changes yet." className="p-6" />}
    >
      {changes.map((change) => (
        <LinkCard
          key={change.id}
          href={`/upgrades/changelog/${change.slug}`}
          className="group flex h-full w-full flex-col overflow-hidden bg-background dark:bg-white/5"
        >
          <div
            className={cn(
              'relative h-44 w-full overflow-hidden',
              change.image ? '' : CATEGORY_METADATA[change.category].accentClassName,
            )}
            style={
              change.image
                ? {
                    backgroundImage: `url(${change.image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <div className="absolute left-3 top-3">
              <KindBadge kind={change.kind} />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3 p-5">
            <Text
              variant="headline"
              className="line-clamp-2 transition-colors group-hover:text-base-blue"
            >
              {change.title}
            </Text>
            <Text variant="label.regular" tone="muted" className="line-clamp-3">
              {toPlainText(change.summary)}
            </Text>
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10">
              <StatusPill variant={change.vibenet.status}>
                {LIFECYCLE_LABELS[change.vibenet.status]}
              </StatusPill>
              <Text variant="footnote" tone="muted" className="font-mono">
                {change.vibenet.timestamp ? formatShortDate(change.vibenet.timestamp) : 'Vibenet'}
              </Text>
            </div>
          </div>
        </LinkCard>
      ))}
    </Carousel>
  );
}
