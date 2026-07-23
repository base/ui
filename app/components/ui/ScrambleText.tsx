'use client';

import { useEffect, useState } from 'react';

type ScrambleTextProps = {
  text: string;
  charset?: string;
  duration?: number;
  interval?: number;
};

export function ScrambleText({
  text,
  charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  duration = 1500,
  interval = 50,
}: ScrambleTextProps) {
  // Seed with a deterministic placeholder (first charset glyph repeated) so the
  // server and initial client render match. The random scramble only kicks in
  // from the client-only effect below, avoiding a hydration mismatch.
  const [display, setDisplay] = useState(() => charset[0].repeat(text.length));

  useEffect(() => {
    const totalSteps = Math.floor(duration / interval);
    let step = 0;

    const timer = setInterval(() => {
      step += 1;
      const progress = step / totalSteps;
      const lockedCount = Math.floor(progress * text.length);

      setDisplay(
        text
          .split('')
          .map((char, i) =>
            i < lockedCount ? char : charset[Math.floor(Math.random() * charset.length)],
          )
          .join(''),
      );

      if (step >= totalSteps) {
        setDisplay(text);
        clearInterval(timer);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [text, charset, duration, interval]);

  return <>{display}</>;
}
