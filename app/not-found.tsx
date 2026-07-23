import type { Metadata } from 'next';

import { Button } from './components/ui/Button';
import { ScrambleText } from './components/ui/ScrambleText';
import { Text } from './components/ui/Text';

export const metadata: Metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 py-16">
      <span className="font-mono text-[120px] font-medium leading-none tracking-tight text-black sm:text-[200px] md:text-[280px] dark:text-white">
        <ScrambleText text="404" charset="0123456789" duration={1500} interval={50} />
      </span>
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <Text variant="title2">Got lost?</Text>
        <Button href="/">Go to Home</Button>
      </div>
    </main>
  );
}
