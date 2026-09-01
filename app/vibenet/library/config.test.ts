import { describe, expect, it } from 'vitest';

import { wsUrlFromHttp } from './config';

describe('wsUrlFromHttp', () => {
  it('maps HTTPS RPC to the public /ws path', () => {
    expect(wsUrlFromHttp('https://rpc.vibes.base.org')).toBe('wss://rpc.vibes.base.org/ws');
  });

  it('maps HTTP localhost to ws', () => {
    expect(wsUrlFromHttp('http://127.0.0.1:8545')).toBe('ws://127.0.0.1:8545/ws');
  });

  it('rejects non-http URLs', () => {
    expect(wsUrlFromHttp('wss://already.example/ws')).toBeNull();
  });
});
