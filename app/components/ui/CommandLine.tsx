'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from './cn';
import { COPY_SQUARES_PATH_40 } from './icons';
import { Text } from './Text';

const SHIMMER_GRADIENT =
  'linear-gradient(90deg, currentColor 0%, currentColor 40%, var(--shimmer-highlight) 50%, currentColor 60%, currentColor 100%)';

// Single-line, `$`-prefixed command box: a shimmer sweep on the command when it
// changes, a marquee that scrolls overflowing text on hover, and a copy button
// whose icon morphs to a check. Shared by the snapshots configurator and the
// homepage download box so both stay in sync.
export function CommandLine({
  command,
  onCopy,
  className,
}: {
  command: string;
  onCopy?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const shimmerRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (textRef.current && containerRef.current) {
        setOverflowPx(Math.max(0, textRef.current.scrollWidth - containerRef.current.clientWidth));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [command]);

  useEffect(() => {
    const animation = shimmerRef.current?.animate(
      [{ backgroundPosition: '100% 0%' }, { backgroundPosition: '0% 0%' }],
      { duration: 700, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
    );
    return () => animation?.cancel();
  }, [command]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    });
  }, [command, onCopy]);

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border border-bds-gray-10 bg-background px-3 py-2',
        className,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden">
        <motion.span
          ref={textRef}
          animate={{ x: hovered && overflowPx > 0 ? -overflowPx : 0 }}
          transition={hovered ? { duration: overflowPx / 100, ease: 'linear' } : { duration: 0.3, ease: 'easeOut' }}
          className="block whitespace-nowrap"
        >
          <span
            ref={shimmerRef}
            className="bg-[length:300%_100%] bg-clip-text bg-no-repeat [--shimmer-highlight:var(--bds-blue-15)] dark:[--shimmer-highlight:var(--bds-brand)]"
            style={{ backgroundImage: SHIMMER_GRADIENT, WebkitTextFillColor: 'transparent' }}
          >
            <Text as="span" variant="label.mono">
              <span className="text-bds-gray-40" style={{ WebkitTextFillColor: 'initial' }}>$</span> {command}
            </Text>
          </span>
        </motion.span>
        {overflowPx > 0 && (
          <motion.div
            animate={{ opacity: hovered ? 0 : 1 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent"
          />
        )}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="relative ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center text-bds-gray-60 transition-colors hover:text-foreground"
        aria-label="Copy command"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.svg
              key="check"
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15 }}
            >
              <path d="M20 6 9 17l-5-5" />
            </motion.svg>
          ) : (
            <motion.svg
              key="copy"
              width={20}
              height={20}
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15 }}
            >
              <path d={COPY_SQUARES_PATH_40} stroke="currentColor" strokeWidth={2.5} />
            </motion.svg>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
