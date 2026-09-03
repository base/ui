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
            'flex min-w-0 w-full cursor-pointer flex-col gap-1 rounded-xl px-4 py-3 text-left select-none outline-none',
            'ring-1 ring-inset ring-bds-gray-10',
            'transition-[box-shadow] duration-150 ease-out motion-reduce:transition-none',
            'data-[checked]:ring-2 data-[checked]:ring-foreground',
            'data-[unchecked]:data-[hovered]:ring-bds-gray-15',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue',
            'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          ),
        },
        props,
      )}
    />
  );
}

export const Indicator = BaseRadio.Indicator;
