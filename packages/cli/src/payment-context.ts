import { createHash } from 'node:crypto';
import {
  ChainAdapterError, MAX_MANIFEST_BYTES, createClient, findChain, manifestDigest, validateManifest,
  validateRpcUrl, verifyDeployment, verifyObjectManifestSignature,
  type ChainConfig, type DeploymentManifest, type ManifestSignatureResult, type RpcClient, type RpcTransport,
} from '@ghostpay/chain-adapters';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { parseIntOption, requireValue, type Parsed } from './args.js';
import type { Ctx } from './ctx.js';
import { CliError, failError, ioError, usageError } from './io.js';

export const ONLINE_OPTS = { online: 'flag', 'rpc-file': 'value', 'rpc-env': 'value', 'secondary-rpc-file': 'value', 'secondary-rpc-env': 'value', 'allow-insecure-localhost': 'flag' } as const;
export const MANIFEST_OPTS = { manifest: 'value', 'manifest-digest': 'value', 'release-key': 'multi' } as const;
const MAX_RPC_CALLS = 256;
const MAX_RPC_BYTES = 16 * 1024 * 1024;
const RPC_DEADLINE_MS = 60_000;

/** Sanitize library/provider failures without leaking their response bodies or endpoints. */
export async function chainBoundary<T>(operation: () => Promise<T> | T): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof CliError) throw error;
    if (error instanceof ChainAdapterError) {
      const kind = ['RPC_FAILURE', 'RESPONSE_TOO_LARGE'].includes(error.code) ? 'network'
        : ['RPC_URL_REJECTED', 'CHAIN_MISMATCH', 'INVALID_MANIFEST', 'DEPLOYMENT_UNVERIFIED'].includes(error.code) ? 'config'
          : error.code === 'CHAIN_DISABLED' ? 'unsupported' : 'fail';
      throw new CliError(kind, error.code, `chain operation rejected (${error.code}).`);
    }
    throw failError('INVALID_INPUT', 'chain input or evidence is invalid.');
  }
}

export function configuredChain(a: Parsed, enabledOnly = false): ChainConfig {
  const id = parseIntOption(requireValue(a, 'chain'), 'chain', 1, Number.MAX_SAFE_INTEGER);
  const chain = findChain(id);
  if (chain === undefined) throw new CliError('unsupported', 'UNSUPPORTED_CHAIN', 'unknown chain identifier.');
  if (enabledOnly && (!chain.enabled || !chain.testnet))
    throw new CliError('unsupported', 'CHAIN_DISABLED', 'live GhostPay verification is limited to enabled testnets.');
  return chain;
}

export async function readManifest(ctx: Ctx, path: string, chainId: number): Promise<DeploymentManifest> {
  const text = await ctx.read(path);
  if (new TextEncoder().encode(text).length > MAX_MANIFEST_BYTES) throw failError('INVALID_MANIFEST', 'deployment manifest exceeds its size limit.');
  return validateManifest(parseStrictJson(text), chainId);
}

export function manifestTrust(m: DeploymentManifest, a: Parsed, required: boolean): {
  readonly digest: string; readonly trusted: boolean; readonly signature: ManifestSignatureResult;
} {
  const digest = manifestDigest(m);
  const requested = a.values.get('manifest-digest');
  if (requested !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(requested)) throw usageError('BAD_MANIFEST_DIGEST', '--manifest-digest must be a 32-byte 0x-hex digest obtained independently.');
  if (requested !== undefined && requested.toLowerCase() !== digest.toLowerCase())
    throw new CliError('config', 'MANIFEST_PIN_MISMATCH', 'manifest differs from the independently supplied digest.');
  const keys = a.multi.get('release-key') ?? [];
  if (keys.length > 16 || keys.some((key) => !/^(?:02|03)[0-9a-fA-F]{64}$/.test(key)))
    throw usageError('BAD_RELEASE_KEY', '--release-key requires a compressed secp256k1 public key (maximum 16).');
  const signature = verifyObjectManifestSignature(m, keys);
  if (keys.length > 0 && signature.status !== 'valid')
    throw new CliError('config', 'MANIFEST_SIGNATURE_INVALID', 'manifest does not have a valid signature from the supplied release keys.');
  const trusted = requested !== undefined || signature.status === 'valid';
  if (required && !trusted) throw new CliError('config', 'MANIFEST_TRUST_REQUIRED', 'supply an independently obtained --manifest-digest or --release-key before live verification.');
  return { digest, trusted, signature };
}

export interface RpcSession {
  readonly client: RpcClient;
  readonly secondary?: RpcClient;
  /** Binds the captured endpoint configuration without exposing endpoint values. */
  readonly providerFingerprint: string;
  readonly stats: { calls: number; bytes: number; transportFailures: number };
}

