import { afterEach, describe, expect, it } from 'vitest';

import { VIBENET_RPC_URL } from '../../../vibenet/library/config';
import { getReadRpcUrl, getSubmitRpcUrl, getWsRpcUrl, wsUrlFromHttp } from './config';

const originalRead = process.env.VALIDITY_DEMO_RPC_URL;
const originalSubmit = process.env.VALIDITY_DEMO_SUBMIT_RPC_URL;
const originalWs = process.env.VALIDITY_DEMO_WS_URL;

afterEach(() => {
  if (originalRead === undefined) delete process.env.VALIDITY_DEMO_RPC_URL;
  else process.env.VALIDITY_DEMO_RPC_URL = originalRead;
  if (originalSubmit === undefined) delete process.env.VALIDITY_DEMO_SUBMIT_RPC_URL;
  else process.env.VALIDITY_DEMO_SUBMIT_RPC_URL = originalSubmit;
  if (originalWs === undefined) delete process.env.VALIDITY_DEMO_WS_URL;
  else process.env.VALIDITY_DEMO_WS_URL = originalWs;
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

  it('derives the public Vibenet /ws URL from HTTPS RPC', () => {
    delete process.env.VALIDITY_DEMO_WS_URL;
    expect(wsUrlFromHttp('https://rpc.vibes.base.org')).toBe('wss://rpc.vibes.base.org/ws');
    process.env.VALIDITY_DEMO_RPC_URL = 'https://rpc.vibes.base.org';
    expect(getWsRpcUrl()).toBe('wss://rpc.vibes.base.org/ws');
    delete process.env.VALIDITY_DEMO_RPC_URL;
  });

  it('lets VALIDITY_DEMO_WS_URL win', () => {
    process.env.VALIDITY_DEMO_WS_URL = 'wss://example.test/ws';
    expect(getWsRpcUrl()).toBe('wss://example.test/ws');
    delete process.env.VALIDITY_DEMO_WS_URL;
  });
});
