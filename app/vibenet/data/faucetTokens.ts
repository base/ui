import { vibenetApi } from '../library/client';
import { formatAmount } from '../library/format';
import type { FaucetToken, FaucetTokenId } from '../library/types';

// Drippable assets on the vibenet faucet. Each entry owns its availability,
// labels, and drip call, so supporting a new asset is a single addition here
// rather than a page change (mirrors the features/contracts catalogs).
export const FAUCET_TOKENS: FaucetToken[] = [
  {
    id: 'eth',
    label: 'ETH',
    isEnabled: () => true,
    actionLabel: (status) =>
      status ? `Request ${formatAmount(status.drip_wei, 18, 4)} ETH` : 'Request ETH',
    summaryValue: (status) => `${formatAmount(status.balance_wei, 18, 4)} ETH`,
    drip: async (address) => {
      const res = await vibenetApi.faucet.drip({ address });
      return { txHash: res.tx_hash, to: res.to };
    },
  },
  {
    id: 'usdv',
    label: 'USDV',
    isEnabled: (status) => Boolean(status.usdv_address),
    actionLabel: (status) =>
      status?.usdv_drip_units != null
        ? `Request ${formatAmount(status.usdv_drip_units, 6, 2)} USDV`
        : 'Request USDV',
    summaryValue: (status) => (status.usdv_address ? 'Ready' : 'Not deployed'),
    drip: async (address) => {
      const res = await vibenetApi.faucet.dripUsdv({ address });
      return { txHash: res.tx_hash, to: res.to, via: { label: 'USDV', address: res.usdv_address } };
    },
  },
  {
    id: 'nfv',
    label: 'NFV',
    isEnabled: (status) => Boolean(status.nfv_address),
    actionLabel: () => 'Mint NFV',
    summaryValue: (status) => (status.nfv_address ? 'Ready' : 'Not deployed'),
    drip: async (address) => {
      const res = await vibenetApi.faucet.dripNfv({ address });
      return { txHash: res.tx_hash, to: res.to, via: { label: 'NFV', address: res.nfv_address } };
    },
  },
];

export function faucetTokenLabel(id: FaucetTokenId): string {
  return FAUCET_TOKENS.find((token) => token.id === id)?.label ?? id;
}
