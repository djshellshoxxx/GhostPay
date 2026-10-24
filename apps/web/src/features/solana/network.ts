import type { SolanaCluster } from '@ghostpay/solana-stealth';

export type SolNetworkId = 'devnet' | 'testnet' | 'localnet' | 'mainnet';

export interface SolNetworkInfo {
  readonly id: SolNetworkId;
  readonly label: string;
  /** Mainnet stays disabled: this proof of concept is unaudited. */
  readonly enabled: boolean;
  /** Cluster byte bound into the meta-address checksum. */
  readonly cluster: SolanaCluster;
  /** Genesis hash the RPC server must report; localnet has none (every validator creates its own). */
  readonly genesisHash: string | undefined;
  /** Placeholder for the RPC URL field. No public endpoint is hard-coded: the user chooses one. */
  readonly urlHint: string;
}

/** Public cluster genesis hashes (from Solana's published cluster documentation; recalled, not fetched). */
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const TESTNET_GENESIS = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';

export const SOL_NETWORKS: readonly SolNetworkInfo[] = [
  {
    id: 'devnet',
    label: 'Solana devnet',
    enabled: true,
    cluster: 'devnet',
    genesisHash: DEVNET_GENESIS,
    urlHint: 'your-devnet-rpc.example (add https://)',
  },
  {
    id: 'testnet',
    label: 'Solana testnet',
    enabled: true,
    cluster: 'testnet',
    genesisHash: TESTNET_GENESIS,
    urlHint: 'your-testnet-rpc.example (add https://)',
  },
  {
    id: 'localnet',
    label: 'Solana local validator',
    enabled: true,
    cluster: 'localnet',
    genesisHash: undefined,
    urlHint: '127.0.0.1:8899 (add http://)',
  },
  {
    id: 'mainnet',
    label: 'Solana mainnet (disabled)',
    enabled: false,
    cluster: 'mainnet',
    genesisHash: MAINNET_GENESIS,
    urlHint: '',
  },
];

export function solNetwork(id: SolNetworkId): SolNetworkInfo {
  const n = SOL_NETWORKS.find((x) => x.id === id);
  if (n === undefined) throw new Error('unknown solana network');
  return n;
}
