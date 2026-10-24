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
 * Block 0 id of TRON mainnet (from java-tron's published genesis; recalled, not fetched). A node that
 * reports it is always refused. The test networks are not positively pinned: their genesis ids are
 * not recorded in this repository, so the selection is a label, not a proof.
 */
export const MAINNET_GENESIS = '0000000000000000d698d4192c56cb6be724a558448e2684802de4d6cd8690dc';

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
