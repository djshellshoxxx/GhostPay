export type TronNetworkId = 'nile' | 'shasta' | 'local' | 'mainnet';

export interface TronNetworkInfo {
  readonly id: TronNetworkId;
  readonly label: string;
  /** Mainnet stays disabled: this proof of concept is unaudited. */
  readonly enabled: boolean;
  /** Placeholder for the node URL field. No public node is hard-coded: the user chooses one. */
  readonly urlHint: string;
}

/**
 * Block 0 ids ("chainid" values of tip-474 without the 0x prefix). Source: tronprotocol/tips, tip-474.md
 * (https://github.com/tronprotocol/tips/blob/master/tip-474.md), corroborated by ChainAgnostic/namespaces
 * tron/caip2.md; both retrieved 2026-10-25 via GitHub code search. See docs/chains/SOURCES-2026-10-25.md.
 * A node that reports the mainnet id is always refused. NOTE: before 2026-10-25 this file held the Nile id
 * under the mainnet name (recalled from memory, wrong).
 */
export const MAINNET_GENESIS = '00000000000000001ebf88508a03865c71d452e25f4d51194196a1d22b6653dc';
export const NILE_GENESIS = '0000000000000000d698d4192c56cb6be724a558448e2684802de4d6cd8690dc';
export const SHASTA_GENESIS = '0000000000000000de1aa88295e1fcf982742f773e0419c5a9c134c994a9059e';

export const TRON_NETWORK_LIST: readonly TronNetworkInfo[] = [
  { id: 'nile', label: 'TRON Nile testnet', enabled: true, urlHint: 'your-nile-node.example (add https://)' },
  { id: 'shasta', label: 'TRON Shasta testnet', enabled: true, urlHint: 'your-shasta-node.example (add https://)' },
  { id: 'local', label: 'TRON local node', enabled: true, urlHint: '127.0.0.1:9090 (add http://)' },
  { id: 'mainnet', label: 'TRON mainnet (disabled)', enabled: false, urlHint: '' },
];

export function tronNetwork(id: TronNetworkId): TronNetworkInfo {
  const n = TRON_NETWORK_LIST.find((x) => x.id === id);
  if (n === undefined) throw new Error('unknown tron network');
  return n;
}
