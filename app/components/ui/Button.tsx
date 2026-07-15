import type { ComponentPropsWithoutRef } from 'react';
import Link from 'next/link';

import { cn } from './cn';
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
  primary: 'bg-base-blue text-white hover:bg-[#0000CC] border border-transparent',
  secondary:
    'text-foreground hover:bg-bds-gray-15 bg-bds-gray-10 dark:bg-white/10 dark:hover:bg-white/20',
  outline:
    'text-foreground bg-transparent border border-bds-gray-10 hover:bg-bds-gray-5 dark:border-white/[.12] dark:hover:bg-white/[.06]',
} as const;

const arrowSvg = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    className="transition-transform duration-300 ease-out group-hover:translate-x-[3px]"
  >
    <path d="M7.5 4L13.5 10L7.5 16" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M13.5 10H0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="13.5"
      strokeDashoffset="13.5"
      className="transition-all duration-300 ease-out group-hover:[stroke-dashoffset:0]"
    />
  </svg>
);

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
    sizeClasses = 'h-12 pl-5 pr-4 gap-1';
  } else {
    sizeClasses = 'h-12 pl-5 pr-5 gap-3';
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
        {arrow && arrowSvg}
      </Link>
    );
  }

  return (
    <button type={type === 'submit' ? 'submit' : 'button'} className={classes} {...props}>
      {children}
      {arrow && arrowSvg}
    </button>
  );
}
