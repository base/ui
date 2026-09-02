'use client';

import type { ComponentProps } from 'react';
import { Radio as BaseRadio } from '@base-ui/react/radio';
import { mergeProps } from '@base-ui/react/merge-props';

import { cn } from './cn';

export function Root(props: ComponentProps<typeof BaseRadio.Root>) {
  return (
    <BaseRadio.Root
      value={props.value}
      {...mergeProps(
        {
          className: cn(
            'flex min-w-0 w-full cursor-pointer flex-col gap-1 rounded-xl p-3 text-left select-none outline-none',
            'ring-1 ring-inset ring-bds-gray-10',
            'transition-[box-shadow] duration-150 ease motion-reduce:transition-none',
            'data-[checked]:ring-2 data-[checked]:ring-bds-gray-100',
            'data-[hovered]:ring-bds-gray-20',
            'focus-visible:ring-2 focus-visible:ring-brand-blue',
            'data-[checked]:focus-visible:ring-brand-blue',
            'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          ),
        },
        props,
      )}
    />
  );
}

export const Indicator = BaseRadio.Indicator;
