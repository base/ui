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
