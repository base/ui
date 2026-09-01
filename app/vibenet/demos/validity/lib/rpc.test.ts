import { afterEach, describe, expect, it, vi } from 'vitest';

import { VIBENET_RPC_URL } from '../../../library/config';
import { describeValidityError, sendValidityTransaction } from './rpc';

describe('describeValidityError', () => {
  it('collapses viem method-not-found dumps into one sentence', () => {
    const dump = [
      'The method "base_sendRawTransactionValidity" does not exist / is not available.',
      '',
      'URL: https://rpc.vibes.base.org',
      'Request body: {"method":"base_sendRawTransactionValidity","params":[{"tx":"0x02"}]}',
      'Details: Method not found',
    ].join('\n');
    expect(describeValidityError(new Error(dump))).toMatch(/does not expose base_sendRawTransactionValidity/);
    expect(describeValidityError(new Error(dump))).not.toMatch(/Request body/);
  });

  it('keeps a short unrelated error', () => {
    expect(describeValidityError(new Error('Not enough token inventory to swap.'))).toBe(
      'Not enough token inventory to swap.',
    );
  });

  it('unwraps viem Missing or invalid parameters to the RPC details', () => {
    const err = Object.assign(new Error('Missing or invalid parameters.\n\nURL: /rpc\nDetails: storage predicate at index 2 has value bits set outside its mask'), {
      shortMessage: 'Missing or invalid parameters',
      details: 'storage predicate at index 2 has value bits set outside its mask',
    });
    expect(describeValidityError(err)).toBe(
      'storage predicate at index 2 has value bits set outside its mask',
    );
  });
});

describe('sendValidityTransaction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts base_sendRawTransactionValidity to the Vibenet RPC', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ result: '0xabc' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendValidityTransaction('0x01', [])).resolves.toBe('0xabc');
    expect(fetchMock).toHaveBeenCalledWith(
      VIBENET_RPC_URL,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('base_sendRawTransactionValidity'),
      }),
    );
  });
});
