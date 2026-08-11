// Per-chain server config for the TIPS API. Each chain used to be its own
// tips-ui deployment (chain baked in via TIPS_UI_* env); here one deployment
// serves all chains, so S3 client, bucket, and RPC URL are resolved per
// TipsChain from TIPS_<CHAIN>_* env vars. Server-only: never import from client.
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

import type { TipsChain } from '../../tips/chains';

// Env var infix for each chain: TIPS_MAINNET_*, TIPS_SEPOLIA_*, TIPS_ZERONET_*.
const ENV_PREFIX: Record<TipsChain, string> = {
  mainnet: 'MAINNET',
  sepolia: 'SEPOLIA',
  zeronet: 'ZERONET',
};

type ChainS3Config = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

function envValue(names: string[]): string | undefined {
  return names.map((name) => process.env[name]).find(Boolean);
}

function getS3Config(chain: TipsChain): ChainS3Config {
  const prefix = ENV_PREFIX[chain];
  return {
    bucket: envValue([`TIPS_${prefix}_S3_BUCKET`]) ?? 'tips',
    region: envValue([`TIPS_${prefix}_S3_REGION`]) ?? 'us-east-1',
    endpoint: envValue([`TIPS_${prefix}_S3_ENDPOINT`]),
    accessKeyId: envValue([`TIPS_${prefix}_S3_ACCESS_KEY_ID`]),
    secretAccessKey: envValue([`TIPS_${prefix}_S3_SECRET_ACCESS_KEY`]),
  };
}

const s3Clients = new Map<TipsChain, S3Client>();

// Mirrors tips-ui's createS3Client (forcePathStyle + optional endpoint +
// optional static credentials), but memoized per chain. With no endpoint or
// credentials this behaves like the default AWS SDK config.
export function getS3Client(chain: TipsChain): S3Client {
  const existing = s3Clients.get(chain);
  if (existing) {
    return existing;
  }

  const s3Config = getS3Config(chain);
  const config: S3ClientConfig = {
    region: s3Config.region,
    forcePathStyle: true,
  };

  if (s3Config.endpoint) {
    config.endpoint = s3Config.endpoint;
  }

  if (s3Config.accessKeyId && s3Config.secretAccessKey) {
    config.credentials = {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    };
  }

  const client = new S3Client(config);
  s3Clients.set(chain, client);
  return client;
}

export function getBucketName(chain: TipsChain): string {
  return getS3Config(chain).bucket;
}

export function getRpcUrl(chain: TipsChain): string {
  return envValue([`TIPS_${ENV_PREFIX[chain]}_RPC_URL`]) ?? 'http://localhost:8545';
}

// Audit events JSON-RPC endpoint for a chain. Unlike S3/RPC there is no default:
// audit is opt-in per chain via TIPS_<CHAIN>_AUDIT_RPC_URL. When unset, the audit
// source is treated as disabled and the routes fall back to the S3 archive.
export function getAuditRpcUrl(chain: TipsChain): string | undefined {
  return envValue([`TIPS_${ENV_PREFIX[chain]}_AUDIT_RPC_URL`]);
}

export function isAuditConfigured(chain: TipsChain): boolean {
  return Boolean(getAuditRpcUrl(chain));
}
