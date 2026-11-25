import { getAddress, isAddress, keccak256, type Address, type Hex } from 'viem';
import { CtError, requireInput } from './errors.js';
import type { CtBackendId } from './types.js';

/** Chain ids on which real funds exist. Refused everywhere in this package (CT-PAY-5). */
export const MAINNET_CHAIN_IDS: readonly number[] = [1, 10, 56, 137, 8453, 42161];

/** One pinned chain entry of the CT-1 manifest. */
export interface CtChainManifest {
  /** EVM chain id. */
  readonly chainId: number;
  /** Human name. */
  readonly name: string;
  /** Hosted relayer origin (CT-1 decrypt and input proofs). Empty for local chains. */
  readonly relayerUrl: string;
  /** Zama gateway chain id. */
  readonly gatewayChainId: number;
  /** Zama protocol contracts (addresses only; no deployments of GhostPay contracts exist). */
  readonly protocol: {
    readonly acl: Address;
    readonly coprocessor: Address;
    readonly kmsVerifier: Address;
    readonly inputVerifier: Address;
    readonly wrappersRegistry: Address | null;
  };
  /** Pinned runtime code hashes (`keccak256(eth_getCode)`), keyed by role. `null` = not yet pinned. */
  readonly codeHashes: Readonly<Record<string, Hex | null>>;
  /** GhostPay contracts for this chain. Empty until a manifest is deployed and reviewed. */
  readonly ghostpay: { readonly router: Address | null; readonly tokens: readonly Address[] };
}

/** The full CT-1 manifest. */
export interface CtManifest {
  /** Backend the manifest belongs to. */
  readonly backend: 'ct1-zama';
  /** Schema version. */
  readonly version: 1;
  /** Pinned chains, keyed by decimal chain id. */
  readonly chains: Readonly<Record<string, CtChainManifest>>;
  /** Provenance notes: where each value was read. */
  readonly provenance: readonly string[];
}

const ZERO_HASHES = { acl: null, coprocessor: null, kmsVerifier: null, inputVerifier: null } as const;

/**
 * Pinned CT-1 manifest. Protocol addresses were read from `@fhevm/solidity` 0.11.1 `ZamaConfig.sol`
 * and `@zama-fhe/sdk` 3.7.0 `chains` preset on 2026-10-21 (both agree); `manifest.test.ts` re-checks
 * them against the currently pinned `@zama-fhe/sdk` 3.7.1. Code hashes are NOT pinned: no RPC was
 * reachable from the build sandbox [UNVERIFIED]. No GhostPay router or token is pinned, so every
 * CT-1 builder of `ZamaBackend` refuses with this manifest (fail closed).
 */
export const CT1_MANIFEST: CtManifest = {
  backend: 'ct1-zama',
  version: 1,
  chains: {
    '11155111': {
      chainId: 11155111,
      name: 'Ethereum Sepolia',
      relayerUrl: 'https://relayer.testnet.zama.org',
      gatewayChainId: 10901,
      protocol: {
        acl: '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D',
        coprocessor: '0x92C920834Ec8941d2C77D188936E1f7A6f49c127',
        kmsVerifier: '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A',
        inputVerifier: '0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0',
        wrappersRegistry: '0x2f0750Bbb0A246059d80e94c454586a7F27a128e',
      },
      codeHashes: { ...ZERO_HASHES },
      ghostpay: { router: null, tokens: [] },
    },
    '31337': {
      chainId: 31337,
      name: 'Local Hardhat (fhEVM mock)',
      relayerUrl: '',
      gatewayChainId: 10901,
      protocol: {
        acl: '0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D',
        coprocessor: '0xe3a9105a3a932253A70F126eb1E3b589C643dD24',
        kmsVerifier: '0x901F8942346f7AB3a01F6D7613119Bca447Bb030',
        inputVerifier: '0x36772142b74871f255CbD7A3e89B401d3e45825f',
        wrappersRegistry: null,
      },
      codeHashes: { ...ZERO_HASHES },
      ghostpay: { router: null, tokens: [] },
    },
  },
  provenance: [
    '@fhevm/solidity 0.11.1 config/ZamaConfig.sol (ACL, Coprocessor, KMSVerifier for 11155111 and 31337)',
    '@zama-fhe/sdk 3.7.0 dist/esm/chains-*.js sepolia and hardhat presets (inputVerifier, gatewayChainId 10901, registry, relayerUrl)',
    'codeHashes: not pinned, no RPC reachable from the build sandbox',
  ],
};

