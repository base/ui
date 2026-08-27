import Link from 'next/link';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { ExternalLinkIcon } from '../../components/ui/icons';
import { Text } from '../../components/ui/Text';
import type { FeatureLink, FeatureStatus, VibenetFeature } from '../library/types';

const STATUS_LABEL: Record<FeatureStatus, string> = {
  live: 'Live',
  preview: 'Preview',
  'coming-soon': 'Coming soon',
};

type FeatureCardProps = {
  feature: VibenetFeature;
};

type LinkButtonProps = {
  link: FeatureLink;
  primary?: boolean;
};

function LinkButton({ link, primary }: LinkButtonProps) {
  const external = link.external ? { target: '_blank', rel: 'noopener' } : {};
  return (
    <Button href={link.href} variant={primary ? 'primary' : 'secondary'} size="sm" {...external}>
      {link.label}
      {link.external ? <ExternalLinkIcon /> : null}
    </Button>
  );
}

// Renders a single feature. With `highlights` it uses the richer two-column
// promo layout; without, a compact card (e.g. dynamic config features).
export function FeatureCard({ feature }: FeatureCardProps) {
  const highlights = feature.highlights ?? [];
  const hasHighlights = highlights.length > 0;
  const links = feature.links ?? [];
  const showStatus = feature.status !== 'live';
  const hasActions =
    Boolean(feature.cta) || Boolean(feature.secondaryCta) || showStatus || links.length > 0;

  return (
    <Card
      className={cn(
        'bg-background p-6 dark:bg-white/5',
        hasHighlights && 'flex flex-col gap-8 md:flex-row',
      )}
    >
      <div className="flex flex-1 flex-col">
        <Text variant="headline">
          {feature.title}
        </Text>
        {feature.summary ? (
          <Text variant="body" tone="muted" className="mt-2 max-w-md">
            {feature.summary}
          </Text>
        ) : null}
        {hasActions ? (
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
            {feature.cta ? <LinkButton link={feature.cta} primary /> : null}
            {feature.secondaryCta ? <LinkButton link={feature.secondaryCta} /> : null}
            {showStatus ? (
              <span className="inline-flex items-center rounded-full border border-bds-gray-10 px-4 py-2 text-[14px] text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40">
                {STATUS_LABEL[feature.status]}
              </span>
            ) : null}
            {links.map((link) => (
              <LinkButton key={link.href} link={link} />
            ))}
          </div>
        ) : null}
        {feature.availability ? (
          <Text variant="footnote" tone="muted" className="mt-5">
            {feature.availability}
            {feature.availabilityHref ? (
              <Link href={feature.availabilityHref} className="text-foreground hover:text-base-blue dark:text-white">
                {feature.availabilityLabel ?? 'Base Cobalt'}
              </Link>
            ) : feature.availabilityLabel ? (
              <span className="text-foreground">{feature.availabilityLabel}</span>
            ) : null}
          </Text>
        ) : null}
      </div>

      {hasHighlights ? (
        <ul className="grid flex-1 grid-cols-2 gap-3">
          {highlights.map((highlight) => (
            <li
              key={highlight.title}
              className="rounded-lg bg-bds-gray-5 p-3 dark:bg-white/5"
            >
              <Text as="span" variant="label.medium" className="block">
                {highlight.title}
              </Text>
              <Text as="span" variant="footnote" tone="muted" className="mt-0.5 block">
                {highlight.detail}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
