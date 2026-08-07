import {
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  parseUnits,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from 'viem';

// Mirrors base/base-std at 68a7a35ebfb8a0a8deb328d9762b9eb9dff06ba3.
// Keep these small, browser-safe ABI fragments alongside the demo rather than
// depending on Solidity tooling at runtime.
export const B20_FACTORY = '0xB20f000000000000000000000000000000000000' as Address;
export const ACTIVATION_REGISTRY = '0x8453000000000000000000000000000000000001' as Address;
export const POLICY_REGISTRY = '0x8453000000000000000000000000000000000002' as Address;
export const MAX_SUPPLY_CAP = 2n ** 128n - 1n;

export const factoryAbi = [
  {
    type: 'function',
    name: 'isB20',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isB20Initialized',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getB20Address',
    stateMutability: 'view',
    inputs: [
      { name: 'variant', type: 'uint8' },
      { name: 'sender', type: 'address' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'createB20',
    stateMutability: 'payable',
    inputs: [
      { name: 'variant', type: 'uint8' },
      { name: 'salt', type: 'bytes32' },
      { name: 'params', type: 'bytes' },
      { name: 'initCalls', type: 'bytes[]' },
    ],
    outputs: [{ type: 'address' }],
  },
] as const;

export const activationAbi = [
  {
    type: 'function',
    name: 'isActivated',
    stateMutability: 'view',
    inputs: [{ name: 'feature', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

export const policyRegistryAbi = [
  {
    type: 'function',
    name: 'isAuthorized',
    stateMutability: 'view',
    inputs: [
      { name: 'policyId', type: 'uint64' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'policyExists',
    stateMutability: 'view',
    inputs: [{ name: 'policyId', type: 'uint64' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'policyAdmin',
    stateMutability: 'view',
    inputs: [{ name: 'policyId', type: 'uint64' }],
    outputs: [{ type: 'address' }],
  },
] as const;

export const b20Abi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'supplyCap', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'contractURI', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'policyId',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32' }],
    outputs: [{ type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32' }, { type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transferWithMemo',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transferFromWithMemo',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'mintWithMemo',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'burnWithMemo',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'grantRole',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'bytes32' }, { type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateSupplyCap',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateContractURI',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updatePolicy',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'bytes32' }, { type: 'uint64' }],
    outputs: [],
  },
] as const;

export const assetAbi = [
  {
    type: 'function',
    name: 'announce',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'bytes[]', name: 'internalCalls' },
      { type: 'string', name: 'id' },
      { type: 'string', name: 'description' },
      { type: 'string', name: 'uri' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isAnnouncementIdUsed',
    stateMutability: 'view',
    inputs: [{ type: 'string', name: 'id' }],
    outputs: [{ type: 'bool' }],
  },
  { type: 'function', name: 'effectiveAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'setUIMultiplier',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }],
    outputs: [],
  },
  { type: 'function', name: 'cancelScheduledMultiplier', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'batchMint',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address[]' }, { type: 'uint256[]' }],
    outputs: [],
  },
] as const;

export const POLICY_SCOPES = [
  ['TRANSFER_SENDER_POLICY', 'Transfer sender'],
  ['TRANSFER_RECEIVER_POLICY', 'Transfer receiver'],
  ['TRANSFER_EXECUTOR_POLICY', 'Transfer executor'],
  ['MINT_RECEIVER_POLICY', 'Mint recipient'],
] as const;

export const ROLES = [
  'MINT_ROLE',
  'BURN_ROLE',
  'BURN_BLOCKED_ROLE',
  'PAUSE_ROLE',
  'UNPAUSE_ROLE',
  'METADATA_ROLE',
  'OPERATOR_ROLE',
] as const;

export function roleId(role: string): Hex {
  return keccak256(stringToHex(role));
}

export function scopeId(scope: string): Hex {
  return keccak256(stringToHex(scope));
}

export function featureId(feature: 'asset' | 'stablecoin'): Hex {
  return keccak256(stringToHex(feature === 'asset' ? 'base.b20_asset' : 'base.b20_stablecoin'));
}

export function b20Variant(address: Address): 'asset' | 'stablecoin' | null {
  const bytes = address.toLowerCase().slice(2);
  if (!bytes.startsWith('b200')) return null;
  const variant = bytes.slice(20, 22);
  return variant === '00' ? 'asset' : variant === '01' ? 'stablecoin' : null;
}

export function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function memoToBytes32(value: string): Hex {
  if (/^0x[\da-fA-F]{64}$/.test(value)) return value as Hex;
  const encoded = stringToHex(value);
  if ((encoded.length - 2) / 2 > 32) throw new Error('Memo text must be 32 UTF-8 bytes or fewer.');
  return `${encoded}${'0'.repeat(66 - encoded.length)}` as Hex;
}

// Inverse of memoToBytes32: decode a bytes32 memo to its text when it is a clean,
// printable ASCII string, else null so callers can fall back to the raw hex.
export function bytes32ToMemo(memo: Hex): string | null {
  const bytes = new Uint8Array((memo.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(memo.slice(2 + index * 2, 4 + index * 2), 16);
  }
  const end = bytes.indexOf(0);
  const text = new TextDecoder().decode(end === -1 ? bytes : bytes.slice(0, end));
  return text && /^[\x20-\x7E]+$/.test(text) ? text : null;
}

// Format a raw integer token amount for display: group the whole part, trim
// trailing fractional zeros, and cap the fraction at 6 places. Assumes
// decimals >= 1 (every B20 variant uses 6–18).
export function formatAmount(value: bigint, decimals: number): string {
  const raw = value.toString().padStart(decimals + 1, '0');
  const whole = raw.slice(0, -decimals) || '0';
  const fraction = raw.slice(-decimals).replace(/0+$/, '').slice(0, 6);
  return `${Number(whole).toLocaleString()}${fraction ? `.${fraction}` : ''}`;
}

export function amount(value: string, decimals: number): bigint {
  if (!value || Number(value) < 0) throw new Error('Enter a valid non-negative amount.');
  return parseUnits(value, decimals);
}

export function saltFor(value: string): Hex {
  return keccak256(toHex(value || `b20-${Date.now()}`));
}

export function encodeDeploymentParams(
  variant: 'asset' | 'stablecoin',
  name: string,
  symbol: string,
  admin: Address,
  decimals: number,
  currency: string,
): Hex {
  // abi.encode(struct) is the canonical factory encoding; the version is 1.
  const parameters =
    variant === 'asset'
      ? [
          {
            type: 'tuple',
            components: [
              { type: 'uint8' },
              { type: 'string' },
              { type: 'string' },
              { type: 'address' },
              { type: 'uint8' },
            ],
          },
        ]
      : [
          {
            type: 'tuple',
            components: [
              { type: 'uint8' },
              { type: 'string' },
              { type: 'string' },
              { type: 'address' },
              { type: 'string' },
            ],
          },
        ];
  return encodeAbiParameters(
    parameters as never,
    [variant === 'asset' ? [1, name, symbol, admin, decimals] : [1, name, symbol, admin, currency]] as never,
  ) as Hex;
}

export function encodeRoleGrant(role: string, account: Address): Hex {
  return encodeFunctionData({ abi: b20Abi, functionName: 'grantRole', args: [roleId(role), account] });
}
