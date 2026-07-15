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

export function sentenceJoin(parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}
