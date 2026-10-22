import type { SilentPaymentNetwork } from '@ghostpay/btc-silent-payments';

export type BtcNetworkId = 'testnet4' | 'signet' | 'regtest' | 'mainnet';

export interface BtcNetworkInfo {
  readonly id: BtcNetworkId;
  readonly label: string;
  /** Mainnet stays disabled: this proof of concept is unaudited. */
  readonly enabled: boolean;
  /** BIP-352 address family: `sp` for mainnet, `tsp` for every test network. */
  readonly spNetwork: SilentPaymentNetwork;
  /** Regular addresses use `bcrt` instead of `tb`. */
  readonly regtest: boolean;
  /** Hex hash of block 0, verified against Bitcoin Core `src/kernel/chainparams.cpp` (master, retrieved 2026-10-21). */
  readonly genesisHash: string;
  /** Placeholder for the Esplora URL field. No public server is hard-coded: the user chooses one. */
  readonly urlHint: string;
}

export const BTC_NETWORKS: readonly BtcNetworkInfo[] = [
  {
    id: 'testnet4',
    label: 'Bitcoin testnet4',
    enabled: true,
    spNetwork: 'testnet',
    regtest: false,
    genesisHash: '00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043',
    urlHint: 'your-esplora-server.example/api (add https://)',
  },
  {
    id: 'signet',
    label: 'Bitcoin signet',
    enabled: true,
    spNetwork: 'testnet',
    regtest: false,
    genesisHash: '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6',
    urlHint: 'your-esplora-server.example/api (add https://)',
  },
  {
    id: 'regtest',
    label: 'Bitcoin regtest (local)',
    enabled: true,
    spNetwork: 'testnet',
    regtest: true,
    genesisHash: '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206',
    urlHint: '127.0.0.1:3002 (add http://)',
  },
  {
    id: 'mainnet',
    label: 'Bitcoin mainnet (disabled)',
    enabled: false,
    spNetwork: 'mainnet',
    regtest: false,
    genesisHash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
    urlHint: '',
  },
];

export function btcNetwork(id: BtcNetworkId): BtcNetworkInfo {
  const n = BTC_NETWORKS.find((x) => x.id === id);
  if (n === undefined) throw new Error('unknown bitcoin network');
  return n;
}

/** Bitcoin mainnet genesis hash: an Esplora server that reports it is always refused. */
export const MAINNET_GENESIS = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
