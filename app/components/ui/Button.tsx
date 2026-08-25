import type { ComponentPropsWithoutRef } from 'react';
import Link from 'next/link';

import { cn } from './cn';
import { AnimatedArrowIcon } from './icons';
import { textVariantClasses } from './Text';

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'default' | 'sm';
  arrow?: boolean;
  href?: string;
  target?: string;
  rel?: string;
};

const variantClasses = {
  // The dark Base blue is a light tint, so the label flips to near-black to
  // keep contrast; the hover step darkens in light mode and lifts in dark.
  primary:
    'border border-transparent bg-base-blue text-white hover:bg-[#0000CC] dark:text-black dark:hover:bg-bds-blue-80',
  secondary:
    'text-foreground hover:bg-bds-gray-15 bg-bds-gray-10 dark:bg-white/10 dark:hover:bg-white/20',
  outline:
    'text-foreground bg-transparent border border-bds-gray-10 hover:bg-bds-gray-5 dark:border-white/[.12] dark:hover:bg-white/[.06]',
} as const;

export function Button({
  className = '',
  type = 'button',
  variant = 'primary',
  size = 'default',
  arrow = false,
  href,
  target,
  rel,
  children,
  ...props
}: ButtonProps) {
  let sizeClasses: string;
  if (size === 'sm') {
    sizeClasses = 'h-[34px] px-3 gap-1 pb-px';
  } else if (arrow) {
    sizeClasses = 'h-10 pl-4 pr-3 gap-1';
  } else {
    sizeClasses = 'h-10 px-4 gap-2';
  }

  const classes = cn(
    'group flex whitespace-nowrap w-fit active:scale-[0.96] transition-[background-color,border-color,color,transform] duration-150 ease-out max-w-full items-center justify-center rounded-full font-sans sm:w-auto',
    sizeClasses,
    size === 'sm' ? textVariantClasses.label : textVariantClasses.button,
    'md:leading-[20px]',
    variantClasses[variant],
    className,
  );

  if (href) {
    return (
      <Link href={href} target={target} rel={rel} className={classes}>
        {children}
        {arrow && <AnimatedArrowIcon className="transition-transform duration-200 ease-out group-hover:translate-x-[3px]" />}
      </Link>
    );
  }

  return (
    <button type={type === 'submit' ? 'submit' : 'button'} className={classes} {...props}>
      {children}
      {arrow && <AnimatedArrowIcon className="transition-transform duration-200 ease-out group-hover:translate-x-[3px]" />}
    </button>
  );
}
