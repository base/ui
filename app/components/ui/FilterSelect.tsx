'use client';

import { Select } from '@base-ui/react/select';

import { Button } from './Button';

type Option = {
  value: string;
  label: string;
};

type FilterSelectProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  options: Option[];
  minDropdownWidth?: number;
};

export function FilterSelect({ value, onChange, ariaLabel, options, minDropdownWidth }: FilterSelectProps) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
      items={options}
    >
      <Select.Trigger aria-label={ariaLabel} render={<Button variant="outline" size="sm" />}>
        <Select.Value className="whitespace-nowrap" />
        <Select.Icon
          className="shrink-0 text-bds-gray-40 transition-transform duration-150 group-data-[popup-open]:rotate-180"
        >
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
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-50 outline-none" align="start" sideOffset={4} alignItemWithTrigger={false}>
          <Select.Popup
            style={minDropdownWidth ? { minWidth: `max(var(--anchor-width), ${minDropdownWidth}px)` } : undefined}
            className="min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-bds-gray-10 bg-background py-1 shadow-lg outline-none [transform:scale(1)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.97)] data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.97)]"
          >
            <Select.List className="max-h-64 overflow-y-auto">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="flex w-full cursor-pointer items-center px-3 py-2 text-left text-[14px] text-bds-gray-60 outline-none data-[highlighted]:bg-bds-gray-5 data-[selected]:text-foreground"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
