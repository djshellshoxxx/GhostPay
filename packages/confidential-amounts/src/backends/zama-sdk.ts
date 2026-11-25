import type { Hex } from 'viem';
import { CtError, requireInput, type CtErrorCode } from '../errors.js';
import { assertCtChain, CT1_MANIFEST, manifestForChain, type CtManifest } from '../manifest.js';
import type { ZamaSdkPort, ZamaSession } from './zama.js';

/**
 * The subset of `@zama-fhe/sdk` 3.7.1 this package uses, loaded lazily (CT-SUP-1). Kept as a
 * function so that nothing from `@zama-fhe/*` is imported until a CT-1 session is opened.
 */
export interface ZamaSdkModules {
  /** `@zama-fhe/sdk` main entry. */
  readonly sdk: typeof import('@zama-fhe/sdk');
  /** `@zama-fhe/sdk/viem` adapter. */
  readonly adapter: typeof import('@zama-fhe/sdk/viem');
  /** `@zama-fhe/sdk/chains` presets. */
  readonly chains: typeof import('@zama-fhe/sdk/chains');
  /** Relayer factory for the chosen runtime. */
  readonly relayer: { readonly make: () => import('@zama-fhe/sdk').RelayerConfig };
  /** viem core. */
  readonly viem: typeof import('viem');
  /** viem accounts. */
  readonly accounts: typeof import('viem/accounts');
}

/** Options of {@link createZamaSdkPort}. */
export interface ZamaSdkPortOptions {
  /** JSON-RPC URL per chain id (your own node; a public RPC sees your addresses). */
  readonly rpcUrls: Readonly<Record<number, string>>;
  /** `node` for Node.js, `web` for browsers, `cleartext` for the local Zama cleartext executor (31337 only). */
  readonly runtime: 'node' | 'web' | 'cleartext';
  /** Module loader. Default: dynamic `import()`s. Injectable for tests. */
  readonly load?: (runtime: 'node' | 'web' | 'cleartext') => Promise<ZamaSdkModules>;
  /** Manifest for the relayer origin and chain name (default {@link CT1_MANIFEST}); use the one given to `ZamaBackend`. */
  readonly manifest?: CtManifest;
}

/**
 * Default loader: dynamic `import()` of the pinned SDK (3.7.1). Not executed unless a CT-1
 * session is opened, so the core bundle never contains `@zama-fhe/*`.
 */
export async function loadZamaSdk(runtime: 'node' | 'web' | 'cleartext'): Promise<ZamaSdkModules> {
  const [sdk, adapter, chains, viem, accounts] = await Promise.all([
    import('@zama-fhe/sdk'),
    import('@zama-fhe/sdk/viem'),
    import('@zama-fhe/sdk/chains'),
    import('viem'),
    import('viem/accounts'),
  ]);
  if (runtime === 'node') {
    const m = await import('@zama-fhe/sdk/node');
    return { sdk, adapter, chains, viem, accounts, relayer: { make: () => m.node() } };
  }
  if (runtime === 'web') {
    const m = await import('@zama-fhe/sdk/web');
    return { sdk, adapter, chains, viem, accounts, relayer: { make: () => m.web() } };
  }
  return { sdk, adapter, chains, viem, accounts, relayer: { make: () => sdk.cleartext() } };
}

/**
 * @internal Runs `fn`; a failure that is not already a {@link CtError} becomes `CtError(code, message)`.
 * Raw SDK and viem errors can carry key material (viem's invalid-key error prints the key scalar) or
 * relayer details, so their messages are never propagated.
 */
async function mapped<T>(fn: () => Promise<T>, code: CtErrorCode, message: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CtError) throw e;
    throw new CtError(code, message);
  }
}

/** @internal Unwraps a bigint clear value or fails. */
function asBigint(v: unknown): bigint {
  if (typeof v !== 'bigint') throw new CtError('DECRYPT_FAILED', 'unexpected decrypted value type');
  return v;
}

