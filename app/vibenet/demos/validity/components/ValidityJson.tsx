'use client';

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
  key: 'text-[#7eb8ff]',
  string: 'text-[#7ee0a8]',
  number: 'text-[#f5c542]',
  literal: 'text-[#ed9a6c]',
  punct: 'text-[#8b98a5]',
};

export function ValidityJson({
  predicates,
  frozen,
  vibeToken0,
}: {
  predicates: ValidityPredicate[];
  frozen?: boolean;
  vibeToken0: boolean;
}) {
  const rows = annotatedValidity(predicates, vibeToken0);
  const hasBlockBound = predicates.some((predicate) => predicate.type === 'block_number');
  const footnote = frozen
    ? hasBlockBound
      ? 'Frozen at submit. The block bound does not walk with the live chain.'
      : 'Frozen at submit.'
    : 'Hover a field. The right column is what the sequencer is actually checking.';
  return (
    <aside className="flex min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-bds-gray-10 bg-[#0c1117] dark:border-white/10">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <Text as="h2" variant="title3" tone="inverse">
          Predicates
        </Text>
        <Text variant="label.mono" tone="inverseMuted">
          {frozen ? 'submitted tx' : 'draft'}
        </Text>
      </div>
      <Text variant="footnote" tone="inverseMuted" className="px-5 pt-2">
        {footnote}
      </Text>
      <div className="mt-3 min-h-0 flex-1 overflow-auto px-5 pb-5">
        <div
          className="grid min-w-[36rem] grid-cols-[minmax(0,1fr)_minmax(15rem,19rem)] gap-x-6 border-b border-white/10 pb-1"
          aria-hidden
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5d6b78]">
            payload
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5d6b78]">
            meaning
          </span>
        </div>
        <div className="mt-1">
          {rows.map((row, index) => (
            <div
              key={`${index}-${row.text}`}
              className="grid min-w-[36rem] grid-cols-[minmax(0,1fr)_minmax(15rem,19rem)] gap-x-6 rounded-sm hover:bg-white/[0.04]"
            >
              <pre className="min-w-0 overflow-x-auto font-mono text-[11px] leading-5">
                {tokenizeJson(row.text).map((token, tokenIndex) => (
                  <span key={`${index}-${tokenIndex}`} className={KIND_CLASS[token.kind]}>
                    {token.text}
                  </span>
                ))}
              </pre>
              <p className="min-h-5 min-w-0 text-[11px] leading-5 text-[#c5d0d8]">
                {row.note ?? ''}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
