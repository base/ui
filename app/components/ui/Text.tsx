import type { ComponentPropsWithoutRef } from 'react';

import { cn } from './cn';

// Typographic scale ported from mb-base-web so migrated Upgrades markup keeps
// its variants in both color modes.
type TextVariant =
  | 'display'
  | 'stats'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'label'
  | 'label.medium'
  | 'label.regular'
  | 'label.mono'
  | 'caption'
  | 'button'
  | 'footnote';

type TextTone = 'default' | 'muted' | 'inverse' | 'inverseMuted' | 'inherit';

type TextProps = ComponentPropsWithoutRef<'p'> & {
  // Rendered element. Defaults to <p>; use "span" for inline/button labels and
  // "div" for rich HTML bodies that may contain block tags (<ul>, <p>, ...).
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3';
  variant?: TextVariant;
  tone?: TextTone;
};

export const textVariantClasses: Record<TextVariant, string> = {
  display:
    'text-[36px] sm:text-[40px] md:text-[56px] leading-[40px] sm:leading-[48px] md:leading-[64px] font-base font-[400] tracking-[-0.04em]',
  stats:
    'text-[24px] sm:text-[32px] md:text-[40px] leading-[28px] sm:leading-[36px] md:leading-[48px] font-base font-[400] tracking-[0px]',
  title1:
    'text-[28px] md:text-[36px] leading-[34px] md:leading-[44px] font-base font-[400] tracking-tight',
  title2:
    'text-[20px] md:text-[24px] leading-[28px] md:leading-[32px] font-base font-[400] tracking-tight',
  title3:
    'text-[18px] md:text-[20px] leading-[26px] md:leading-[28px] font-base font-[400] tracking-tight',
  headline:
    'text-[16px] leading-[24px] font-base font-[400] tracking-tight',
  body: 'text-[15px] md:text-[16px] leading-[140%] font-base-text font-[400] tracking-[0px]',
  label:
    'text-[13px] md:text-[14px] leading-[18px] md:leading-[20px] font-base font-[400] tracking-[-0.01em]',
  'label.medium':
    'text-[13px] md:text-[14px] leading-[18px] md:leading-[20px] font-base font-[400] tracking-[0px]',
  'label.regular':
    'text-[13px] md:text-[14px] leading-[20px] font-base-text font-[400] tracking-[0px]',
  'label.mono':
    'text-[13px] md:text-[14px] leading-[18px] md:leading-[20px] font-mono font-[400] tracking-[0px]',
  caption:
    'text-[11px] md:text-[12px] leading-[14px] md:leading-[16px] font-[500] tracking-[0px] uppercase',
  button: 'text-[15px] md:text-[16px] leading-[140%] font-base font-[400] tracking-[-0.01em]',
  footnote: 'text-[11px] md:text-[12px] leading-[14px] md:leading-[16px] font-[400] tracking-[0px]',
};

const textToneClasses: Record<TextTone, string> = {
  default: 'text-foreground',
  muted: 'text-bds-gray-60',
  inverse: 'text-white dark:text-white',
  inverseMuted: 'text-neutral-300 dark:text-neutral-300',
  inherit: '',
};

export function Text({
  as: Component = 'p',
  className = '',
  variant = 'body',
  tone = 'default',
  ...props
}: TextProps) {
  return (
    <Component
      className={cn(textVariantClasses[variant], textToneClasses[tone], className)}
      {...props}
    />
  );
}
