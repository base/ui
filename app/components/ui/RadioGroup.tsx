'use client';

import { RadioGroup as BaseRadioGroup, type RadioGroupProps } from '@base-ui/react/radio-group';
import { mergeProps } from '@base-ui/react/merge-props';

import { cn } from './cn';

export type { RadioGroupProps };

export function RadioGroup(props: RadioGroupProps) {
  return <BaseRadioGroup {...mergeProps({ className: cn('grid w-full gap-3') }, props)} />;
}