/** Chains each backend may be used on. */
export const BACKEND_CHAINS: Readonly<Record<CtBackendId, readonly number[]>> = {
  'ct1-zama': [11155111, 31337],
  'ct2-fhenix': [],
  'ct3-inco': [],
  'ctm-cleartext': [31337],
};

/**
 * Chain guard used at every exported entry point (CT-PAY-4, CT-PAY-5).
 * @param chainId Chain id to check.
 * @param backend Backend the caller wants to use.
 * @throws {CtError} `MAINNET_REFUSED` for mainnet ids, `CHAIN_NOT_SUPPORTED` for anything not pinned for `backend`.
 * @security Testnet-only proof of concept: this is the single place that decides which chains are allowed.
 */
export function assertCtChain(chainId: number, backend: CtBackendId): void {
  requireInput(Number.isSafeInteger(chainId) && chainId > 0, 'chainId must be a positive integer');
  if (MAINNET_CHAIN_IDS.includes(chainId)) {
    throw new CtError('MAINNET_REFUSED', 'confidential amounts are testnet-only in this build');
  }
  if (!BACKEND_CHAINS[backend].includes(chainId)) {
    throw new CtError('CHAIN_NOT_SUPPORTED', 'backend is not available on this chain');
  }
}

/**
 * Returns the pinned manifest entry for a CT-1 chain.
 * @param chainId Chain id (guarded by {@link assertCtChain}).
 * @param manifest Manifest to read (default {@link CT1_MANIFEST}).
 */
export function manifestForChain(chainId: number, manifest: CtManifest = CT1_MANIFEST): CtChainManifest {
  assertCtChain(chainId, 'ct1-zama');
  const entry = manifest.chains[String(chainId)];
  if (!entry) throw new CtError('CHAIN_NOT_SUPPORTED', 'chain is not in the pinned manifest');
  return entry;
}

/**
 * Requires `address` to be the GhostPay router pinned for this chain.
 * @param entry Manifest entry of the chain (see {@link manifestForChain}).
 * @param address Parsed address the caller wants to use as router (or as the router operator).
 * @param label Field name for the error message.
 * @throws {CtError} `CHAIN_NOT_SUPPORTED` if the manifest pins no router (nothing deployed and reviewed: the
 * shipped {@link CT1_MANIFEST}); `MANIFEST_MISMATCH` if `address` is not the pinned router.
 * @security Fail closed: the router becomes an operator over the payer's whole confidential balance.
 */
export function assertManifestRouter(entry: CtChainManifest, address: Address, label = 'router'): void {
  const router = entry.ghostpay.router;
  if (router === null) throw new CtError('CHAIN_NOT_SUPPORTED', 'no GhostPay router is pinned for this chain');
  if (router.toLowerCase() !== address.toLowerCase()) {
    throw new CtError('MANIFEST_MISMATCH', `${label} is not the pinned GhostPay router`);
  }
}

/**
 * Requires `token` to be one of the confidential tokens pinned for this chain.
 * @throws {CtError} `CHAIN_NOT_SUPPORTED` if the manifest pins no token; `MANIFEST_MISMATCH` if `token` is not pinned.
 */
export function assertManifestToken(entry: CtChainManifest, token: Address): void {
  if (entry.ghostpay.tokens.length === 0) throw new CtError('CHAIN_NOT_SUPPORTED', 'no confidential token is pinned for this chain');
  if (!entry.ghostpay.tokens.some((t) => t.toLowerCase() === token.toLowerCase())) {
    throw new CtError('MANIFEST_MISMATCH', 'token is not a pinned confidential token');
  }
}

/**
 * Requires `contract` to be a pinned GhostPay contract (the router or a token), e.g. the contract an
 * encrypted input is bound to.
 * @throws {CtError} `CHAIN_NOT_SUPPORTED` if the manifest pins no GhostPay contract; `MANIFEST_MISMATCH` otherwise.
 */
export function assertManifestContract(entry: CtChainManifest, contract: Address): void {
  const { router, tokens } = entry.ghostpay;
  if (router === null && tokens.length === 0) throw new CtError('CHAIN_NOT_SUPPORTED', 'no GhostPay contract is pinned for this chain');
  const c = contract.toLowerCase();
  if (router?.toLowerCase() !== c && !tokens.some((t) => t.toLowerCase() === c)) {
    throw new CtError('MANIFEST_MISMATCH', 'contract is not a pinned GhostPay contract');
  }
}

/** Reads runtime bytecode (`eth_getCode`). */
export type GetCode = (address: Address) => Promise<Hex | undefined>;

