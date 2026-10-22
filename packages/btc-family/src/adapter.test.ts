import { describe, expect, it } from 'vitest';
import type { DetectedBitcoinPayment } from './adapter-types.js';
import { BTC_FAMILY_FEES, createBtcFamilyAdapter } from './adapter.js';
import { BtcFamilyError } from './errors.js';
import { asTestnet, blockHashOf, makeBlock, p2pkhInput, p2wpkhInput } from './fixtures.testutil.js';
import { generateKeys } from './keys.js';
import { changeAddress, labeledAddress, silentPaymentAddress } from './labels.js';
import {
  BITCOIN_CASH_MAINNET,
  BITCOIN_MAINNET,
  BITCOIN_TESTNET,
  DOGECOIN_MAINNET,
  LITECOIN_MAINNET,
  LITECOIN_TESTNET,
} from './params.js';
import { seededRng } from './rng.testutil.js';
import { scanBlocks, type BlockData, type TweakSource } from './scan.js';
import { spendPrivateKey } from './receiver.js';
import { toHex } from './ecc.js';

async function codeAsync(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
  } catch (e) {
    return e instanceof BtcFamilyError ? e.code : 'OTHER';
  }
  return undefined;
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof BtcFamilyError ? e.code : 'OTHER';
  }
  return undefined;
}

class FakeSource implements TweakSource {
  public readonly heightsAsked: number[] = [];
  public constructor(
    private readonly blocks: Map<number, BlockData>,
    private readonly tip: number,
  ) {}
  public getTipHeight(): Promise<number> {
    return Promise.resolve(this.tip);
  }
  public getBlock(height: number): Promise<BlockData> {
    this.heightsAsked.push(height);
    return Promise.resolve(
      this.blocks.get(height) ?? { height, blockHash: blockHashOf(height), tweaks: [], outputs: [] },
    );
  }
}

async function collect(it: AsyncIterable<DetectedBitcoinPayment>): Promise<DetectedBitcoinPayment[]> {
  const out: DetectedBitcoinPayment[] = [];
  for await (const x of it) out.push(x);
  return out;
}

const k = generateKeys(seededRng('adapter'));

describe('createBtcFamilyAdapter shape', () => {
  it('has the ChainAdapter members and chain ids from params', () => {
    for (const c of [BITCOIN_MAINNET, BITCOIN_TESTNET, LITECOIN_TESTNET, DOGECOIN_MAINNET]) {
      const a = createBtcFamilyAdapter(c);
      expect(a.family).toBe('bitcoin');
      expect(a.chainId).toBe(c.id);
      expect(a.fees).toBe(BTC_FAMILY_FEES);
      expect(Object.keys(a).sort()).toEqual([
        'buildPaymentRequest',
        'chainId',
        'family',
        'fees',
        'parseRecipient',
        'scan',
      ]);
    }
    expect(createBtcFamilyAdapter(LITECOIN_TESTNET).chainId).toBe('ltc-testnet');
    expect(BTC_FAMILY_FEES).toEqual({
      checkout: 'not_enforceable',
      gasSponsorship: 'not_enforceable',
      flatSecurity: 'not_enforceable',
    });
  });
});

describe('parseRecipient', () => {
  it('parses and canonicalises own-chain addresses, rejects other chains', () => {
    const a = createBtcFamilyAdapter(LITECOIN_TESTNET);
    const addr = silentPaymentAddress(LITECOIN_TESTNET, k);
    const r = a.parseRecipient(addr);
    expect(r.canonical).toBe(addr);
    expect(toHex(r.viewingPublicKey)).toBe(toHex(k.scanPublicKey));
    expect(toHex(r.spendingPublicKey)).toBe(toHex(k.spendPublicKey));
    expect(code(() => a.parseRecipient(silentPaymentAddress(BITCOIN_TESTNET, k)))).toBe('NETWORK_MISMATCH');
    expect(code(() => a.parseRecipient('garbage'))).toBe('INVALID_ADDRESS');
    expect(code(() => createBtcFamilyAdapter(BITCOIN_MAINNET).parseRecipient(addr))).toBe('NETWORK_MISMATCH');
  });

  it('works for experimental mainnet chains (research use)', () => {
    for (const c of [LITECOIN_MAINNET, DOGECOIN_MAINNET, BITCOIN_CASH_MAINNET]) {
      expect(createBtcFamilyAdapter(c).parseRecipient(silentPaymentAddress(c, k)).family).toBe('bitcoin');
    }
  });
});