/** Explicit opt-in, private endpoints, one shared request/byte/time budget per invocation. */
export async function rpcSession(ctx: Ctx, a: Parsed, chain: ChainConfig): Promise<RpcSession> {
  if (!a.flags.has('online')) throw usageError('ONLINE_REQUIRED', 'this command needs explicit --online consent for read-only RPC requests.');
  const transport = ctx.io.rpcTransport;
  if (transport === undefined) throw new CliError('network', 'RPC_UNAVAILABLE', 'no RPC transport is available in this runtime.');
  const allowInsecureLocalhost = a.flags.has('allow-insecure-localhost');
  const endpoint = async (prefix: 'rpc' | 'secondary-rpc'): Promise<string> => {
    const path = a.values.get(`${prefix}-file`);
    const name = a.values.get(`${prefix}-env`);
    if (path !== undefined && name !== undefined) throw usageError('RPC_SOURCE_AMBIGUOUS', 'choose one file or named environment source for each RPC endpoint.');
    if (path === undefined && name === undefined) throw usageError('RPC_SOURCE_MISSING', 'a private RPC endpoint source is required: --rpc-file PATH or --rpc-env NAME.');
    let value: string;
    if (path !== undefined) value = await ctx.secret(path);
    else {
      if (name === undefined || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) throw usageError('BAD_ENV_NAME', 'RPC environment options take a variable NAME, never its value.');
      const configured = ctx.io.env[name];
      if (configured === undefined || configured === '') throw ioError('ENV_UNSET', 'the requested RPC environment variable is not set.');
      value = configured;
    }
    const raw = value.trim();
    if (raw.length > 4096) throw new CliError('config', 'RPC_URL_REJECTED', 'RPC endpoint is too long.');
    const url = validateRpcUrl(raw, { allowInsecureLocalhost });
    if (!url.startsWith('https:') && !url.startsWith('http:')) throw new CliError('config', 'RPC_URL_REJECTED', 'the CLI RPC transport requires HTTPS, or explicit loopback HTTP.');
    return url;
  };
  const primary = await endpoint('rpc');
  const secondaryUrl = a.values.has('secondary-rpc-file') || a.values.has('secondary-rpc-env') ? await endpoint('secondary-rpc') : undefined;
  if (secondaryUrl === primary) throw new CliError('config', 'DUPLICATE_PROVIDER', 'the secondary endpoint must differ from the primary endpoint.');
  const providerFingerprint = createHash('sha256').update('GhostPay/cli-rpc-configuration/v1\n').update(JSON.stringify({
    chainId: chain.chainId, primary, secondary: secondaryUrl ?? null, allowInsecureLocalhost,
  })).digest('hex');
  const stats = { calls: 0, bytes: 0, transportFailures: 0 };
  // Reserve each outstanding response's *maximum* before starting transport.
  // Both providers share this budget, including their initialization calls.
  let reservedBytes = 0;
  const started = ctx.io.nowSeconds() * 1000;
  const bounded: RpcTransport = {
    async send(url, body, init) {
      const remaining = RPC_DEADLINE_MS - (ctx.io.nowSeconds() * 1000 - started);
      if (++stats.calls > MAX_RPC_CALLS || remaining <= 0)
        throw new ChainAdapterError('RPC_FAILURE', 'command RPC budget exhausted');
      if (!Number.isSafeInteger(init.maxBytes) || init.maxBytes <= 0 ||
          init.maxBytes > MAX_RPC_BYTES - stats.bytes - reservedBytes)
        throw new ChainAdapterError('RPC_FAILURE', 'command RPC byte budget exhausted');
      reservedBytes += init.maxBytes;
      try {
        const text = await transport.send(url, body, { timeoutMs: Math.min(init.timeoutMs, remaining), maxBytes: init.maxBytes });
        const bytes = new TextEncoder().encode(text).length;
        // Do not trust injected or nonconforming transports to enforce maxBytes.
        if (bytes > init.maxBytes) throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'RPC response exceeds its reserved byte limit');
        stats.bytes += bytes;
        return text;
      } catch {
        stats.transportFailures++;
        throw new ChainAdapterError('RPC_FAILURE', 'bounded RPC request failed');
      } finally {
        reservedBytes -= init.maxBytes;
      }
    },
  };
  const options = { transport: bounded, retries: 0, timeoutMs: 5000, maxResponseBytes: 1024 * 1024,
    allowInsecureLocalhost, chainRecheckMs: 0, now: () => ctx.io.nowSeconds() * 1000 };
  const client = await createClient(chain, primary, options);
  const secondary = secondaryUrl === undefined ? undefined : await createClient(chain, secondaryUrl, options);
  return { client, ...(secondary === undefined ? {} : { secondary }), providerFingerprint, stats };
}

export interface VerifiedContext extends RpcSession {
  readonly manifest: DeploymentManifest;
  readonly manifestDigest: string;
}

export async function verifiedContext(ctx: Ctx, a: Parsed, chain: ChainConfig): Promise<VerifiedContext> {
  if (!chain.enabled || !chain.testnet) throw new CliError('unsupported', 'CHAIN_DISABLED', 'live GhostPay verification is limited to enabled testnets.');
  const manifest = await readManifest(ctx, requireValue(a, 'manifest'), chain.chainId);
  const trust = manifestTrust(manifest, a, true);
  const session = await rpcSession(ctx, a, chain);
  await verifyDeployment(manifest, session.client, session.secondary === undefined ? {} : { secondary: session.secondary });
  return { ...session, manifest, manifestDigest: trust.digest };
}
