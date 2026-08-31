'use client';

import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { annotatedValidity } from '../lib/annotate';
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
  frozen,
  vibeToken0,
  compact,
}: {
  predicates: ValidityPredicate[];
  frozen?: boolean;
  vibeToken0: boolean;
  compact?: boolean;
}) {
  const rows = annotatedValidity(predicates, vibeToken0);
  const hasBlockBound = predicates.some((predicate) => predicate.type === 'block_number');
  const footnote = frozen
    ? hasBlockBound
      ? 'Frozen at submit. The block bound does not walk with the live chain.'
      : 'Frozen at submit.'
    : 'The sequencer checks every clause before inclusion.';
  return (
    <aside
      className={cn(
        'flex min-w-0 flex-col',
        compact
          ? ''
          : 'min-h-[16rem] overflow-hidden rounded-2xl border border-bds-gray-10 bg-background dark:border-white/10 dark:bg-white/5',
      )}
    >
      <div className={cn('flex items-baseline justify-between gap-3', !compact && 'px-5 pt-4')}>
        <Text as="h2" variant="title3">
          Predicates
        </Text>
        <Text variant="label.mono" tone="muted">
          {frozen ? 'submitted tx' : 'draft'}
        </Text>
      </div>
      <Text variant="footnote" tone="muted" className={cn('pt-2', !compact && 'px-5')}>
        {footnote}
      </Text>
      <div className={cn('mt-3 min-h-0 flex-1 overflow-auto', !compact && 'px-5 pb-5')}>
        <div
          className="grid grid-cols-1 gap-x-6 border-b border-bds-gray-10 pb-1 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] dark:border-white/10"
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
              <p className="min-h-5 min-w-0 text-[11px] leading-5 text-bds-gray-70 dark:text-bds-gray-80">
                {row.note ?? ''}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
