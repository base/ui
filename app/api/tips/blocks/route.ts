import { resolveTipsChain } from '../../../tips/chains';
import { getRpcUrl } from '../config';

import { tipsDisabledResponse } from '../guard';

export const runtime = 'nodejs';

export interface BlockSummary {
  hash: string;
  number: number;
  timestamp: number;
  transactionCount: number;
}

export interface BlocksResponse {
  blocks: BlockSummary[];
}

async function fetchLatestBlockNumber(rpcUrl: string): Promise<number | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    const data = await response.json();
    if (data.error || !data.result) {
      return null;
    }

    return parseInt(data.result, 16);
  } catch (error) {
    console.error('Failed to fetch latest block number:', error);
    return null;
  }
}

async function fetchBlockByNumber(
  rpcUrl: string,
  blockNumber: number,
): Promise<BlockSummary | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [`0x${blockNumber.toString(16)}`, false],
        id: 1,
      }),
    });

    const data = await response.json();
    if (data.error || !data.result) {
      return null;
    }

    const block = data.result;
    return {
      hash: block.hash,
      number: parseInt(block.number, 16),
      timestamp: parseInt(block.timestamp, 16),
      transactionCount: block.transactions?.length ?? 0,
    };
  } catch (error) {
    console.error(`Failed to fetch block ${blockNumber}:`, error);
    return null;
  }
}

export async function GET(request: Request) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));
  const rpcUrl = getRpcUrl(chain);

  try {
    const latestBlockNumber = await fetchLatestBlockNumber(rpcUrl);
    if (latestBlockNumber === null) {
      return Response.json({ error: 'Failed to fetch latest block' }, { status: 500 });
    }

    const blockNumbers = Array.from({ length: 10 }, (_, i) => latestBlockNumber - i).filter(
      (n) => n >= 0,
    );

    const blocks = await Promise.all(
      blockNumbers.map((blockNumber) => fetchBlockByNumber(rpcUrl, blockNumber)),
    );

    const validBlocks = blocks.filter((block): block is BlockSummary => block !== null);

    const response: BlocksResponse = { blocks: validBlocks };

    return Response.json(response);
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
