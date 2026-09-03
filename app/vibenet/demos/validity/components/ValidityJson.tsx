'use client';

import { useCallback, useState } from 'react';
import { MorphIcon } from 'morphicons/react';

import {
  CHECK_MORPH_ICON,
  COPY_SQUARES_MORPH_ICON,
  COPY_SQUARES_MORPH_STROKE_WIDTH,
} from '../../../../components/ui/icons';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { annotatedValidity } from '../lib/annotate';
import { prettyValidity } from '../lib/predicates';
import type { ValidityPredicate } from '../lib/types';

type TokenKind = 'key' | 'string' | 'number' | 'literal' | 'punct';

function tokenizeJson(source: string): Array<{ kind: TokenKind; text: string }> {
  const tokens: Array<{ kind: TokenKind; text: string }> = [];
  const pattern =
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\]:,])/g;
  let last = 0;
  for (const hit of source.matchAll(pattern)) {
    const text = hit[0];
    const index = hit.index ?? 0;
    if (index > last) {
      tokens.push({ kind: 'punct', text: source.slice(last, index) });
    }
    let kind: TokenKind = 'punct';
    if (text.startsWith('"')) {
      kind = text.endsWith(':') ? 'key' : 'string';
    } else if (text === 'true' || text === 'false' || text === 'null') {
      kind = 'literal';
    } else if (/^-?\d/.test(text)) {
      kind = 'number';
    }
    tokens.push({ kind, text });
    last = index + text.length;
  }
  if (last < source.length) tokens.push({ kind: 'punct', text: source.slice(last) });
  return tokens;
}

const KIND_CLASS: Record<TokenKind, string> = {
  key: 'text-base-blue dark:text-[#7eb8ff]',
  string: 'text-bds-green-70 dark:text-[#7ee0a8]',
  number: 'text-bds-orange-70 dark:text-[#f5c542]',
  literal: 'text-bds-orange-60 dark:text-[#ed9a6c]',
  punct: 'text-bds-gray-50 dark:text-bds-gray-40',
};

export function ValidityJson({
  predicates,
  vibeToken0,
}: {
  predicates: ValidityPredicate[];
  vibeToken0: boolean;
}) {
  const rows = annotatedValidity(predicates, vibeToken0);
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    async function run() {
      try {
        await navigator.clipboard.writeText(prettyValidity(predicates));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore clipboard failures
      }
    }
    void run();
  }, [predicates]);
  return (
    <aside className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <Text as="h2" variant="title3">
          Predicates
        </Text>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied predicate JSON' : 'Copy predicate JSON'}
          className="group inline-flex items-center rounded-md p-1.5 text-bds-gray-50 transition-colors hover:bg-bds-gray-5 hover:text-foreground dark:hover:bg-white/5"
        >
          <MorphIcon
            icon={copied ? CHECK_MORPH_ICON : COPY_SQUARES_MORPH_ICON}
            size={16}
            strokeWidth={copied ? 2 : COPY_SQUARES_MORPH_STROKE_WIDTH}
            className={cn(
              'shrink-0 transition-colors',
              copied ? 'text-bds-green-60' : 'text-bds-gray-50 group-hover:text-foreground',
            )}
          />
        </button>
      </div>
      <Text variant="footnote" tone="muted" className="pt-2">
        The sequencer checks every clause before inclusion.
      </Text>
      <div className="mt-3 min-h-0 flex-1 overflow-auto">
        <div
          className="grid select-none grid-cols-1 gap-x-6 border-b border-bds-gray-10 pb-1 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] dark:border-white/10"
          aria-hidden
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bds-gray-50">
            payload
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-bds-gray-50 sm:block">
            meaning
          </span>
        </div>
        <div className="mt-1">
          {rows.map((row, index) => (
            <div
              key={`${index}-${row.text}`}
              className="grid grid-cols-1 gap-x-6 rounded-sm hover:bg-bds-gray-5 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] dark:hover:bg-white/[0.04]"
            >
              <pre className="min-w-0 overflow-x-auto font-mono text-[11px] leading-5">
                {tokenizeJson(row.text).map((token, tokenIndex) => (
                  <span key={`${index}-${tokenIndex}`} className={KIND_CLASS[token.kind]}>
                    {token.text}
                  </span>
                ))}
              </pre>
              <p className="min-h-5 min-w-0 select-none text-[11px] leading-5 text-bds-gray-70 dark:text-bds-gray-80">
                {row.note ?? ''}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
