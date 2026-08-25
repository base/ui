/**
 * Slide direction for the sidebar pane swap. Computed during render (not in an
 * effect) so AnimatePresence sees the new value on the same frame the pane
 * changes — otherwise the first back-navigation still uses the inbound +1.
 *
 * Returns null when the parent did not change, so the caller can leave its
 * last direction in place.
 */
export function navSlideDirection(
  prevParentHref: string | null,
  currParentHref: string | null,
): 1 | -1 | null {
  if (prevParentHref === currParentHref) return null;
  return currParentHref ? 1 : -1;
}

export const SCROLL_FADE_MAX_PX = 40;

export type ScrollEdges = {
  top: number;
  bottom: number;
};

/**
 * Fade band size in px at each vertical edge. The sidebar viewport only
 * paints the bottom band (`--scroll-area-overflow-y-end`); the start value
 * is kept so callers can still reason about both edges. The CSS variable is
 * the pixel distance from that edge; the mask grows from 0 to 40px as you
 * scroll away, then holds. Both are 0 when content fits the viewport.
 */
export function scrollEdges(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  maxFadePx = SCROLL_FADE_MAX_PX,
): ScrollEdges {
  const overflow = Math.max(0, scrollHeight - clientHeight);
  if (overflow === 0) return { top: 0, bottom: 0 };
  const start = Math.min(Math.max(0, scrollTop), overflow);
  const end = overflow - start;
  return {
    top: Math.min(maxFadePx, start),
    bottom: Math.min(maxFadePx, end),
  };
}
