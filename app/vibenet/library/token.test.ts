import { describe, expect, it } from 'vitest';
import { padHex, type Hex } from 'viem';

import { ERC20_TRANSFER_TOPIC } from './explorer';
import type { ExplorerTxResponse } from './api-types';
import {
  erc20ProfileFromReads,
  mergeTokenTransfers,
  readTransferLog,
  tokenMovement,
  transfersInExplorerTx,
  type TokenTransfer,
} from './token';

const TOKEN = '0xA271Cfe48095C84A641726105b1a5E53926151e3';
const HOLDER = '0x85d8fc6c089d6484b5ed1e3056878abe48550e42';
const ZERO = '0x0000000000000000000000000000000000000000';

function addressTopic(address: string): Hex {
  return padHex(address as Hex, { size: 32 });
}

function amountData(amount: bigint): Hex {
  return padHex(`0x${amount.toString(16)}` as Hex, { size: 32 });
}

describe('erc20ProfileFromReads', () => {
  it('builds a profile and falls back to the symbol when name is missing', () => {
    expect(
      erc20ProfileFromReads({
        name: '  Vibe USD ',
        symbol: 'USDV',
        decimals: 6,
        totalSupply: 257_194_000_000n,
      }),
    ).toEqual({
      name: 'Vibe USD',
      symbol: 'USDV',
      decimals: 6,
      totalSupply: 257_194_000_000n,
    });

    expect(
      erc20ProfileFromReads({
        name: null,
        symbol: 'VIBE',
        decimals: 18,
        totalSupply: 0n,
      })?.name,
    ).toBe('VIBE');
  });

  it('rejects reads that are not an ERC-20', () => {
    expect(
      erc20ProfileFromReads({ name: 'Non-Fungible Vibe', symbol: 'NFV', decimals: null, totalSupply: null }),
    ).toBeNull();
    expect(
      erc20ProfileFromReads({ name: 'Nope', symbol: '', decimals: 18, totalSupply: 1n }),
    ).toBeNull();
    expect(
      erc20ProfileFromReads({ name: 'Nope', symbol: 'NOPE', decimals: 18, totalSupply: null }),
    ).toBeNull();
    expect(
      erc20ProfileFromReads({ name: 'Nope', symbol: 'BAD🙂', decimals: 18, totalSupply: 1n }),
    ).toBeNull();
  });
});

describe('token transfers', () => {
  it('labels mints and burns from the zero address', () => {
    expect(tokenMovement(ZERO, HOLDER)).toBe('mint');
    expect(tokenMovement(HOLDER, ZERO)).toBe('burn');
    expect(tokenMovement(HOLDER, TOKEN)).toBe('transfer');
  });

  it('decodes a Transfer log for the token and ignores anything else', () => {
    const log = {
      address: TOKEN,
      topics: [ERC20_TRANSFER_TOPIC, addressTopic(ZERO), addressTopic(HOLDER)],
      data: amountData(1_000_000_000n),
      transactionHash: `0x${'ab'.repeat(32)}`,
      blockNumber: 2_549_855n,
      logIndex: 4,
    };
    expect(readTransferLog(TOKEN, log)).toEqual({
      txHash: log.transactionHash,
      blockNumber: 2_549_855,
      logIndex: 4,
      from: ZERO,
      to: HOLDER,
      amount: 1_000_000_000n,
    });
    expect(readTransferLog(HOLDER, log)).toBeNull();
    expect(readTransferLog(TOKEN, { ...log, topics: ['0x1234', addressTopic(ZERO), addressTopic(HOLDER)] })).toBeNull();
  });

  it('reads a mint out of an explorer transaction payload', () => {
    const hash = `0x${'ab'.repeat(32)}`;
    const tx = {
      hash,
      blockNumber: '0x26e9df',
      logs: [
        {
          address: TOKEN,
          topics: [ERC20_TRANSFER_TOPIC, addressTopic(ZERO), addressTopic(HOLDER)],
          data: amountData(1_000_000_000n),
          logIndex: 0,
          decoded: null,
        },
      ],
    } as ExplorerTxResponse;
    expect(transfersInExplorerTx(TOKEN, hash, tx)).toEqual([
      {
        txHash: hash,
        blockNumber: 0x26e9df,
        logIndex: 0,
        from: ZERO,
        to: HOLDER,
        amount: 1_000_000_000n,
      },
    ]);
  });

  it('dedupes transfers and orders them newest first', () => {
    const older: TokenTransfer = {
      txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      blockNumber: 10,
      logIndex: 1,
      from: ZERO,
      to: HOLDER,
      amount: 1n,
    };
    const newer: TokenTransfer = { ...older, txHash: `0x${'22'.repeat(32)}`, blockNumber: 11, logIndex: 0 };
    const duplicate = { ...newer, amount: 99n };
    expect(mergeTokenTransfers([older, newer, duplicate]).map((row) => row.txHash)).toEqual([
      newer.txHash,
      older.txHash,
    ]);
  });
});
