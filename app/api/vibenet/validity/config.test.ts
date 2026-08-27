import { afterEach, describe, expect, it } from 'vitest';

import { VIBENET_RPC_URL } from '../../../vibenet/library/config';
import { getReadRpcUrl, getSubmitRpcUrl } from './config';

const originalRead = process.env.VALIDITY_DEMO_RPC_URL;
const originalSubmit = process.env.VALIDITY_DEMO_SUBMIT_RPC_URL;

afterEach(() => {
  if (originalRead === undefined) delete process.env.VALIDITY_DEMO_RPC_URL;
  else process.env.VALIDITY_DEMO_RPC_URL = originalRead;
  if (originalSubmit === undefined) delete process.env.VALIDITY_DEMO_SUBMIT_RPC_URL;
  else process.env.VALIDITY_DEMO_SUBMIT_RPC_URL = originalSubmit;
});

describe('validity demo RPC config', () => {
  it('defaults to the public Vibenet RPC for reads and submits', () => {
    delete process.env.VALIDITY_DEMO_RPC_URL;
    delete process.env.VALIDITY_DEMO_SUBMIT_RPC_URL;
    expect(getReadRpcUrl()).toBe(VIBENET_RPC_URL);
    expect(getSubmitRpcUrl()).toBe(VIBENET_RPC_URL);
  });

  it('uses a single custom RPC for both when submit is unset', () => {
    process.env.VALIDITY_DEMO_RPC_URL = 'http://127.0.0.1:8545';
    delete process.env.VALIDITY_DEMO_SUBMIT_RPC_URL;
    expect(getReadRpcUrl()).toBe('http://127.0.0.1:8545');
    expect(getSubmitRpcUrl()).toBe('http://127.0.0.1:8545');
    delete process.env.VALIDITY_DEMO_RPC_URL;
  });
});
