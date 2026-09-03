import { BlockRunner } from './BlockRunner';
import { Text } from '../../../components/ui/Text';

export default function BlockRunnerPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Text variant="caption" className="text-base-blue dark:text-white">
          Vibenet · 200 ms blocks
        </Text>
        <Text variant="display" className="text-balance">
          Block Runner
        </Text>
        <Text variant="body" tone="muted" className="max-w-2xl">
          Base&apos;s Denim upgrade mints a block every 200 ms. This is what that cadence feels like: the chain sets the
          pace, and every obstacle is a block that just landed.
        </Text>
      </header>
      <BlockRunner />
    </div>
  );
}
