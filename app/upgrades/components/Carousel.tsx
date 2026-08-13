'use client';

import {
  Children,
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '../../components/ui/cn';

// Card width per breakpoint for each supported `perView`. These strings are
// intentionally written as literals so Tailwind's JIT compiler can see them
// (dynamically-built arbitrary values would not be emitted). On small screens
// we always show ~1 card and step up to `perView` at the `lg` breakpoint.
const PER_VIEW_CARD_CLASS: Record<number, string> = {
  1: 'w-[86%] sm:w-[70%] md:w-[calc(50%-0.5rem)] lg:w-full',
  2: 'w-[86%] sm:w-[70%] md:w-[calc(50%-0.5rem)] lg:w-[calc(50%-0.5rem)]',
  3: 'w-[86%] sm:w-[60%] md:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]',
  4: 'w-[86%] sm:w-[60%] md:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]',
};

// Matches the `gap-4` (1rem = 16px) between cards below.
const CARD_GAP_PX = 16;

type CarouselProps = {
  children: ReactNode;
  /** Number of cards visible at the `lg` breakpoint. Defaults to 3. */
  perView?: number;
  emptyState?: ReactNode;
  className?: string;
};

export function Carousel({
  children,
  perView = 3,
  emptyState,
  className,
}: CarouselProps): ReactNode {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const cards = Children.toArray(children);

  const updateButtons = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setCanPrev(scroller.scrollLeft > 4);
    setCanNext(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateButtons();
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.addEventListener('scroll', updateButtons, { passive: true });
      window.addEventListener('resize', updateButtons);
    }
    return () => {
      if (scroller) {
        scroller.removeEventListener('scroll', updateButtons);
        window.removeEventListener('resize', updateButtons);
      }
    };
  }, [cards.length, updateButtons]);

  const scrollByCard = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const card = scroller.querySelector<HTMLElement>('[data-carousel-card]');
    const amount = card ? card.offsetWidth + CARD_GAP_PX : scroller.clientWidth * 0.8;
    scroller.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }, []);

  const handlePrev = useCallback(() => scrollByCard(-1), [scrollByCard]);
  const handleNext = useCallback(() => scrollByCard(1), [scrollByCard]);

  if (cards.length === 0) {
    return emptyState ?? null;
  }

  const cardWidthClass = PER_VIEW_CARD_CLASS[perView] ?? PER_VIEW_CARD_CLASS[3];

  return (
    <div className={cn('relative', className)}>
      <div
        key="carousel-scroller"
        ref={scrollerRef}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none]"
      >
        {cards.map((card) => (
          // Children.toArray assigns a stable key to every child, so we can
          // reuse it here rather than falling back to the array index.
          <div
            key={isValidElement(card) ? card.key : undefined}
            data-carousel-card
            className={cn('flex shrink-0 snap-start', cardWidthClass)}
          >
            {card}
          </div>
        ))}
      </div>
      {/* Arrows sit below the cards, centered. Each stays visible but greyed
          out when its direction is unusable; the whole row is hidden only when
          neither direction can be scrolled (nothing overflows). */}
      {canPrev || canNext ? (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Previous"
            onClick={handlePrev}
            disabled={!canPrev}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-bds-gray-10 bg-background text-foreground shadow-sm transition-colors hover:bg-bds-gray-5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background dark:border-white/10"
          >
            <span aria-hidden>&lt;</span>
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={handleNext}
            disabled={!canNext}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-bds-gray-10 bg-background text-foreground shadow-sm transition-colors hover:bg-bds-gray-5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background dark:border-white/10"
          >
            <span aria-hidden>&gt;</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
