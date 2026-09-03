'use client';

import { Input as BaseInput, type InputProps } from '@base-ui/react/input';
import { mergeProps } from '@base-ui/react/merge-props';

import { cn } from './cn';
import { textVariantClasses } from './Text';

export type { InputProps };

export const inputClassName = cn(
  'w-full rounded-lg bg-transparent py-2.5 ps-2.5 pe-2.5 outline-none',
  textVariantClasses['label.regular'],
  'text-bds-gray-100 placeholder:text-bds-gray-40',
  'ring-1 ring-inset ring-bds-gray-10',
  'transition-[box-shadow] duration-150 ease-out motion-reduce:transition-none',
  'hover:ring-bds-gray-15',
  'focus:ring-2 focus:ring-foreground',
  'aria-invalid:ring-bds-red-40 data-[invalid]:ring-bds-red-40',
  'focus:aria-invalid:ring-bds-red-40',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
);

// Styled Base UI Input. Use InputGroup when the field has addons
// (e.g. a trailing button).
export function Input(props: InputProps) {
  return <BaseInput {...mergeProps({ className: inputClassName }, props)} />;
}
