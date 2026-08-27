import { Button } from '../../components/ui/Button';
import { Text } from '../../components/ui/Text';

export default function ExplorerNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <span className="text-[120px] font-bold leading-none tracking-tight text-foreground sm:text-[180px] dark:text-white">
        404
      </span>
      <Text variant="title2">Not found</Text>
      <Button href="/vibenet/explorer" variant="secondary" className="mt-2">
        Back to Explorer
      </Button>
    </div>
  );
}