/**
 * Creates the default {@link ZamaSdkPort} over `@zama-fhe/sdk`.
 *
 * Each `open` builds a fresh SDK instance with in-memory storage (permits and transport keys are
 * never persisted: a persisted permit would record the stealth address in browser storage) and
 * `telemetry: false` (no `x-zama-sdk-*` usage headers, CT-SUP-3).
 * Every failure is a {@link CtError} with a fixed message (`BACKEND_UNAVAILABLE` for session setup and
 * encryption, `DECRYPT_FAILED` for user decryption, `PROOF_UNAVAILABLE` for public decryption).
 * @security [UNVERIFIED] Written against the 3.7.1 type declarations; never run against a live
 * relayer or RPC. The SDK has no per-request transport hook, so CT-DEC-2 transport isolation must be
 * done at process level (e.g. one Tor circuit per scheduled job).
 */
export function createZamaSdkPort(o: ZamaSdkPortOptions): ZamaSdkPort {
  const load = o.load ?? loadZamaSdk;
  return {
    async open({ chainId, stealthKey }): Promise<ZamaSession> {
      assertCtChain(chainId, 'ct1-zama');
      const manifest = manifestForChain(chainId, o.manifest ?? CT1_MANIFEST);
      const rpcUrl = o.rpcUrls[chainId];
      requireInput(rpcUrl !== undefined && rpcUrl !== '', 'rpcUrl for this chain is required');
      if (o.runtime === 'cleartext') requireInput(chainId === 31337, 'cleartext runtime is local-only');
      return mapped(
        () => openSession(load, o.runtime, chainId, rpcUrl, manifest, stealthKey),
        'BACKEND_UNAVAILABLE',
        'could not start a CT-1 SDK session',
      );
    },
  };
}

/** @internal Builds one SDK instance and wraps it as a {@link ZamaSession}. Raw errors are mapped by the caller. */
async function openSession(
  load: (runtime: 'node' | 'web' | 'cleartext') => Promise<ZamaSdkModules>,
  runtime: 'node' | 'web' | 'cleartext',
  chainId: number,
  rpcUrl: string,
  manifest: { readonly name: string; readonly relayerUrl: string },
  stealthKey: Hex | undefined,
): Promise<ZamaSession> {
  const m = await load(runtime);
  const preset = chainId === 11155111 ? m.chains.sepolia : m.chains.hardhat;
  const chain = { ...preset, network: rpcUrl, relayerUrl: manifest.relayerUrl };
  const viemChain = m.viem.defineChain({
    id: chainId,
    name: manifest.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const transport = m.viem.http(rpcUrl);
  const publicClient = m.viem.createPublicClient({ chain: viemChain, transport });
  // The SDK's viem config requires a wallet. Sessions that only encrypt or public-decrypt get a
  // throw-away key that never signs anything bound to a user address.
  const account = m.accounts.privateKeyToAccount(stealthKey ?? m.accounts.generatePrivateKey());
  const walletClient = m.viem.createWalletClient({ chain: viemChain, transport, account });
  const config = m.adapter.createConfig({
    chains: [chain],
    publicClient,
    walletClient,
    // The chain-id key set is a union type (11155111 | 31337); only the active chain is present at runtime.
    relayers: { [chainId]: m.relayer.make() } as Record<11155111 | 31337, import('@zama-fhe/sdk').RelayerConfig>,
    storage: new m.sdk.MemoryStorage(),
    telemetry: false,
  });
  const zama = new m.sdk.ZamaSDK(config);
  return {
    encrypt({ contractAddress, userAddress, value }) {
      return mapped(async () => {
        const r = await zama.encrypt({ values: [{ type: 'euint64', value }], contractAddress, userAddress });
        const handle = r.encryptedValues[0];
        if (handle === undefined) throw new CtError('DECRYPT_FAILED', 'encryption returned no handle');
        return { handle, inputProof: r.inputProof };
      }, 'BACKEND_UNAVAILABLE', 'client-side encryption failed');
    },
    decryptValue({ handle, contractAddress }) {
      return mapped(async () => {
        const out = await zama.decryption.decryptValues([{ encryptedValue: handle, contractAddress }]);
        return asBigint(out[handle]);
      }, 'DECRYPT_FAILED', 'user decryption failed');
    },
    decryptPublic(handle: Hex) {
      return mapped(async () => {
        const r = await zama.decryption.decryptPublicValues([handle]);
        return { cleartext: asBigint(r.clearValues[handle]), decryptionProof: r.decryptionProof };
      }, 'PROOF_UNAVAILABLE', 'public decryption proof unavailable');
    },
    close() {
      try {
        zama.terminate();
      } catch {
        // Best effort: a failing terminate must not surface a raw SDK error.
      }
    },
  };
}
