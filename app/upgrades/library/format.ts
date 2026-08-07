import type { LifecycleStatusEntry } from './types';

export function formatDate(iso: string | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return 'TBD';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
      ...opts,
    });
  } catch {
    return iso;
  }
}

export function formatShortDate(iso: string | undefined): string {
  return formatDate(iso, {
    hour: undefined,
    minute: undefined,
    timeZoneName: undefined,
  });
}

/**
 * Resolves the label shown for a network: a confirmed timestamp wins, otherwise
 * fall back to a coarse human estimate ("Q3 2026"), otherwise "Coming Soon".
 */
export function formatLifecycleDate(
  entry: LifecycleStatusEntry,
  estimate?: string,
): string {
  if (entry.timestamp) return formatShortDate(entry.timestamp);
  return estimate ?? 'Coming Soon';
}

export function sentenceJoin(parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const codePoint =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Strips HTML tags and decodes entities so a rich-text `summary` can be reused
 * as plain text in compact previews, search haystacks, and SEO metadata. DOM
 * free so it runs in both server and client components.
 */
export function toPlainText(html: string): string {
  return decodeEntities(
    html
      // Treat block-ish boundaries as spaces so words don't collapse together.
      .replace(/<\/(p|div|li|ul|ol|br|h[1-6])>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}
