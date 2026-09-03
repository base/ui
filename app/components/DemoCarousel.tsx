'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ChevronIcon } from './ui/icons';
import { cn } from './ui/cn';
import { DemoCard } from '../vibenet/demos/DemoCard';
import type { DemoEntry } from '../vibenet/demos/catalogue';

// Horizontal, scroll-snapping row of demo cards with prev/next controls and edge
// fades. Native scroll drives everything (so touch/trackpad work for free); the
// buttons just nudge scrollLeft, and their enabled state and the fades track how
// far the row is scrolled.
export function DemoCarousel({ demos }: { demos: DemoEntry[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // 1px slack so sub-pixel scroll widths don't leave a button stuck enabled.
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateEdges();
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
    };
  }, [updateEdges]);

  const scroll = useCallback((direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Page by roughly one card-width so a click lands on the next card.
    const amount = Math.min(el.clientWidth * 0.85, 340);
    el.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        // Below sm: a plain full-width vertical stack (no horizontal scroll), so
        // the carousel degrades to the same single-column layout as the Vibenet
        // grid. From sm up: a snapping horizontal scroller.
        className="flex flex-col gap-4 sm:flex-row sm:snap-x sm:snap-mandatory sm:overflow-x-auto sm:scroll-smooth sm:pb-1 sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
      >
        {demos.map((demo) => (
          <DemoCard
            key={demo.href}
            demo={demo}
            // Match the Vibenet overview grid (grid-cols-1 sm:grid-cols-2 gap-4):
            // full width on mobile, half-minus-half-gap from sm up.
            className="w-full sm:w-[calc(50%-0.5rem)] sm:shrink-0 sm:snap-start"
          />
        ))}
      </div>

      {/* Edge fades hint at more content without covering a full card. */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 hidden w-10 bg-gradient-to-r from-background to-transparent transition-opacity sm:block',
          canPrev ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 hidden w-10 bg-gradient-to-l from-background to-transparent transition-opacity sm:block',
          canNext ? 'opacity-100' : 'opacity-0',
        )}
      />

      <CarouselButton direction="prev" disabled={!canPrev} onClick={() => scroll(-1)} />
      <CarouselButton direction="next" disabled={!canNext} onClick={() => scroll(1)} />
    </div>
  );
}

function CarouselButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const isPrev = direction === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isPrev ? 'Previous demos' : 'Next demos'}
      className={cn(
        'absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-bds-gray-10 bg-background text-bds-gray-60 shadow-sm transition-[opacity,background-color,color] hover:bg-bds-gray-5 hover:text-foreground disabled:pointer-events-none disabled:opacity-0 dark:border-white/10 dark:bg-bds-gray-0 dark:hover:bg-white/10 sm:flex',
        isPrev ? '-left-3' : '-right-3',
      )}
    >
      <ChevronIcon className={isPrev ? 'rotate-180' : undefined} />
    </button>
  );
}
