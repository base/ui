import { PAIR_RESERVES_SLOT, RESERVE0_MASK, RESERVE1_MASK, RESERVE_BITS, WAD } from './constants';
import { prettyValidity } from './predicates';
import { USDV_SYMBOL, VIBE_SYMBOL } from './quote';
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

function formatAmount(wad: bigint): string {
  const negative = wad < 0n;
  const abs = negative ? -wad : wad;
  const whole = abs / WAD;
  const frac = ((abs % WAD) * 100n) / WAD;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac === 0n ? grouped : `${grouped}.${frac.toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
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
  const reserve = reserveFromMask(mask);
  const symbol = reserve === null ? 'reserve' : tokenForReserve(reserve, vibeToken0);
  const half = reserve === 0 ? 'low 112 bits' : reserve === 1 ? 'high 112 bits' : 'selected bits';
  const amount = reserve === null ? value.toString() : formatAmount(decodeReserve(value, mask));
  return {
    type: `${boundWord(predicate.params.op)} on the ${symbol} reserve`,
    address: 'The simulated VIBE/USDV pair',
    slot:
      slot === PAIR_RESERVES_SLOT
        ? 'Uni v2 packed reserves (reserve0 | reserve1 << 112)'
        : `Storage slot ${slot.toString()}`,
    mask: `Keep the ${half} — ${symbol}`,
    op: `Include only if that reserve is ${comparePhrase(predicate.params.op)}`,
    value: `${amount} ${symbol}`,
  };
}

function notesFor(predicate: ValidityPredicate, vibeToken0: boolean): Record<string, string> {
  if (predicate.type === 'storage') return storageNotes(predicate, vibeToken0);
  if (predicate.type === 'block_number') {
    const block = BigInt(predicate.params.value);
    return {
      type: 'Block-number expiry',
      op: `Include only while the head is ${comparePhrase(predicate.params.op)}`,
      value: `L2 block ${block.toString()}`,
    };
  }
  if (predicate.type === 'balance') {
    return {
      type: 'Balance check',
      address: 'Account whose ETH balance is read',
      op: `Include only if the balance is ${comparePhrase(predicate.params.op)}`,
      value: `${formatAmount(BigInt(predicate.params.value))} ETH`,
    };
  }
  return {
    type: 'Flashblock-index bound',
    op: `Include only if the flashblock index is ${comparePhrase(predicate.params.op)}`,
    value: BigInt(predicate.params.value).toString(),
  };
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
