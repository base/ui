// Post-run share copy for X. Two lines rotate at random per run so the feed
// doesn't see the same post over and over.

export const SHARE_URL = 'https://chain.base.org/vibenet/demos/200';

export type ShareVariant = 'ate' | 'survived';

export const SHARE_VARIANTS: readonly ShareVariant[] = ['ate', 'survived'];

export function shareText(score: number, variant: ShareVariant): string {
  return variant === 'ate'
    ? `I ate ${score} blocks on Base Runner\n\nHow long can you survive? ${SHARE_URL}`
    : `I survived ${score} blocks on Base Runner\n\nSee how long you can last: ${SHARE_URL}`;
}

/** X's web intent: opens the composer prefilled with the text. */
export function xShareUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

export function pickShareVariant(random: () => number = Math.random): ShareVariant {
  return SHARE_VARIANTS[Math.floor(random() * SHARE_VARIANTS.length)] ?? 'ate';
}
