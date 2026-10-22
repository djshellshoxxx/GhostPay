/**
 * Typed manifests of extra EVM chains (config only).
 *
 * Provenance: chain ids, names, native symbols come from ethereum-lists/chains (retrieved
 * 2026-10-21, see docs/remote/chain-ports/evm-extra.md). Everything the research could not verify
 * (announcer presence, finality, getLogs cap, block time, EVM target, JSON hash) is explicitly
 * `null` / `'unverified'`: never guessed.
 */

/** Marker for a fact that has not been verified. */
export type Unverified = 'unverified';

/** Provenance of the chain-list data. */
export interface ListSource {
  readonly url: string;
  /** RFC 3339 date of retrieval. */
  readonly retrieved: string;
  /** SHA-256 of the fetched JSON; `null` because it was not recorded during research. */
  readonly sha256: string | null;
  /** ethereum-lists `status`; `null` when the list does not set it or it was not checked. */
  readonly status: 'active' | 'deprecated' | 'incubating' | null;
}

/** One extra EVM chain. Structurally mirrors chain-adapters `ChainConfig` (not imported). */
export interface ExtraChainEntry {
  readonly chainId: number;
  readonly name: string;
  readonly nativeSymbol: string;
  readonly nativeDecimals: 18;
  readonly testnet: boolean;
  /**
   * @security Typed literal `false`: this package never enables a chain. Enabling needs a
   * reviewed manifest plus an `ok` verification record.
   */
  readonly enabled: false;
  /** Explorer host from the list (no scheme); `null` when not checked. */
  readonly explorerHost: string | null;
  readonly listSource: ListSource;
  readonly finalityDepth: number | null;
  readonly getLogsMaxRange: number | null;
  readonly blockTimeMs: number | null;
  readonly evmTarget: 'cancun' | 'shanghai' | 'paris' | Unverified;
  readonly bytecodeModel: 'evm' | 'eravm';
  /** `'standard'` = EVM CREATE2 formula; `'zksync-custom'` = EraVM formula, not the ERC salt path. */
  readonly create2: 'standard' | 'zksync-custom';
  /** Whether the canonical announcer exists on the chain. Always unverified offline. */
  readonly announcer: Unverified;
  /** Whether the Arachnid deployer exists on the chain. Always unverified offline. */
  readonly arachnidDeployer: Unverified;
  /** Free-text caveats from the research note. */
  readonly notes: readonly string[];
}

const RETRIEVED = '2026-10-21';
const url = (id: number): string =>
  `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${String(id)}.json`;

interface Row {
  readonly chainId: number;
  readonly name: string;
  readonly nativeSymbol: string;
  readonly testnet: boolean;
  readonly explorerHost: string | null;
  readonly status: ListSource['status'];
  readonly zk?: true;
  readonly notes?: readonly string[];
}

function build(r: Row): ExtraChainEntry {
  const zk = r.zk === true;
  return Object.freeze({
    chainId: r.chainId,
    name: r.name,
    nativeSymbol: r.nativeSymbol,
    nativeDecimals: 18,
    testnet: r.testnet,
    enabled: false,
    explorerHost: r.explorerHost,
    listSource: Object.freeze({ url: url(r.chainId), retrieved: RETRIEVED, sha256: null, status: r.status }),
    finalityDepth: null,
    getLogsMaxRange: null,
    blockTimeMs: null,
    evmTarget: 'unverified',
    bytecodeModel: zk ? 'eravm' : 'evm',
    create2: zk ? 'zksync-custom' : 'standard',
    announcer: 'unverified',
    arachnidDeployer: 'unverified',
    notes: Object.freeze([...(r.notes ?? [])]),
  } satisfies ExtraChainEntry);
}

const ZK_NOTE = 'zkSync Era: EraVM bytecode and CREATE2 formula; canonical announcer address cannot be assumed. Deferred (effort L).';

