'use client';

import { Text } from '../../../../components/ui/Text';

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
  source,
  frozen,
  hasBlockBound,
}: {
  source: string;
  frozen?: boolean;
  hasBlockBound?: boolean;
}) {
  const tokens = tokenizeJson(source);
  const footnote = frozen
    ? hasBlockBound
      ? 'Frozen at submit. The block bound does not walk with the live chain.'
      : 'Frozen at submit.'
    : hasBlockBound
      ? 'Four storage predicates on Uni v2 slot 0x8, plus a block-number expiry. The sequencer includes the swap only while this box holds.'
      : 'Four storage predicates on Uni v2 slot 0x8. The sequencer includes the swap only while this box holds.';
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
      <pre className="mt-4 min-h-0 flex-1 overflow-auto px-5 pb-5 font-mono text-[11px] leading-5">
        {tokens.map((token, index) => (
          <span key={`${index}-${token.kind}`} className={KIND_CLASS[token.kind]}>
            {token.text}
          </span>
        ))}
      </pre>
    </aside>
  );
}
