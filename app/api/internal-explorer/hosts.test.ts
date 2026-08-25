import assert from 'node:assert/strict';

import { afterEach, beforeEach, describe, test } from 'vitest';

import { resolveExplorerChainFromRequest } from './chain';
import { getExplorerHost, getExplorerHosts } from './config';
import { DEFAULT_EXPLORER_CHAIN, resolveExplorerChain, type ExplorerChain } from '../../internal-explorer/chains';
import {
  configuredHostOrigin,
  defaultExplorerChainForOrigin,
  explorerHostEnvironment,
  explorerHostLabel,
  explorerHostSwitchHref,
  originFromHostHeader,
  originsEqual,
  planHostSwitch,
} from '../../internal-explorer/hosts';

const HOST_KEYS = ['BASE_UI_ZERONET_HOST', 'BASE_UI_MAINNET_HOST', 'BASE_UI_SEPOLIA_HOST'] as const;

const DEPLOYED_HOSTS: Record<ExplorerChain, string> = {
  zeronet: 'https://base-ui.aws-dev.cbhq.net',
  mainnet: 'https://base-ui.aws.cbhq.net',
  sepolia: 'https://base-ui.aws.cbhq.net',
};

const previousEnv: Partial<Record<(typeof HOST_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of HOST_KEYS) {
    previousEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of HOST_KEYS) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

describe('originsEqual', () => {
  test('treats a Host header and a full origin as the same host', () => {
    assert.equal(originsEqual('base-ui.aws-dev.cbhq.net', 'https://base-ui.aws-dev.cbhq.net'), true);
    assert.equal(originsEqual('https://base-ui.aws.cbhq.net/', 'base-ui.aws.cbhq.net'), true);
  });

  test('ignores a default https port', () => {
    assert.equal(
      originsEqual('https://base-ui.aws.cbhq.net:443', 'https://base-ui.aws.cbhq.net'),
      true,
    );
  });

  test('distinguishes aws-dev from aws prod', () => {
    assert.equal(
      originsEqual('https://base-ui.aws-dev.cbhq.net', 'https://base-ui.aws.cbhq.net'),
      false,
    );
  });

  test('keeps a non-default port', () => {
    assert.equal(originsEqual('localhost:3000', 'http://localhost:3000'), true);
    assert.equal(originsEqual('localhost:3000', 'http://localhost:3001'), false);
  });

  test('rejects empty values', () => {
    assert.equal(originsEqual('', 'https://base-ui.aws.cbhq.net'), false);
    assert.equal(originsEqual('https://base-ui.aws.cbhq.net', ''), false);
  });
});

describe('defaultExplorerChainForOrigin', () => {
  test('defaults to mainnet when no hosts are configured', () => {
    assert.equal(defaultExplorerChainForOrigin('http://localhost:3000', {}), 'mainnet');
    assert.equal(DEFAULT_EXPLORER_CHAIN, 'mainnet');
  });

  test('defaults to zeronet on the zeronet host', () => {
    assert.equal(
      defaultExplorerChainForOrigin('https://base-ui.aws-dev.cbhq.net', DEPLOYED_HOSTS),
      'zeronet',
    );
    assert.equal(defaultExplorerChainForOrigin('base-ui.aws-dev.cbhq.net', DEPLOYED_HOSTS), 'zeronet');
  });

  test('defaults to mainnet on the mainnet/sepolia host', () => {
    assert.equal(
      defaultExplorerChainForOrigin('https://base-ui.aws.cbhq.net', DEPLOYED_HOSTS),
      'mainnet',
    );
    assert.equal(defaultExplorerChainForOrigin('base-ui.aws.cbhq.net', DEPLOYED_HOSTS), 'mainnet');
  });

  test('falls back to mainnet when the origin matches none of the hosts', () => {
    assert.equal(defaultExplorerChainForOrigin('https://example.invalid', DEPLOYED_HOSTS), 'mainnet');
  });
});

describe('resolveExplorerChain', () => {
  test('keeps an explicit chain even when it belongs on another host', () => {
    assert.equal(
      resolveExplorerChain('mainnet', 'https://base-ui.aws-dev.cbhq.net', DEPLOYED_HOSTS),
      'mainnet',
    );
    assert.equal(
      resolveExplorerChain('zeronet', 'https://base-ui.aws.cbhq.net', DEPLOYED_HOSTS),
      'zeronet',
    );
  });

  test('defaults from origin when ?chain= is missing', () => {
    assert.equal(
      resolveExplorerChain(null, 'https://base-ui.aws-dev.cbhq.net', DEPLOYED_HOSTS),
      'zeronet',
    );
    assert.equal(
      resolveExplorerChain(undefined, 'https://base-ui.aws.cbhq.net', DEPLOYED_HOSTS),
      'mainnet',
    );
    assert.equal(resolveExplorerChain(null), 'mainnet');
  });

  test('treats an unknown chain param as missing', () => {
    assert.equal(
      resolveExplorerChain('goerli', 'https://base-ui.aws.cbhq.net', DEPLOYED_HOSTS),
      'mainnet',
    );
  });
});

