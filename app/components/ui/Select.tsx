'use client';

import * as RadixSelect from '@radix-ui/react-select';

import { cn } from './cn';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectGroup = {
  label: string;
  options: SelectOption[];
};

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

// Styled wrapper over @radix-ui/react-select — the accessible, popper-positioned
// counterpart to the native FilterSelect. Ported from the account demo's
// SelectMenu/SelectMenuItem, restyled onto bds tokens. Supports a flat option
// list, labelled groups, or both.
export function Select({
  value,
  onValueChange,
  options = [],
  groups = [],
  placeholder = 'Select…',
  ariaLabel,
  disabled,
  className,
}: SelectProps) {
  return (
    <RadixSelect.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-bds-gray-10 bg-background px-3.5 text-[14px] text-foreground outline-none transition-colors focus:border-foreground data-[placeholder]:text-bds-gray-40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white',
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon className="text-bds-gray-60">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6L8 10L12 6" />
          </svg>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          // z-[130] — popper layer, above Modal's z-[120]. Radix portals this to
          // <body>, so it competes with the modal in the root stacking context;
          // anything lower renders behind the panel when a Select sits in a Modal.
          // See the layer scale in globals.css.
          className="z-[130] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-bds-gray-10 bg-background shadow-lg dark:border-white/10 dark:bg-[#1a1a1a]"
        >
          <RadixSelect.ScrollUpButton className="flex h-6 cursor-default items-center justify-center bg-background text-bds-gray-60 dark:bg-[#1a1a1a]">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 10L8 6L4 10" />
            </svg>
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <SelectItem key={option.value} option={option} />
            ))}
            {groups.map((group) => (
              <RadixSelect.Group key={group.label}>
                {options.length > 0 ? (
                  <RadixSelect.Separator className="my-1 h-px bg-bds-gray-10 dark:bg-white/10" />
                ) : null}
                <RadixSelect.Label className="px-2 py-1.5 text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
                  {group.label}
                </RadixSelect.Label>
                {group.options.map((option) => (
                  <SelectItem key={option.value} option={option} />
                ))}
              </RadixSelect.Group>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="flex h-6 cursor-default items-center justify-center bg-background text-bds-gray-60 dark:bg-[#1a1a1a]">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6L8 10L12 6" />
            </svg>
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

function SelectItem({ option }: { option: SelectOption }) {
  return (
    <RadixSelect.Item
      value={option.value}
      disabled={option.disabled}
      className="relative flex cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-3 pr-8 text-[14px] text-foreground outline-none data-[highlighted]:bg-bds-gray-5 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:text-white dark:data-[highlighted]:bg-white/10"
    >
      <RadixSelect.ItemIndicator className="absolute right-2.5 text-foreground">
        ✓
      </RadixSelect.ItemIndicator>
      <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}
