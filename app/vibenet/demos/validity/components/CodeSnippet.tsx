import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';

export type CodeLanguage = 'json' | 'solidity';
type CodeToken = { text: string; kind: 'comment' | 'key' | 'keyword' | 'literal' | 'number' | 'plain' | 'string' | 'type' };

const CODE_TOKEN_CLASS: Record<CodeToken['kind'], string> = {
  comment: 'text-bds-gray-50 dark:text-[#7f8c98]',
  key: 'text-base-blue dark:text-[#7eb8ff]',
  keyword: 'text-purple-700 dark:text-[#c792ea]',
  literal: 'text-bds-orange-70 dark:text-[#ff9d76]',
  number: 'text-bds-orange-70 dark:text-[#f5c542]',
  plain: 'text-bds-gray-80 dark:text-[#d6deeb]',
  string: 'text-bds-green-70 dark:text-[#7ee0a8]',
  type: 'text-base-blue dark:text-[#82aaff]',
};

const JSON_PATTERN = /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?|[{}[\]:,])/g;

const SOLIDITY_KEYWORDS = [
  'address', 'bool', 'constant', 'contract', 'delete', 'emit', 'event', 'external', 'function', 'if',
  'immutable', 'interface', 'internal', 'mapping', 'memory', 'private', 'public', 'require', 'return',
  'returns', 'revert', 'storage', 'struct', 'uint112', 'uint128', 'uint256', 'view',
];

/**
 * Tokenize a JSON or Solidity snippet for display. `types` lists identifiers
 * (contracts, structs, interfaces) to colour as types in Solidity.
 */
export function tokenizeCode(source: string, language: CodeLanguage, types: readonly string[] = []): CodeToken[] {
  const typeSet = new Set(types);
  const pattern = language === 'json'
    ? JSON_PATTERN
    : new RegExp(
        [
          String.raw`\/\/[^\n]*`,
          String.raw`"(?:\\.|[^"\\])*"`,
          String.raw`\b(?:${SOLIDITY_KEYWORDS.join('|')})\b`,
          ...(types.length > 0 ? [String.raw`\b(?:${types.join('|')})\b`] : []),
          String.raw`\b\d[\d_]*(?:\s+ether)?\b`,
        ].join('|'),
        'g',
      );
  const tokens: CodeToken[] = [];
  let last = 0;
  for (const hit of source.matchAll(pattern)) {
    const text = hit[0];
    const index = hit.index ?? 0;
    if (index > last) tokens.push({ text: source.slice(last, index), kind: 'plain' });
    let kind: CodeToken['kind'] = 'plain';
    if (language === 'json') {
      if (text.startsWith('"')) kind = text.endsWith(':') ? 'key' : 'string';
      else if (text === 'true' || text === 'false' || text === 'null') kind = 'literal';
      else if (/^-?\d/.test(text)) kind = 'number';
    } else if (text.startsWith('//')) kind = 'comment';
    else if (text.startsWith('"')) kind = 'string';
    else if (/^\d/.test(text)) kind = 'number';
    else if (typeSet.has(text)) kind = 'type';
    else kind = 'keyword';
    tokens.push({ text, kind });
    last = index + text.length;
  }
  if (last < source.length) tokens.push({ text: source.slice(last), kind: 'plain' });
  return tokens;
}

export function CodeSnippet({
  label,
  code,
  language,
  types,
  className,
}: {
  label: string;
  code: string;
  language: CodeLanguage;
  types?: readonly string[];
  className?: string;
}) {
  return (
    <Card className="min-w-0 overflow-hidden bg-background p-4 dark:bg-white/[.04]">
      <Text variant="caption" tone="muted">{label}</Text>
      <pre className={cn('mt-3 overflow-auto rounded-xl bg-bds-gray-5 p-4 font-mono text-[11px] leading-5 dark:bg-[#0b0d12]', className)}>
        <code>
          {tokenizeCode(code, language, types).map((token, index) => (
            <span key={`${index}-${token.text}`} className={CODE_TOKEN_CLASS[token.kind]}>{token.text}</span>
          ))}
        </code>
      </pre>
    </Card>
  );
}