/** Outcome of {@link verifyManifestOnChain}. */
export interface ManifestReport {
  /** Chain id verified. */
  readonly chainId: number;
  /**
   * Per-role result. Roles: the protocol contracts, `router`, and `token:<address>` per pinned token
   * (`tokens` when the manifest pins none). A null router or empty token list counts as `unpinned`.
   */
  readonly roles: Readonly<Record<string, 'ok' | 'unpinned'>>;
  /** True if at least one role was checked and every role was matched against a pinned hash. */
  readonly fullyPinned: boolean;
}

/**
 * Compares the on-chain runtime code of every manifest address with the pinned hashes (CT-PAY-4):
 * the Zama protocol contracts, the GhostPay router and every pinned confidential token. Token hashes
 * are keyed `token:<address>` in `codeHashes` (address case-insensitive).
 * @param chainId Chain id.
 * @param getCode Bytecode reader (e.g. viem `publicClient.getCode`).
 * @param opts `requirePinned` (default true) refuses roles whose hash is not pinned yet.
 * @param manifest Manifest to check.
 * @throws {CtError} `MANIFEST_MISMATCH` if code is missing or differs; `UNPINNED_CODEHASH` if a hash, the
 * router address or the token list is unpinned and `requirePinned`.
 * @security A mismatch means the address is not the pinned protocol contract: do not send encrypted inputs to it.
 */
export async function verifyManifestOnChain(
  chainId: number,
  getCode: GetCode,
  opts: { requirePinned?: boolean } = {},
  manifest: CtManifest = CT1_MANIFEST,
): Promise<ManifestReport> {
  const entry = manifestForChain(chainId, manifest);
  const requirePinned = opts.requirePinned ?? true;
  const roles: Record<string, 'ok' | 'unpinned'> = {};
  // `optional`: a null address is legitimately absent (the local mock has no wrappers registry).
  // Every other null address is a role that is not pinned yet.
  const targets: { role: string; address: Address | null; optional: boolean }[] = [
    { role: 'acl', address: entry.protocol.acl, optional: false },
    { role: 'coprocessor', address: entry.protocol.coprocessor, optional: false },
    { role: 'kmsVerifier', address: entry.protocol.kmsVerifier, optional: false },
    { role: 'inputVerifier', address: entry.protocol.inputVerifier, optional: false },
    { role: 'wrappersRegistry', address: entry.protocol.wrappersRegistry, optional: true },
    { role: 'router', address: entry.ghostpay.router, optional: false },
    ...(entry.ghostpay.tokens.length === 0
      ? [{ role: 'tokens', address: null, optional: false }]
      : entry.ghostpay.tokens.map((t) => ({ role: `token:${getAddress(t)}`, address: t, optional: false }))),
  ];
  for (const { role, address, optional } of targets) {
    if (address === null) {
      if (optional) continue;
      if (requirePinned) throw new CtError('UNPINNED_CODEHASH', `${role} is not pinned`);
      roles[role] = 'unpinned';
      continue;
    }
    const code = await getCode(address);
    if (code === undefined || code === '0x') {
      throw new CtError('MANIFEST_MISMATCH', `no contract code at pinned address for ${role}`);
    }
    const pinned = pinnedHash(entry.codeHashes, role);
    if (pinned === null) {
      if (requirePinned) throw new CtError('UNPINNED_CODEHASH', `code hash for ${role} is not pinned`);
      roles[role] = 'unpinned';
      continue;
    }
    if (keccak256(code).toLowerCase() !== pinned.toLowerCase()) {
      throw new CtError('MANIFEST_MISMATCH', `code hash mismatch for ${role}`);
    }
    roles[role] = 'ok';
  }
  const results = Object.values(roles);
  return { chainId, roles, fullyPinned: results.length > 0 && results.every((v) => v === 'ok') };
}

/** @internal Pinned hash of `role` (key matched case-insensitively, so `token:<address>` may use any case). */
function pinnedHash(codeHashes: Readonly<Record<string, Hex | null>>, role: string): Hex | null {
  const want = role.toLowerCase();
  return Object.entries(codeHashes).find(([k]) => k.toLowerCase() === want)?.[1] ?? null;
}

/**
 * Strict address parse used throughout the package. All-lowercase hex is accepted; mixed case must
 * carry a valid EIP-55 checksum (a wrong checksum usually means a mistyped or tampered address).
 * @param value Candidate address.
 * @param label Field name for the error message.
 * @returns The checksummed address.
 */
export function parseAddress(value: string, label: string): Address {
  requireInput(typeof value === 'string' && isAddress(value, { strict: true }), `${label} must be an address`);
  return getAddress(value);
}