const ROWS: readonly Row[] = [
  { chainId: 59144, name: 'Linea', nativeSymbol: 'ETH', testnet: false, explorerHost: 'lineascan.build', status: 'active' },
  { chainId: 534352, name: 'Scroll', nativeSymbol: 'ETH', testnet: false, explorerHost: 'scrollscan.com', status: 'active', notes: ['No BLOBHASH/BLOBBASEFEE/EIP-4788; SELFDESTRUCT reverts (scroll-documentation).'] },
  { chainId: 324, name: 'zkSync Era', nativeSymbol: 'ETH', testnet: false, explorerHost: 'explorer.zksync.io', status: null, zk: true, notes: [ZK_NOTE] },
  { chainId: 5000, name: 'Mantle', nativeSymbol: 'MNT', testnet: false, explorerHost: 'mantlescan.xyz', status: null, notes: ['Native token MNT, not ETH: gas buffer needs a MNT price feed.'] },
  { chainId: 81457, name: 'Blast', nativeSymbol: 'ETH', testnet: false, explorerHost: 'blastscan.io', status: 'active', notes: ['Rebasing native ETH/USDB/WETH conflict with exact balance-delta guards; do not allowlist without a test.'] },
  { chainId: 146, name: 'Sonic', nativeSymbol: 'S', testnet: false, explorerHost: 'sonicscan.org', status: null },
  { chainId: 42220, name: 'Celo', nativeSymbol: 'CELO', testnet: false, explorerHost: 'celoscan.io', status: null, notes: ['Fee abstraction may change gas math; use native CELO for the buffer only.'] },
  { chainId: 167000, name: 'Taiko', nativeSymbol: 'ETH', testnet: false, explorerHost: 'taikoscan.io', status: 'active', notes: ['Based rollup; use a long finality depth.'] },
  { chainId: 34443, name: 'Mode', nativeSymbol: 'ETH', testnet: false, explorerHost: 'explorer.mode.network', status: null },
  { chainId: 7777777, name: 'Zora', nativeSymbol: 'ETH', testnet: false, explorerHost: 'explorer.zora.energy', status: null, notes: ['Network status unverified; confirm it is still operating before any work.'] },
  { chainId: 130, name: 'Unichain', nativeSymbol: 'ETH', testnet: false, explorerHost: 'uniscan.xyz', status: null },
  { chainId: 80094, name: 'Berachain', nativeSymbol: 'BERA', testnet: false, explorerHost: 'berascan.com', status: null },
  { chainId: 59141, name: 'Linea Sepolia', nativeSymbol: 'ETH', testnet: true, explorerHost: null, status: 'active' },
  { chainId: 534351, name: 'Scroll Sepolia', nativeSymbol: 'ETH', testnet: true, explorerHost: null, status: 'active' },
  { chainId: 300, name: 'zkSync Sepolia', nativeSymbol: 'ETH', testnet: true, explorerHost: null, status: null, zk: true, notes: [ZK_NOTE] },
  { chainId: 5003, name: 'Mantle Sepolia', nativeSymbol: 'MNT', testnet: true, explorerHost: null, status: null },
  { chainId: 168587773, name: 'Blast Sepolia', nativeSymbol: 'ETH', testnet: true, explorerHost: null, status: null },
  { chainId: 14601, name: 'Sonic Testnet', nativeSymbol: 'S', testnet: true, explorerHost: null, status: null },
  { chainId: 57054, name: 'Sonic Blaze Testnet', nativeSymbol: 'S', testnet: true, explorerHost: null, status: null, notes: ['Older Sonic test network, may be superseded: check before use.'] },
  { chainId: 11142220, name: 'Celo Sepolia', nativeSymbol: 'CELO', testnet: true, explorerHost: null, status: null, notes: ['Alfajores (44787) is deprecated in the list and is intentionally absent.'] },
  { chainId: 167013, name: 'Taiko Hoodi', nativeSymbol: 'ETH', testnet: true, explorerHost: null, status: 'active', notes: ['Taiko Hekla (167009) is deprecated and is intentionally absent.'] },
  { chainId: 919, name: 'Mode Testnet', nativeSymbol: 'ETH', testnet: true, explorerHost: null, status: null },
  { chainId: 999999999, name: 'Zora Sepolia', nativeSymbol: 'ETH', testnet: true, explorerHost: null, status: null },
  { chainId: 1301, name: 'Unichain Sepolia', nativeSymbol: 'ETH', testnet: true, explorerHost: null, status: null },
  { chainId: 80069, name: 'Berachain Bepolia', nativeSymbol: 'BERA', testnet: true, explorerHost: null, status: null },
];

/** All extra-chain manifests (mainnets then testnets), deeply frozen, all `enabled: false`. */
export const EXTRA_CHAINS: readonly ExtraChainEntry[] = Object.freeze(ROWS.map(build));

/**
 * Looks up a manifest by chain id.
 *
 * @param chainId EIP-155 id.
 * @returns The entry or `undefined`.
 */
export function findExtraChain(chainId: number): ExtraChainEntry | undefined {
  return EXTRA_CHAINS.find((c) => c.chainId === chainId);
}
