import { cn } from './cn';
import { Text } from './Text';

type SectionHeadingProps = {
  eyebrow?: string;
  eyebrowClassName?: string;
  title: string;
  description?: string;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function SectionHeading({
  eyebrow,
  eyebrowClassName,
  title,
  description,
  className,
  titleClassName,
  descriptionClassName,
}: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {eyebrow ? (
        <Text variant="label" tone="inherit" className={cn('text-base-blue', eyebrowClassName)}>
          {eyebrow}
        </Text>
      ) : null}
      <Text variant="title1" className={titleClassName}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="muted" className={descriptionClassName}>
          {description}
        </Text>
      ) : null}
    </div>
  );
}
