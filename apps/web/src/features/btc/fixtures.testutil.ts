import { createSilentPaymentOutputs, silentPaymentKeysFromSeed } from '@ghostpay/btc-silent-payments';
import { btcNetwork, type BtcNetworkId } from './network';
import { walletFromSeedHex, type BtcWallet } from './wallet';

export const SEED_A = '11'.repeat(32);
export const SEED_B = '22'.repeat(32);

const hex = (n: number, ch: string): string => ch.repeat(n);
const HASH = (i: number): string => i.toString(16).padStart(64, '0');

export interface EsploraVin {
  txid: string;
  vout: number;
  prevout: { scriptpubkey: string } | null;
  scriptsig: string;
  witness: string[];
  is_coinbase: boolean;
}
export interface EsploraTxJson {
  txid: string;
  vin: EsploraVin[];
  vout: { scriptpubkey: string; value: number }[];
}
export interface MockBlock {
  hash: string;
  txs: EsploraTxJson[];
}

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function coinbase(i: number): EsploraTxJson {
  return {
    txid: HASH(0x1000 + i),
    vin: [{ txid: hex(64, '0'), vout: 0xffffffff, prevout: null, scriptsig: '03aabbcc', witness: [], is_coinbase: true }],
    vout: [{ scriptpubkey: `0014${hex(40, '9')}`, value: 5_000_000_000 }],
  };
}

/** A transaction that has no silent payment output (decoy). */
export function decoyTx(i: number, senderSeedHex: string): EsploraTxJson {
  const s = silentPaymentKeysFromSeed(Uint8Array.from(Buffer.from(senderSeedHex, 'hex')), { network: 'testnet' });
  return {
    txid: HASH(0x2000 + i),
    vin: [
      {
        txid: HASH(0x3000 + i),
        vout: 0,
        prevout: { scriptpubkey: `0014${hex(40, '7')}` },
        scriptsig: '',
        witness: [hex(142, '3'), toHex(s.scanPublicKey)],
        is_coinbase: false,
      },
    ],
    vout: [{ scriptpubkey: `0014${hex(40, '5')}`, value: 10_000 }],
  };
}

/** A real BIP-352 payment of `amountSats` to `recipient`, sent from a P2WPKH input. */
export function paymentTx(i: number, recipient: BtcWallet, senderSeedHex: string, amountSats: number): EsploraTxJson {
  const sender = silentPaymentKeysFromSeed(Uint8Array.from(Buffer.from(senderSeedHex, 'hex')), { network: 'testnet' });
  const fundingTxid = HASH(0x3000 + i);
  const [out] = createSilentPaymentOutputs({
    inputs: [{ privateKey: sender.scanSecret, isTaproot: false }],
    outpoints: [{ txid: fundingTxid, vout: 0 }],
    recipients: [recipient.address],
    network: 'testnet',
  });
  if (out === undefined) throw new Error('no output');
  return {
    txid: HASH(0x4000 + i),
    vin: [
      {
        txid: fundingTxid,
        vout: 0,
        prevout: { scriptpubkey: `0014${hex(40, '6')}` },
        scriptsig: '',
        witness: [hex(142, '3'), toHex(sender.scanPublicKey)],
        is_coinbase: false,
      },
    ],
    vout: [
      { scriptpubkey: `0014${hex(40, '5')}`, value: 1_234 },
      { scriptpubkey: `5120${toHex(out.xOnlyPublicKey)}`, value: amountSats },
    ],
  };
}

export interface MockChain {
  readonly blocks: MockBlock[];
  readonly spent: Set<string>;
  readonly broadcasts: string[];
  readonly requests: string[];
  /** Makes the next request for this path fail with HTTP 500. */
  failPath: string | undefined;
  fetchFn: (url: string, init: RequestInit) => Promise<Response>;
}

/**
 * In-memory Esplora server at `https://esplora.test/api`. Block 0 has the genesis hash of `netId`;
 * block 3 holds one payment of 50_000 sats to `recipient`; block 2 is large enough to need 2 pages.
 */
export function mockChain(netId: BtcNetworkId, recipient: BtcWallet): MockChain {
  const net = btcNetwork(netId);
  const blocks: MockBlock[] = [
    { hash: net.genesisHash, txs: [coinbase(0)] },
    { hash: HASH(0xb1), txs: [coinbase(1), decoyTx(1, SEED_B)] },
    { hash: HASH(0xb2), txs: [coinbase(2), ...Array.from({ length: 29 }, (_, k) => decoyTx(10 + k, SEED_B))] },
    { hash: HASH(0xb3), txs: [coinbase(3), decoyTx(40, SEED_B), paymentTx(50, recipient, SEED_B, 50_000)] },
    { hash: HASH(0xb4), txs: [coinbase(4)] },
  ];
  const chain: MockChain = {
    blocks,
    spent: new Set<string>(),
    broadcasts: [],
    requests: [],
    failPath: undefined,
    fetchFn: (url, init) => {
      const base = 'https://esplora.test/api';
      if (!url.startsWith(base)) return Promise.reject(new Error(`unexpected host ${url}`));
      const path = url.slice(base.length);
      chain.requests.push(`${init.method ?? 'GET'} ${path}`);
      const text = (body: string): Promise<Response> => Promise.resolve(new Response(body, { status: 200 }));
      const json = (v: unknown): Promise<Response> => text(JSON.stringify(v));
      if (chain.failPath === path) return Promise.resolve(new Response('boom', { status: 500 }));
      let m: RegExpExecArray | null;
      if (path === '/blocks/tip/height') return text(String(blocks.length - 1));
      if ((m = /^\/block-height\/(\d+)$/.exec(path))) {
        const b = blocks[Number(m[1])];
        return b === undefined ? Promise.resolve(new Response('Block not found', { status: 404 })) : text(b.hash);
      }
      if ((m = /^\/block\/([0-9a-f]{64})\/txs\/(\d+)$/.exec(path))) {
        const b = blocks.find((x) => x.hash === m?.[1]);
        if (b === undefined) return Promise.resolve(new Response('nope', { status: 404 }));
        const start = Number(m[2]);
        return json(b.txs.slice(start, start + 25));
      }
      if ((m = /^\/tx\/([0-9a-f]{64})\/outspend\/(\d+)$/.exec(path))) {
        return json({ spent: chain.spent.has(`${m[1]}:${m[2]}`) });
      }
      if (path === '/fee-estimates') return json({ '1': 3.5, '6': 1.2 });
      if (path === '/tx' && init.method === 'POST') {
        chain.broadcasts.push(String(init.body));
        return text(HASH(0x9999));
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    },
  };
  return chain;
}

export function walletA(netId: BtcNetworkId = 'regtest'): BtcWallet {
  return walletFromSeedHex(SEED_A, btcNetwork(netId));
}
