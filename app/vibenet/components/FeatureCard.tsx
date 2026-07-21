import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
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
    <Button href={link.href} variant={primary ? 'secondary' : 'outline'} size="sm" {...external}>
      {link.external ? `${link.label} ↗` : link.label}
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
  const hasActions = Boolean(feature.cta) || showStatus || links.length > 0;

  return (
    <Card
      className={cn(
        'bg-white p-6 dark:bg-white/5',
        hasHighlights && 'flex flex-col gap-8 md:flex-row',
      )}
    >
      <div className="flex-1">
        {feature.tag ? (
          <span className="inline-flex rounded-full border border-bds-blue-15 bg-bds-blue-0 px-2.5 py-1 font-mono text-[11px] uppercase leading-none tracking-[0px] text-bds-blue-60 dark:border-bds-blue-80 dark:bg-bds-blue-100/40 dark:text-bds-blue-20">
            {feature.tag}
          </span>
        ) : null}
        <Text variant="title3" className={cn(feature.tag && 'mt-3')}>
          {feature.title}
        </Text>
        {feature.summary ? (
          <Text variant="body" tone="muted" className="mt-2 max-w-md">
            {feature.summary}
          </Text>
        ) : null}
        {feature.availability ? (
          <Text variant="footnote" tone="muted" className="mt-3 font-mono">
            {feature.availability}
          </Text>
        ) : null}
        {hasActions ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {feature.cta ? <LinkButton link={feature.cta} primary /> : null}
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
      </div>

      {hasHighlights ? (
        <ul className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          {highlights.map((highlight) => (
            <li
              key={highlight.title}
              className="rounded-lg border border-bds-gray-10 bg-bds-gray-0 p-3 dark:border-white/10 dark:bg-white/5"
            >
              <span className="block text-[14px] font-medium text-black dark:text-white">
                {highlight.title}
              </span>
              <span className="mt-0.5 block text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                {highlight.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
