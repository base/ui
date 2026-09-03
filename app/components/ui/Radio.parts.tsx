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
            'flex min-w-0 w-full cursor-pointer flex-col gap-1 rounded-xl px-4 py-3 text-left select-none',
            'outline outline-1 outline-offset-[-1px] outline-bds-gray-10',
            'transition-[outline-color] duration-150 ease-out',
            'data-[checked]:outline-2 data-[checked]:outline-foreground',
            'data-[unchecked]:data-[hovered]:outline-bds-gray-15',
            'focus:outline-2 focus:outline-foreground',
            'focus-visible:outline-2 focus-visible:outline-brand-blue',
            'data-[checked]:focus-visible:outline-brand-blue',
            'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          ),
        },
        props,
      )}
    />
  );
}

export const Indicator = BaseRadio.Indicator;
