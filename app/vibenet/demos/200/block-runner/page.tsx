import { Text } from '../../../../components/ui/Text';
import { BlockRunner } from '../BlockRunner';

export default function BlockRunnerPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Text variant="caption" className="text-base-blue dark:text-white">
          Vibenet · 200 ms blocks
        </Text>
        <Text variant="display" className="text-balance">Block Runner</Text>
        <Text variant="body" tone="muted" className="max-w-2xl">
          Every obstacle is a real Vibenet block, pushed to the screen the moment the chain seals it. Tap to bite a
          block, read its number and slot, and see how long you can keep up.
        </Text>
      </header>
      <BlockRunner />
    </div>
  );
}
