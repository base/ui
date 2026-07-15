'use client';

import { useCallback, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../../components/ui/Button';
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
        setError('Enter a block #, hash, or address');
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

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder="Block #, hash, or address"
        aria-label="Search the explorer"
        title={error ?? undefined}
        spellCheck={false}
        autoComplete="off"
        className="w-full max-w-md rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2 font-mono text-[13px] text-black outline-none transition-colors placeholder:text-bds-gray-40 focus:border-bds-blue-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-bds-gray-60 dark:focus:border-bds-blue-40"
      />
      <Button type="submit" variant="secondary" size="sm">
        Search
      </Button>
    </form>
  );
}