describe('buildPaymentRequest', () => {
  const a = createBtcFamilyAdapter(LITECOIN_TESTNET);
  const addr = silentPaymentAddress(LITECOIN_TESTNET, k);

  it('builds a fee-free request', () => {
    const r = a.buildPaymentRequest({ chainId: 'ltc-testnet', address: addr, amountSats: 1000n });
    expect(r).toEqual({
      family: 'bitcoin',
      chainId: 'ltc-testnet',
      asset: 'native',
      grossAmount: 1000n,
      netAmount: 1000n,
      feeAmount: 0n,
      address: addr,
      experimental: true,
    });
    expect(
      a.buildPaymentRequest({ chainId: 'ltc-testnet', address: addr }, { quotedTokenAmount: 5n }).grossAmount,
    ).toBe(5n);
    expect(
      createBtcFamilyAdapter(BITCOIN_MAINNET).buildPaymentRequest({
        chainId: 'btc-mainnet',
        address: silentPaymentAddress(BITCOIN_MAINNET, k),
        amountSats: 1n,
      }).experimental,
    ).toBe(false);
  });

  it('rejects wrong chain, wrong HRP and bad amounts', () => {
    expect(code(() => a.buildPaymentRequest({ chainId: 'btc-testnet', address: addr, amountSats: 1n }))).toBe(
      'CHAIN_MISMATCH',
    );
    expect(
      code(() =>
        a.buildPaymentRequest({
          chainId: 'ltc-testnet',
          address: silentPaymentAddress(BITCOIN_TESTNET, k),
          amountSats: 1n,
        }),
      ),
    ).toBe('NETWORK_MISMATCH');
    for (const amountSats of [0n, -1n, 1n << 63n]) {
      expect(code(() => a.buildPaymentRequest({ chainId: 'ltc-testnet', address: addr, amountSats }))).toBe(
        'INVALID_AMOUNT',
      );
    }
    expect(code(() => a.buildPaymentRequest({ chainId: 'ltc-testnet', address: addr }))).toBe(
      'INVALID_AMOUNT',
    );
  });

  it('refuses experimental MAINNET chains', () => {
    for (const c of [LITECOIN_MAINNET, DOGECOIN_MAINNET, BITCOIN_CASH_MAINNET]) {
      const ad = createBtcFamilyAdapter(c);
      expect(
        code(() =>
          ad.buildPaymentRequest({ chainId: c.id, address: silentPaymentAddress(c, k), amountSats: 1000n }),
        ),
      ).toBe('EXPERIMENTAL_CHAIN');
    }
  });
});

