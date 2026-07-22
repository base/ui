import { createHash, createHmac } from 'node:crypto';

import type { Snapshot, SnapshotComponent } from '../../snapshots/data';
import { COMPONENT_META, COMPONENT_ORDER } from '../../snapshots/data';

export const runtime = 'nodejs';

const R2_REGION = 'auto';
const R2_SERVICE = 's3';
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';

type NetworkConfig = {
  id: string;
  chainName: string;
  bucket: string;
  publicBaseUrl: string;
  envPrefix: string;
};

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
};

class R2RequestError extends Error {
  status: number;

  constructor(bucket: string, key: string, status: number) {
    super(`R2 request failed for ${bucket}/${key}: ${status}`);
    this.name = 'R2RequestError';
    this.status = status;
  }
}

type R2ManifestComponent = {
  size?: number;
  chunk_sizes?: number[];
  output_files?: { size?: number }[];
  chunk_output_files?: { size?: number }[][];
};

type R2Manifest = {
  block: number;
  chain_id: number | string;
  timestamp: number | string;
  image?: string;
  reth_version?: string;
  profile?: string;
  channel?: string;
  components: Record<string, R2ManifestComponent>;
};

const NETWORKS: NetworkConfig[] = [
  {
    id: 'mainnet',
    chainName: 'Base Mainnet',
    bucket: 'base-mainnet-reth-v2-snapshots',
    publicBaseUrl: 'https://mainnet-v2-snapshots.base.org',
    envPrefix: 'BASE_MAINNET',
  },
  {
    id: 'sepolia',
    chainName: 'Base Sepolia',
    bucket: 'base-sepolia-reth-v2-snapshots',
    publicBaseUrl: 'https://sepolia-v2-snapshots.base.org',
    envPrefix: 'BASE_SEPOLIA',
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get('network');
  const configs = network ? NETWORKS.filter((config) => config.id === network) : NETWORKS;

  if (network && configs.length === 0) {
    return Response.json({ error: `Unknown network: ${network}` }, { status: 400 });
  }

  const results = await Promise.allSettled(configs.map(async (config) => getLatestSnapshot(config)));

  const snapshots = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const errors = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          {
            network: configs[index].id,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
          },
        ]
      : [],
  );

  // Fail closed: if any configured network failed, surface an error rather than
  // returning a partial list the client would treat as a complete success.
  if (errors.length > 0) {
    return Response.json({ error: 'Failed to load snapshots from R2', details: errors }, { status: 502 });
  }

  return Response.json(snapshots, {
    status: 200,
    headers: { 'Cache-Control': CACHE_CONTROL },
  });
}

function envValue(names: string[]): string | undefined {
  return names.map((name) => process.env[name]).find(Boolean);
}

