'use client';

import { type ReactNode } from 'react';

import { Field as UiField } from '../../../components/ui/Field';
import { InfoTooltip } from '../../../components/ui/InfoTooltip';

export { Input } from '../../../components/ui/Input';

// Demo Field keeps the `label` / `hint` / `help` shorthand used across B20.
// The chrome is the shared Field parts; help stays a tooltip beside the label
// because that trigger is a button and must not nest inside <label>.
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
  return (
    <UiField.Root>
      {help ? (
        <div className="flex items-center gap-1.5">
          <UiField.Label>{label}</UiField.Label>
          <InfoTooltip label={`About ${label}`}>{help}</InfoTooltip>
        </div>
      ) : (
        <UiField.Label>{label}</UiField.Label>
      )}
      {children}
      {hint ? <UiField.Description>{hint}</UiField.Description> : null}
    </UiField.Root>
  );
}

// Inline validation / wallet error, matching the demos' alert styling.
export function ErrorNote({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-4 rounded-lg bg-bds-red-0 p-3 text-[13px] text-bds-red-70">
      {message}
    </p>
  ) : null;
}
