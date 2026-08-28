'use client';

import { useCallback, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { vibenetApi, VibenetApiError } from '../library/client';

const EXPLORER_BASE = '/vibenet/explorer';

type Classified = { kind: 'block' | 'tx' | 'address'; value: string };

function classifyQuery(raw: string): Classified | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return { kind: 'address', value };
  if (/^0x[a-fA-F0-9]{64}$/.test(value)) return { kind: 'tx', value };
  if (/^\d+$/.test(value)) return { kind: 'block', value };
  return null;
}

// Explorer search bar. Classifies the query and routes to the matching detail
// route; a 64-char hash is tried as a tx first, then falls back to a block.
export function ExplorerSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const classified = classifyQuery(query);
      if (!classified) {
        setError('Enter a valid block #, hash, or address.');
        return;
      }
      if (classified.kind === 'address' || classified.kind === 'block') {
        router.push(`${EXPLORER_BASE}/${classified.kind}/${classified.value}`);
        return;
      }
      async function resolveHash(hash: string) {
        try {
          await vibenetApi.explorer.tx(hash);
          router.push(`${EXPLORER_BASE}/tx/${hash}`);
        } catch (err) {
          // A 64-char hash is either a tx or a block. Only a genuine "no such
          // tx" (404) means we should try the block route; any other failure
          // (timeout, 5xx, network) is a real error and must surface, not
          // silently land the user on a "Block not found" page.
          if (err instanceof VibenetApiError && err.status === 404) {
            router.push(`${EXPLORER_BASE}/block/${hash}`);
          } else {
            setError('Could not reach the explorer API — try again');
          }
        }
      }
      void resolveHash(classified.value);
    },
    [query, router],
  );

  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <form onSubmit={handleSubmit} className="relative w-full">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search block #, hash, or address"
          aria-label="Search the explorer"
          title={error ?? undefined}
          spellCheck={false}
          autoComplete="off"
          className={cn(
            'w-full rounded-full border border-bds-gray-10 bg-bds-gray-0 py-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-bds-blue-40',
            hasQuery ? 'pr-20' : 'pr-3.5',
          )}
        />
        {hasQuery ? (
          <Button type="submit" variant="secondary" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2">
            Search
          </Button>
        ) : null}
      </form>
      {error ? (
        <p className="pl-1 text-sm text-bds-red-50">{error}</p>
      ) : null}
    </div>
  );
}
