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
          Base&apos;s Cobalt upgrade mints a block every 200 ms. Block Runner is a one-button game built on that
          cadence: every obstacle is a real vibenet block, pushed to the screen the moment the chain seals it. Tap to
          bite a block, read its number, and see how long you can keep up.
        </Text>
      </header>
      <BlockRunner />
    </div>
  );
}