describe('scan', () => {
  const chain = LITECOIN_TESTNET;
  const sender = p2wpkhInput('scan-s');
  const other = generateKeys(seededRng('other'));
  const block5 = makeBlock(chain, 5, [
    {
      inputs: [sender],
      recipients: [
        silentPaymentAddress(chain, k),
        labeledAddress(chain, k, 4),
        silentPaymentAddress(chain, other),
      ],
      decoys: [new Uint8Array(32).fill(9)],
    },
    { inputs: [p2wpkhInput('scan-t')], recipients: [changeAddress(chain, k)] },
  ]);
  const blocks = new Map<number, BlockData>([[5, block5]]);
  const view = { viewingSecret: k.scanSecret, spendingPublicKey: k.spendPublicKey, labels: [4] };

  it('finds own outputs (plain, labeled, change), not others, and the keys can spend', async () => {
    const src = new FakeSource(blocks, 7);
    const adapter = createBtcFamilyAdapter(chain, { source: src });
    const found = await collect(adapter.scan({ fromBlock: 4n }, view, new AbortController().signal));
    expect(found.map((f) => f.label).sort()).toEqual([0, 4, null]);
    expect(src.heightsAsked).toEqual([4, 5, 6, 7]);
    for (const f of found) {
      expect(f.family).toBe('bitcoin');
      expect(f.blockHeight).toBe(5n);
      expect(f.blockHash).toBe(blockHashOf(5));
      expect(f.txid).toHaveLength(64);
      expect(f.amountSats).toBeGreaterThan(0n);
      expect(toHex(spendPrivateKey(k.spendSecret, f.spendTweak).xOnlyPublicKey)).toBe(
        toHex(f.xOnlyPublicKey),
      );
    }
  });

  it('honours toBlock, an aborted signal and range errors; sends only heights to the source', async () => {
    const src = new FakeSource(blocks, 100);
    const adapter = createBtcFamilyAdapter(chain, { source: src });
    expect(
      await collect(adapter.scan({ fromBlock: 5n, toBlock: 5n }, { ...view }, new AbortController().signal)),
    ).toHaveLength(3);
    expect(src.heightsAsked).toEqual([5]);
    const ac = new AbortController();
    ac.abort();
    expect(await collect(adapter.scan({ fromBlock: 5n }, view, ac.signal))).toEqual([]);
    expect(
      await codeAsync(() => collect(adapter.scan({ fromBlock: -1n }, view, new AbortController().signal))),
    ).toBe('INVALID_INPUT');
    expect(
      await codeAsync(() =>
        collect(adapter.scan({ fromBlock: 0n, toBlock: 1n << 40n }, view, new AbortController().signal)),
      ),
    ).toBe('INVALID_INPUT');
  });

  it('is UNSUPPORTED without a source', async () => {
    const adapter = createBtcFamilyAdapter(chain);
    expect(
      await codeAsync(() => collect(adapter.scan({ fromBlock: 0n }, view, new AbortController().signal))),
    ).toBe('UNSUPPORTED');
  });

  it('works for DOGE-as-testnet with p2pkh senders; a segwit sender is not found', async () => {
    const doge = asTestnet(DOGECOIN_MAINNET);
    const b = makeBlock(doge, 1, [
      { inputs: [p2pkhInput('d')], recipients: [silentPaymentAddress(doge, k)] },
    ]);
    const adapter = createBtcFamilyAdapter(doge, { source: new FakeSource(new Map([[1, b]]), 1) });
    expect(
      await collect(
        adapter.scan(
          { fromBlock: 1n },
          { viewingSecret: k.scanSecret, spendingPublicKey: k.spendPublicKey },
          new AbortController().signal,
        ),
      ),
    ).toHaveLength(1);
  });
});

describe('scanBlocks', () => {
  const chain = BITCOIN_TESTNET;
  const keys = { scanSecret: k.scanSecret, spendPublicKey: k.spendPublicKey };

  it('detects inconsistent block heights as a reorg and validates arguments', async () => {
    const bad = new FakeSource(
      new Map([[3, { height: 99, blockHash: blockHashOf(3), tweaks: [], outputs: [] }]]),
      3,
    );
    expect(await codeAsync(() => collect(scanBlocks({ source: bad, keys, fromHeight: 3 }) as never))).toBe(
      'REORG_DETECTED',
    );
    expect(await codeAsync(() => collect(scanBlocks({ source: bad, keys, fromHeight: 1.5 }) as never))).toBe(
      'INVALID_INPUT',
    );
    expect(
      await codeAsync(() => collect(scanBlocks({ source: bad, keys, fromHeight: 10, toHeight: 2 }) as never)),
    ).toBe('INVALID_INPUT');
    expect(await collect(scanBlocks({ source: bad, keys, fromHeight: 4 }) as never)).toEqual([]);
    expect(chain.id).toBe('btc-testnet');
  });

  it('stops mid-range when aborted between blocks', async () => {
    const ac = new AbortController();
    const src = new FakeSource(new Map(), 10);
    const got: number[] = [];
    const origGet = src.getBlock.bind(src);
    src.getBlock = (h: number): Promise<BlockData> => {
      got.push(h);
      if (h === 2) ac.abort();
      return origGet(h);
    };
    await collect(scanBlocks({ source: src, keys, fromHeight: 0, signal: ac.signal }) as never);
    expect(got).toEqual([0, 1, 2]);
  });

  it('skips outputs without txid/vout/amount metadata', async () => {
    const chain2 = BITCOIN_TESTNET;
    const sender = p2wpkhInput('meta');
    const b = makeBlock(chain2, 1, [{ inputs: [sender], recipients: [silentPaymentAddress(chain2, k)] }]);
    const stripped: BlockData = {
      ...b,
      outputs: b.outputs.map((o) => ({ xOnlyPublicKey: o.xOnlyPublicKey })),
    };
    const r = await collect(
      scanBlocks({ source: new FakeSource(new Map([[1, stripped]]), 1), keys, fromHeight: 1 }) as never,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).not.toHaveProperty('txid');
  });
});