function getR2Config(network: NetworkConfig): R2Config | null {
  const bucketEnvPrefix = network.bucket.toUpperCase().replaceAll('-', '_');
  const accountId = envValue([
    `${network.envPrefix}_R2_ACCOUNT_ID`,
    `${bucketEnvPrefix}_R2_ACCOUNT_ID`,
    'R2_ACCOUNT_ID',
    'CLOUDFLARE_R2_ACCOUNT_ID',
  ]);
  const accessKeyId = envValue([
    `${network.envPrefix}_R2_ACCESS_KEY_ID`,
    `${bucketEnvPrefix}_R2_ACCESS_KEY_ID`,
  ]);
  const secretAccessKey = envValue([
    `${network.envPrefix}_R2_SECRET_ACCESS_KEY`,
    `${bucketEnvPrefix}_R2_SECRET_ACCESS_KEY`,
  ]);

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    endpoint:
      envValue([
        `${network.envPrefix}_R2_ENDPOINT`,
        `${bucketEnvPrefix}_R2_ENDPOINT`,
        'R2_ENDPOINT',
        'CLOUDFLARE_R2_ENDPOINT',
      ]) ?? `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

async function getLatestSnapshot(network: NetworkConfig): Promise<Snapshot> {
  const r2Config = getR2Config(network);

  if (!r2Config) {
    throw new Error(
      `Missing R2 configuration for ${network.id}. Set ${network.envPrefix}_R2_ACCESS_KEY_ID and ${network.envPrefix}_R2_SECRET_ACCESS_KEY.`,
    );
  }

  const { prefix: latestPrefix, manifest } = await getLatestSnapshotManifest(network.bucket, r2Config);

  return buildSnapshot(network, latestPrefix, manifest);
}

async function getLatestSnapshotManifest(
  bucket: string,
  r2Config: R2Config,
): Promise<{ prefix: string; manifest: R2Manifest }> {
  const prefixes: string[] = [];
  let continuationToken: string | undefined;

  do {
    const params = new URLSearchParams({ 'list-type': '2', delimiter: '/' });
    if (continuationToken) {
      params.set('continuation-token', continuationToken);
    }
    const xml = await getR2Text(bucket, '', r2Config, params);
    prefixes.push(...xmlTextValues(xml, 'Prefix'));
    continuationToken = xmlTextValues(xml, 'NextContinuationToken')[0];
  } while (continuationToken);

  const sortedPrefixes = prefixes
    .map((prefix) => prefix.replace(/\/$/, ''))
    .filter((prefix) => /^\d+$/.test(prefix))
    .sort((a, b) => Number(b) - Number(a));

  if (sortedPrefixes.length === 0) {
    throw new Error(`No snapshot folders found in ${bucket}`);
  }

  // Walk newest-first and use the first prefix that has a completed manifest;
  // the latest folder may still be uploading (manifest.json not yet present).
  for (const prefix of sortedPrefixes) {
    const manifestKey = `${prefix}/manifest.json`;
    try {
      return { prefix, manifest: await getR2Json<R2Manifest>(bucket, manifestKey, r2Config) };
    } catch (error) {
      if (error instanceof R2RequestError && error.status === 404) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`No completed snapshot manifests found in ${bucket}`);
}

async function getR2Json<T>(bucket: string, key: string, r2Config: R2Config): Promise<T> {
  const text = await getR2Text(bucket, key, r2Config);
  return JSON.parse(text) as T;
}

async function getR2Text(
  bucket: string,
  key: string,
  r2Config: R2Config,
  searchParams?: URLSearchParams,
): Promise<string> {
  const url = new URL(`${r2Config.endpoint.replace(/\/$/, '')}/${bucket}/${key}`);
  if (searchParams) {
    url.search = searchParams.toString();
  }
  const headers = signR2Request(url, r2Config);
  const response = await fetch(url, { headers, cache: 'no-store' });
  if (!response.ok) {
    throw new R2RequestError(bucket, key, response.status);
  }
  return response.text();
}

function signR2Request(url: URL, r2Config: R2Config): Headers {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hashHex('');
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = [
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n');
  const canonicalRequest = [
    'GET',
    encodePathname(url.pathname),
    canonicalQueryString(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashHex(canonicalRequest)].join('\n');
  const signingKey = getSignatureKey(r2Config.secretAccessKey, dateStamp, R2_REGION, R2_SERVICE);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${r2Config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return new Headers({
    Authorization: authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  });
}

function buildSnapshot(network: NetworkConfig, prefix: string, manifest: R2Manifest): Snapshot {
  const components = Object.entries(manifest.components)
    .map(([name, component]) => buildComponent(name, component))
    .sort((a, b) => componentSortIndex(a.name) - componentSortIndex(b.name));
  const size = components.reduce((sum, component) => sum + component.size, 0);
  const timestamp = String(manifest.timestamp);
  const manifestUrl = `${network.publicBaseUrl}/${prefix}/manifest.json`;
  const image = manifest.image ?? manifest.reth_version ?? 'reth v2';

  return {
    chainId: String(manifest.chain_id),
    chainName: network.chainName,
    network: network.id,
    block: manifest.block,
    timestamp,
    date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
    rethVersion: image,
    image,
    profile: manifest.profile ?? 'archive',
    channel: manifest.channel,
    size,
    isModular: true,
    components,
    archiveUrl: manifestUrl,
    archiveFile: `${prefix}/manifest.json`,
    metadataUrl: manifestUrl,
    manifestUrl,
  };
}

function buildComponent(name: string, component: R2ManifestComponent): SnapshotComponent {
  const metadata = COMPONENT_META[name] ?? { displayName: titleize(name), description: titleize(name) };
  return { name, ...metadata, size: componentSize(component) };
}

function componentSize(component: R2ManifestComponent): number {
  if (typeof component.size === 'number') return component.size;
  if (component.chunk_sizes) return component.chunk_sizes.reduce((sum, size) => sum + size, 0);
  if (component.output_files) return component.output_files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  if (component.chunk_output_files)
    return component.chunk_output_files.flat().reduce((sum, file) => sum + (file.size ?? 0), 0);
  return 0;
}

function componentSortIndex(name: string): number {
  const index = COMPONENT_ORDER.indexOf(name);
  return index === -1 ? COMPONENT_ORDER.length : index;
}

function titleize(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function xmlTextValues(xml: string, tagName: string): string[] {
  const matches = xml.matchAll(new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'gs'));
  return Array.from(matches, (match) => decodeXml(match[1] ?? ''));
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function hashHex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
  const dateKey = hmac(`AWS4${key}`, dateStamp);
  const dateRegionKey = hmac(dateKey, regionName);
  const dateRegionServiceKey = hmac(dateRegionKey, serviceName);
  return hmac(dateRegionServiceKey, 'aws4_request');
}

function canonicalQueryString(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
    )
    .map(([key, value]) => `${rfc3986Encode(key)}=${rfc3986Encode(value)}`)
    .join('&');
}

function encodePathname(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => rfc3986Encode(decodeURIComponent(segment)))
    .join('/');
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
