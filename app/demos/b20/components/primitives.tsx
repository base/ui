'use client';

import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

import { cn } from '../../../components/ui/cn';
import { InfoTooltip } from '../../../components/ui/InfoTooltip';
import { Text, textVariantClasses } from '../../../components/ui/Text';

// Small presentational building blocks shared across the B20 demo modules.

export function Input({ value, onChange, placeholder, className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={cn(
        'h-10 w-full rounded-lg border border-bds-gray-10 bg-white px-3 outline-none transition-colors placeholder:text-bds-gray-40 focus:border-base-blue dark:border-white/10 dark:bg-white/5 dark:text-white',
        textVariantClasses['label.regular'],
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  hint,
  help,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  help?: string;
}) {
  const id = useId();
  const hintNode = hint ? (
    <Text as="span" variant="footnote" tone="muted">
      {hint}
    </Text>
  ) : null;
  // Without help: implicit label association (the control is nested in <label>).
  if (!help) {
    return (
      <label className="flex min-w-0 flex-col gap-1.5">
        <Text as="span" variant="label" tone="muted">
          {label}
        </Text>
        {children}
        {hintNode}
      </label>
    );
  }
  // With help: the tooltip trigger is a <button>, which must not nest inside a
  // <label>. Switch to explicit htmlFor/id association and keep the label text
  // and tooltip in a plain header row above the control.
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className={cn(textVariantClasses.label, 'text-bds-gray-60 dark:text-bds-gray-30')}>
          {label}
        </label>
        <InfoTooltip label={`About ${label}`}>{help}</InfoTooltip>
      </div>
      {control}
      {hintNode}
    </div>
  );
}

export function ModuleHeading({
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="flex items-start justify-between gap-3">
      <div>
        <Text as="h2" variant="title2">
          {title}
        </Text>
        <Text variant="body" tone="muted">
          {description}
        </Text>
      </div>
      {action}
    </section>
  );
}

export function EmptyToken() {
  return (
    <p className="rounded-lg bg-bds-gray-5 p-4 text-[13px] text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-40">
      Choose a token in Policies first, then come back here to use this feature.
    </p>
  );
}

// Inline validation/wallet error for the operator composers, matching the
// inspectError banner — replaces the demo's earlier alert() calls.
export function ErrorNote({ message }: { message: string | null }) {
  return message ? (
    <p
      role="alert"
      className="mt-4 rounded-lg bg-bds-red-0 p-3 text-[13px] text-bds-red-70 dark:bg-bds-red-100/30 dark:text-bds-red-20"
    >
      {message}
    </p>
  ) : null;
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-bds-gray-50">{label}</dt>
      <dd className="max-w-[55%] truncate text-right">{value}</dd>
    </div>
  );
}
