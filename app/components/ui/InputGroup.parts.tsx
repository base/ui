'use client';

import type { ComponentProps } from 'react';
import { Input as BaseInput, type InputProps } from '@base-ui/react/input';
import { mergeProps } from '@base-ui/react/merge-props';

import { cn } from './cn';
import { textVariantClasses } from './Text';

type RootProps = ComponentProps<'div'> & {
  // Same role set as react-aria-components Group: semantic group by default,
  // `region` if it belongs in the page outline, `presentation` if visual only.
  role?: 'group' | 'region' | 'presentation';
  disabled?: boolean;
  invalid?: boolean;
};

export function Root({ role = 'group', disabled, invalid, ...props }: RootProps) {
  return (
    <div
      {...mergeProps(
        {
          className: cn(
            'flex items-center rounded-lg outline outline-1 outline-offset-[-1px] outline-bds-gray-10',
            'transition-[outline-color] duration-150 ease-out motion-reduce:transition-none',
            'hover:outline-bds-gray-15',
            'has-[input:focus]:outline-2 has-[input:focus]:outline-foreground',
            'aria-invalid:outline-bds-red-40 has-[input[data-invalid]]:outline-bds-red-40',
            'aria-disabled:opacity-50',
          ),
        },
        props,
        {
          role,
          ...(disabled && { 'aria-disabled': true as const }),
          ...(invalid && { 'aria-invalid': true as const }),
        },
      )}
    />
  );
}

export function Control(props: InputProps) {
  return (
    <BaseInput
      {...mergeProps(
        {
          className: cn(
            'min-w-0 flex-1 bg-transparent py-2.5 outline-none',
            textVariantClasses['label.regular'],
            'text-bds-gray-100 placeholder:text-bds-gray-40',
            'px-1 first:ps-2.5 last:pe-2.5',
            'disabled:cursor-not-allowed',
          ),
        },
        props,
      )}
    />
  );
}
