import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';

type FilterGroupProps = {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

export function FilterGroup({ label, options, value, onChange }: FilterGroupProps) {
  return (
    <div>
      <Text variant="label.medium" tone="muted" className="mb-2.5 text-[13px]">
        {label}
      </Text>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[13px] transition-colors',
              value === o.value
                ? 'bg-black text-white'
                : 'bg-bds-gray-5 text-bds-gray-60',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
