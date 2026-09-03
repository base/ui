'use client';

import { Select as BaseSelect } from '@base-ui/react/select';

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

// Styled wrapper over Base UI Select — portaled + positioned so the menu never
// participates in layout (Radix's item-align / scroll-into-view was jumping
// the Account Details modal). Same public API as before: flat options, labelled
// groups, or both.
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
  const items = [
    ...options.map((option) => ({ value: option.value, label: option.label })),
    ...groups.flatMap((group) => group.options.map((option) => ({ value: option.value, label: option.label }))),
  ];

  return (
    <BaseSelect.Root
      value={value || null}
      onValueChange={(next) => {
        if (next != null) onValueChange(next);
      }}
      items={items}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg bg-transparent px-3.5 text-[14px] text-foreground outline-none',
          'ring-1 ring-inset ring-bds-gray-10',
          'transition-[box-shadow] duration-150 ease-out motion-reduce:transition-none',
          'hover:ring-bds-gray-15',
          'focus:ring-black/40 data-[popup-open]:ring-black/40 dark:focus:ring-white/40 dark:data-[popup-open]:ring-white/40',
          'data-[placeholder]:text-bds-gray-40 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <BaseSelect.Value placeholder={placeholder} className="min-w-0 truncate" />
        <BaseSelect.Icon className="shrink-0 text-bds-gray-60">
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
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          // z-[130] — popper layer, above Modal's z-[120]. Portaled to <body>,
          // so it competes with the modal in the root stacking context;
          // anything lower renders behind the panel when a Select sits in a Modal.
          // alignItemWithTrigger must stay false: the default lines the selected
          // row up with the trigger and is what shifted this form.
          // See the layer scale in globals.css.
          className="z-[130] outline-none"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-lg border border-bds-gray-10 bg-background shadow-lg outline-none [transform:scale(1)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.97)] data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.97)] dark:border-white/10 dark:bg-[#1a1a1a] motion-reduce:transition-none">
            <BaseSelect.List className="max-h-64 overflow-y-auto p-1">
              {options.map((option) => (
                <SelectItem key={option.value} option={option} />
              ))}
              {groups.map((group) => (
                <BaseSelect.Group key={group.label}>
                  {options.length > 0 ? (
                    <BaseSelect.Separator className="my-1 h-px bg-bds-gray-10 dark:bg-white/10" />
                  ) : null}
                  <BaseSelect.GroupLabel className="px-2 py-1.5 text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
                    {group.label}
                  </BaseSelect.GroupLabel>
                  {group.options.map((option) => (
                    <SelectItem key={option.value} option={option} />
                  ))}
                </BaseSelect.Group>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

function SelectItem({ option }: { option: SelectOption }) {
  return (
    <BaseSelect.Item
      value={option.value}
      disabled={option.disabled}
      label={option.label}
      className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-3 pr-8 text-[14px] text-foreground outline-none data-[highlighted]:bg-bds-gray-5 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:text-white dark:data-[highlighted]:bg-white/10"
    >
      <BaseSelect.ItemIndicator className="absolute right-2.5 text-foreground">
        ✓
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
