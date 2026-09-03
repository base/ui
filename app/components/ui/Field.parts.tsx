'use client';

import type { ComponentProps } from 'react';
import { Field as BaseField } from '@base-ui/react/field';
import { mergeProps } from '@base-ui/react/merge-props';

import { textVariantClasses } from './Text';

export function Root(props: ComponentProps<typeof BaseField.Root>) {
  return (
    <BaseField.Root
      {...mergeProps({ className: 'flex w-full flex-col gap-1.5' }, props)}
    />
  );
}

export function Label(props: ComponentProps<typeof BaseField.Label>) {
  return (
    <BaseField.Label
      {...mergeProps(
        { className: `${textVariantClasses['label.medium']} select-none text-bds-gray-60` },
        props,
      )}
    />
  );
}

export function Description(props: ComponentProps<typeof BaseField.Description>) {
  return (
    <BaseField.Description
      {...mergeProps(
        { className: `${textVariantClasses['label.regular']} text-bds-gray-40` },
        props,
      )}
    />
  );
}

export function Error(props: ComponentProps<typeof BaseField.Error>) {
  return (
    <BaseField.Error
      {...mergeProps(
        { className: `${textVariantClasses['label.regular']} text-bds-red-40` },
        props,
      )}
    />
  );
}

export const Control = BaseField.Control;
export const Validity = BaseField.Validity;
export const Item = BaseField.Item;
