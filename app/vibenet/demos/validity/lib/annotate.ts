import { PAIR_RESERVES_SLOT, RESERVE0_MASK, RESERVE1_MASK, RESERVE_BITS, USDV_DECIMALS, VIBE_DECIMALS } from './constants';
import { prettyValidity } from './predicates';
import { formatTokenAmount, USDV_SYMBOL, VIBE_SYMBOL } from './quote';
import type { StoragePredicate, ValidityOperator, ValidityPredicate } from './types';

export type AnnotatedJsonLine = {
  text: string;
  note?: string;
};

function tokenForReserve(reserve: 0 | 1, vibeToken0: boolean): string {
  if (reserve === 0) return vibeToken0 ? VIBE_SYMBOL : USDV_SYMBOL;
  return vibeToken0 ? USDV_SYMBOL : VIBE_SYMBOL;
}

function reserveFromMask(mask: bigint): 0 | 1 | null {
  if (mask === RESERVE0_MASK) return 0;
  if (mask === RESERVE1_MASK) return 1;
  return null;
}

function decodeReserve(value: bigint, mask: bigint): bigint {
  return mask === RESERVE1_MASK ? value >> RESERVE_BITS : value;
}

function formatReserve(amount: bigint, symbol: string): string {
  const decimals = symbol === USDV_SYMBOL ? USDV_DECIMALS : VIBE_DECIMALS;
  return `${formatTokenAmount(amount, decimals)} ${symbol}`;
}

function comparePhrase(op: ValidityOperator): string {
  switch (op) {
    case '>=':
      return 'at least';
    case '<=':
      return 'at most';
    case '>':
      return 'above';
    case '<':
      return 'below';
    case '=':
      return 'exactly';
    case '!=':
      return 'anything but';
    default:
      return op;
  }
}

function boundWord(op: ValidityOperator): string {
  if (op === '>=' || op === '>') return 'Floor';
  if (op === '<=' || op === '<') return 'Ceiling';
  return 'Check';
}

function storageNotes(predicate: StoragePredicate, vibeToken0: boolean): Record<string, string> {
  const mask = BigInt(predicate.params.mask);
  const slot = BigInt(predicate.params.slot);
  const value = BigInt(predicate.params.value);
  const reserve = slot === PAIR_RESERVES_SLOT ? reserveFromMask(mask) : null;
  if (reserve === null) {
    return {
      type: 'Storage condition',
      address: 'Contract whose storage is read',
      slot: `Storage slot ${slot.toString()}`,
      mask: 'Keep the selected bits',
      op: `Include only if the selected value is ${comparePhrase(predicate.params.op)}`,
      value: value.toString(),
    };
  }
  const symbol = tokenForReserve(reserve, vibeToken0);
  const half = reserve === 0 ? 'low 112 bits' : 'high 112 bits';
  const amount = formatReserve(decodeReserve(value, mask), symbol);
  return {
    type: `${boundWord(predicate.params.op)} on the ${symbol} reserve`,
    address: 'The simulated VIBE/USDV pair',
    slot:
      slot === PAIR_RESERVES_SLOT
        ? 'Uni v2 packed reserves (reserve0 | reserve1 << 112)'
        : `Storage slot ${slot.toString()}`,
    mask: `Keep the ${half} — ${symbol}`,
    op: `Include only if that reserve is ${comparePhrase(predicate.params.op)}`,
    value: amount,
  };
}

function notesFor(predicate: ValidityPredicate, vibeToken0: boolean): Record<string, string> {
  if (predicate.type === 'storage') return storageNotes(predicate, vibeToken0);
  const block = BigInt(predicate.params.value);
  return {
    type: 'Block-number expiry',
    op: `Include only while the head is ${comparePhrase(predicate.params.op)}`,
    value: `L2 block ${block.toString()}`,
  };
}

export type PredicateClause = { title: string; detail: string };

/** One review row per clause — title plus the include condition. */
export function reviewClauses(
  predicates: ValidityPredicate[],
  vibeToken0 = true,
): PredicateClause[] {
  return predicates.map((predicate) => {
    const notes = notesFor(predicate, vibeToken0);
    const title = notes.type ?? predicate.type;
    const detail = [notes.op, notes.value].filter(Boolean).join(' — ');
    return { title, detail };
  });
}

/** Pretty JSON plus a plain-English note for each field the sequencer actually reads. */
export function annotatedValidity(
  predicates: ValidityPredicate[],
  vibeToken0 = true,
): AnnotatedJsonLine[] {
  const lines = prettyValidity(predicates).split('\n');
  let index = -1;
  let fields: Record<string, string> = {};
  return lines.map((text, lineIndex) => {
    if (lineIndex === 0 && text.trim() === '[') {
      return { text, note: 'Every clause must hold for the swap to land' };
    }
    const key = text.match(/^\s*"([^"]+)":/)?.[1];
    if (!key) return { text };
    if (key === 'type') {
      index += 1;
      const predicate = predicates[index];
      fields = predicate ? notesFor(predicate, vibeToken0) : {};
    }
    const note = fields[key];
    return note ? { text, note } : { text };
  });
}