describe('planHostSwitch', () => {
  test('replaces in place when the next chain is on this origin', () => {
    assert.equal(
      planHostSwitch('https://base-ui.aws.cbhq.net', 'sepolia', DEPLOYED_HOSTS, false),
      'replace',
    );
    assert.equal(
      planHostSwitch('https://base-ui.aws-dev.cbhq.net', 'zeronet', DEPLOYED_HOSTS, false),
      'replace',
    );
  });

  test('replaces in place when hosts are unset', () => {
    assert.equal(planHostSwitch('http://localhost:3000', 'mainnet', {}, false), 'replace');
    assert.equal(planHostSwitch('http://localhost:3000', 'zeronet', {}, true), 'replace');
  });

  test('prompts when the next chain is on another host', () => {
    assert.equal(
      planHostSwitch('https://base-ui.aws-dev.cbhq.net', 'mainnet', DEPLOYED_HOSTS, false),
      'prompt',
    );
    assert.equal(
      planHostSwitch('https://base-ui.aws.cbhq.net', 'zeronet', DEPLOYED_HOSTS, false),
      'prompt',
    );
  });

  test('navigates immediately when the skip-prompt flag is set', () => {
    assert.equal(
      planHostSwitch('https://base-ui.aws-dev.cbhq.net', 'mainnet', DEPLOYED_HOSTS, true),
      'navigate',
    );
    assert.equal(
      planHostSwitch('https://base-ui.aws.cbhq.net', 'zeronet', DEPLOYED_HOSTS, true),
      'navigate',
    );
  });
});

describe('explorerHostSwitchHref', () => {
  test('assigns the destination origin with ?chain= and other query params', () => {
    const href = explorerHostSwitchHref(
      'https://base-ui.aws.cbhq.net/',
      '/internal-explorer/blocks',
      'tab=rejected&cursor=1',
      'mainnet',
    );
    const url = new URL(href);
    assert.equal(url.origin, 'https://base-ui.aws.cbhq.net');
    assert.equal(url.pathname, '/internal-explorer/blocks');
    assert.equal(url.searchParams.get('chain'), 'mainnet');
    assert.equal(url.searchParams.get('tab'), 'rejected');
    assert.equal(url.searchParams.get('cursor'), '1');
  });

  test('overwrites an existing chain param', () => {
    const href = explorerHostSwitchHref(
      'https://base-ui.aws-dev.cbhq.net',
      '/internal-explorer',
      'chain=mainnet',
      'zeronet',
    );
    assert.equal(new URL(href).searchParams.get('chain'), 'zeronet');
  });
});

describe('host labels', () => {
  test('strips the scheme for display', () => {
    assert.equal(explorerHostLabel('https://base-ui.aws.cbhq.net'), 'base-ui.aws.cbhq.net');
  });

  test('labels the zeronet host as development and the rest as production', () => {
    assert.equal(
      explorerHostEnvironment('https://base-ui.aws-dev.cbhq.net', DEPLOYED_HOSTS),
      'development',
    );
    assert.equal(explorerHostEnvironment('https://base-ui.aws.cbhq.net', DEPLOYED_HOSTS), 'production');
  });

  test('canonicalizes a configured host to its origin', () => {
    assert.equal(configuredHostOrigin('https://base-ui.aws.cbhq.net/'), 'https://base-ui.aws.cbhq.net');
  });

  test('prefers x-forwarded-host over Host', () => {
    assert.equal(
      originFromHostHeader('internal.local', 'base-ui.aws.cbhq.net, other.local'),
      'base-ui.aws.cbhq.net',
    );
  });
});

describe('getExplorerHosts', () => {
  test('returns an empty map when BASE_UI_*_HOST is unset', () => {
    assert.deepEqual(getExplorerHosts(), {});
    assert.equal(getExplorerHost('zeronet'), undefined);
  });

  test('reads BASE_UI_<CHAIN>_HOST at call time', () => {
    process.env.BASE_UI_ZERONET_HOST = 'https://base-ui.aws-dev.cbhq.net';
    process.env.BASE_UI_MAINNET_HOST = 'https://base-ui.aws.cbhq.net';
    process.env.BASE_UI_SEPOLIA_HOST = 'https://base-ui.aws.cbhq.net';
    assert.deepEqual(getExplorerHosts(), DEPLOYED_HOSTS);
  });
});

describe('resolveExplorerChainFromRequest', () => {
  test('defaults from the Host header when ?chain= is missing', () => {
    process.env.BASE_UI_ZERONET_HOST = DEPLOYED_HOSTS.zeronet;
    process.env.BASE_UI_MAINNET_HOST = DEPLOYED_HOSTS.mainnet;
    process.env.BASE_UI_SEPOLIA_HOST = DEPLOYED_HOSTS.sepolia;

    const zeronetReq = new Request('https://base-ui.aws-dev.cbhq.net/api/internal-explorer/blocks', {
      headers: { host: 'base-ui.aws-dev.cbhq.net' },
    });
    assert.equal(resolveExplorerChainFromRequest(zeronetReq), 'zeronet');

    const prodReq = new Request('https://base-ui.aws.cbhq.net/api/internal-explorer/blocks', {
      headers: { host: 'base-ui.aws.cbhq.net' },
    });
    assert.equal(resolveExplorerChainFromRequest(prodReq), 'mainnet');
  });

  test('keeps an explicit ?chain= that does not match this host', () => {
    process.env.BASE_UI_ZERONET_HOST = DEPLOYED_HOSTS.zeronet;
    process.env.BASE_UI_MAINNET_HOST = DEPLOYED_HOSTS.mainnet;
    process.env.BASE_UI_SEPOLIA_HOST = DEPLOYED_HOSTS.sepolia;

    const request = new Request(
      'https://base-ui.aws-dev.cbhq.net/api/internal-explorer/blocks?chain=mainnet',
      { headers: { host: 'base-ui.aws-dev.cbhq.net' } },
    );
    assert.equal(resolveExplorerChainFromRequest(request), 'mainnet');
  });

  test('defaults to mainnet when hosts are unset', () => {
    const request = new Request('http://localhost:3000/api/internal-explorer/blocks', {
      headers: { host: 'localhost:3000' },
    });
    assert.equal(resolveExplorerChainFromRequest(request), 'mainnet');
  });
});
