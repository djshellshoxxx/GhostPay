import { describe, expect, it } from 'vitest';
import { base58 } from '@scure/base';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { Address } from '@solana/kit';
import { createSolanaAdapter, SOLANA_FEES, solanaChainId } from './adapter.js';
import { ANNOUNCEMENT_PREFIX, encodeAnnouncementMemo } from './announcement.js';
import type { SolanaStealthError } from './errors.js';
import { findAssociatedTokenAddress } from './instructions.js';
import { deriveStealthKeysFromSeed } from './keys.js';
import { encodeMetaAddress } from './meta-address.js';
import { MEMO_PROGRAM, MEMO_PROGRAM_V1, SYSTEM_PROGRAM, TOKEN_PROGRAM } from './programs.js';
import { legacyMessageToJson, MockRpc } from './rpc.mock.testutil.js';
import {
  creditsFor,
  fetchAnnouncements,
  memosOf,
  scanAnnouncements,
  type DetectedSolanaPayment,
} from './scan.js';
import { deriveSpendKey, deriveStealthPayment } from './stealth.js';
import { buildStealthPaymentTx, buildStealthSweepTx, signWithStealthKey } from './tx.js';
import { opensslVerify, seededRng, testWallet } from './testutil.testutil.js';

const code = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return (e as SolanaStealthError).code;
  }
  return 'NO_THROW';
};
const collect = async <T>(it: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
};

const alice = deriveStealthKeysFromSeed(new Uint8Array(32).fill(1));
const bob = deriveStealthKeysFromSeed(new Uint8Array(32).fill(2));
const aliceMeta = encodeMetaAddress('devnet', alice.spendPublicKey, alice.viewPublicKey);
const payer = testWallet('scan-payer');
const sponsor = testWallet('scan-sponsor');
const mint = testWallet('scan-mint').address;
const lifetime = { blockhash: base58.encode(new Uint8Array(32).fill(8)), lastValidBlockHeight: 10n };
const spl = { kind: 'spl', mint, decimals: 6, tokenProgram: TOKEN_PROGRAM } as const;

interface ChainTx {
  signature: string;
  slot: number;
  failed?: boolean;
  response: unknown;
}

/** Wraps a legacy message as the RPC would return it after execution. */
function asRpcTx(
  signature: string,
  slot: number,
  messageBytes: Uint8Array,
  credit: (keys: string[]) => {
    pre: number[];
    post: number[];
    preTok?: unknown[];
    postTok?: unknown[];
  },
  err: unknown = null,
): ChainTx {
  const msg = legacyMessageToJson(messageBytes);
  const c = credit(msg.accountKeys);
  return {
    signature,
    slot,
    failed: err !== null,
    response: {
      slot,
      transaction: { signatures: [signature], message: msg },
      meta: {
        err,
        preBalances: c.pre,
        postBalances: c.post,
        preTokenBalances: c.preTok ?? [],
        postTokenBalances: c.postTok ?? [],
      },
    },
  };
}

function chainRpc(txs: ChainTx[], head = 1000): MockRpc {
  const sorted = [...txs].sort((a, b) => b.slot - a.slot);
  return new MockRpc({
    getSlot: () => head,
    getMinimumBalanceForRentExemption: () => 890880,
    getSignaturesForAddress: (params) => {
      const cfg = params[1] as { limit: number; before?: string };
      let start = 0;
      if (cfg.before !== undefined) start = sorted.findIndex((t) => t.signature === cfg.before) + 1;
      return sorted
        .slice(start, start + cfg.limit)
        .map((t) => ({ signature: t.signature, slot: t.slot, err: t.failed === true ? {} : null }));
    },
    getTransaction: (params) => sorted.find((t) => t.signature === params[0])?.response ?? null,
  });
}

async function fixtureChain(): Promise<{ txs: ChainTx[]; solOwner: string; splOwner: string }> {
  const sol = await buildStealthPaymentTx({
    payer: payer.address,
    spendPublicKey: alice.spendPublicKey,
    viewPublicKey: alice.viewPublicKey,
    asset: { kind: 'native' },
    amount: 3_000_000n,
    lifetime,
    rentExemptMinimum: 890_880n,
    rng: seededRng('s1'),
  });
  const splPay = await buildStealthPaymentTx({
    payer: payer.address,
    feePayer: sponsor.address,
    spendPublicKey: alice.spendPublicKey,
    viewPublicKey: alice.viewPublicKey,
    asset: spl,
    amount: 777n,
    lifetime,
    rng: seededRng('s2'),
  });
  const toBob = await buildStealthPaymentTx({
    payer: payer.address,
    spendPublicKey: bob.spendPublicKey,
    viewPublicKey: bob.viewPublicKey,
    asset: { kind: 'native' },
    amount: 1_000_000n,
    lifetime,
    rentExemptMinimum: 890_880n,
    rng: seededRng('s3'),
  });
  // Spoof: announcement for alice but funds go elsewhere (no credit to the derived address).
  const spoofPay = deriveStealthPayment(alice.spendPublicKey, alice.viewPublicKey, seededRng('s4'));
  const spoof = await buildStealthPaymentTx({
    payer: payer.address,
    spendPublicKey: alice.spendPublicKey,
    viewPublicKey: alice.viewPublicKey,
    asset: { kind: 'native' },
    amount: 1_000_000n,
    lifetime,
    rentExemptMinimum: 0n,
    payment: { ...spoofPay, stealthAddress: sponsor.address },
  });
  const failed = await buildStealthPaymentTx({
    payer: payer.address,
    spendPublicKey: alice.spendPublicKey,
    viewPublicKey: alice.viewPublicKey,
    asset: { kind: 'native' },
    amount: 1_000_000n,
    lifetime,
    rentExemptMinimum: 0n,
    rng: seededRng('s5'),
  });
  const solCredit = (owner: string) => (keys: string[]) => {
    const pre = keys.map(() => 0);
    const post = keys.map((k) => (k === owner ? 3_000_000 : 0));
    return { pre, post };
  };
  const splCredit = (keys: string[]) => {
    const ata = splPay.creditedAccount;
    return {
      pre: keys.map(() => 0),
      post: keys.map(() => 0),
      postTok: [
        {
          accountIndex: keys.indexOf(ata),
          mint,
          owner: splPay.stealthOwner,
          uiTokenAmount: { amount: '777' },
        },
      ],
    };
  };
  // A foreign memo and a malformed announcement, wrapped in otherwise valid legacy messages.
  const foreign = { ...asRpcTx('foreign', 50, sol.tx.messageBytes, () => ({ pre: [], post: [] })) };
  const fr = foreign.response as { transaction: { message: { instructions: { data: string }[] } } };
  fr.transaction.message.instructions[1]!.data = base58.encode(utf8ToBytes('hello world'));
  const malformed = structuredClone(foreign);
  (malformed.response as typeof fr).transaction.message.instructions[1]!.data = base58.encode(
    utf8ToBytes(ANNOUNCEMENT_PREFIX + '11'),
  );
  (malformed.response as { transaction: { signatures: string[] } }).transaction.signatures = ['malformed'];
  malformed.signature = 'malformed';
  malformed.slot = 51;
  (malformed.response as { slot: number }).slot = 51;
  const badUtf8 = structuredClone(foreign);
  (badUtf8.response as typeof fr).transaction.message.instructions[1]!.data = base58.encode(
    Uint8Array.of(0xff, 0xfe),
  );
  (badUtf8.response as { transaction: { signatures: string[] } }).transaction.signatures = ['badutf8'];
  badUtf8.signature = 'badutf8';
  return {
    solOwner: sol.stealthOwner,
    splOwner: splPay.stealthOwner,
    txs: [
      asRpcTx('sol', 100, sol.tx.messageBytes, solCredit(sol.stealthOwner)),
      asRpcTx('spl', 200, splPay.tx.messageBytes, splCredit),
      asRpcTx('bob', 300, toBob.tx.messageBytes, solCredit(toBob.stealthOwner)),
      asRpcTx('spoof', 400, spoof.tx.messageBytes, solCredit(sponsor.address)),
      asRpcTx('failed', 500, failed.tx.messageBytes, solCredit(failed.stealthOwner), {
        InstructionError: [0, 'x'],
      }),
      foreign,
      malformed,
      badUtf8,
    ],
  };
}

describe('Solana adapter scan over mock RPC', () => {
  it("finds exactly alice's SOL and SPL payments, then sweeps with a sponsor", async () => {
    const { txs, solOwner, splOwner } = await fixtureChain();
    const rpc = chainRpc(txs);
    const adapter = createSolanaAdapter({ cluster: 'devnet', rpc });
    const found: DetectedSolanaPayment[] = await collect(
      adapter.scan(
        { fromBlock: 0n },
        { viewingSecret: alice.viewSecret, spendingPublicKey: alice.spendPublicKey },
        new AbortController().signal,
      ),
    );
    expect(found.map((f) => f.signature)).toEqual(['spl', 'sol']);
    expect(found[1]?.stealthAddress).toBe(solOwner);
    expect(found[1]?.lamportsReceived).toBe(3_000_000n);
    expect(found[0]?.stealthAddress).toBe(splOwner);
    const ata = await findAssociatedTokenAddress(splOwner as Address, mint as Address, TOKEN_PROGRAM);
    expect(found[0]?.tokenReceipts).toEqual([{ mint, tokenAccount: ata, amount: 777n }]);

    const p = deriveSpendKey(alice.spendSecret, found[0]!.tweak, base58.decode(splOwner));
    const sweep = await buildStealthSweepTx({
      stealthAddress: splOwner,
      feePayer: sponsor.address,
      destination: payer.address,
      asset: spl,
      amount: 777n,
      lifetime,
      closeTokenAccount: true,
    });
    const signed = signWithStealthKey(sweep, p);
    expect(
      opensslVerify(
        signed.transaction.signatures[splOwner as never]!,
        sweep.messageBytes,
        base58.decode(splOwner),
      ),
    ).toBe(true);

    const bobs = await collect(
      adapter.scan(
        { fromBlock: 0n },
        { viewingSecret: bob.viewSecret, spendingPublicKey: bob.spendPublicKey },
        new AbortController().signal,
      ),
    );
    expect(bobs.map((f) => f.signature)).toEqual(['bob']);
  });

  it('respects slot range and pagination', async () => {
    const { txs } = await fixtureChain();
    const rpc = chainRpc(txs);
    const recs = await collect(fetchAnnouncements(rpc, { fromSlot: 150n, toSlot: 450n, pageLimit: 2 }));
    expect(recs.map((r) => r.signature)).toEqual(['spoof', 'bob', 'spl']);
    expect(rpc.calls.filter((c) => c.method === 'getSignaturesForAddress').length).toBeGreaterThan(1);
    expect(rpc.calls.some((c) => c.method === 'getSlot')).toBe(false);
  });

  it('fails closed on page cap, bad options, slot mismatch and abort', async () => {
    const { txs } = await fixtureChain();
    expect(
      await code(() =>
        collect(fetchAnnouncements(chainRpc(txs), { fromSlot: 0n, pageLimit: 1, maxPages: 2 })),
      ),
    ).toBe('UNSUPPORTED');
    expect(await code(() => collect(fetchAnnouncements(chainRpc(txs), { fromSlot: 0n, pageLimit: 0 })))).toBe(
      'INVALID_INPUT',
    );
    expect(await code(() => collect(fetchAnnouncements(chainRpc(txs), { fromSlot: -1n })))).toBe(
      'INVALID_INPUT',
    );
    expect(await code(() => collect(fetchAnnouncements(chainRpc(txs), { fromSlot: 10n, toSlot: 5n })))).toBe(
      'INVALID_INPUT',
    );
    const lying = chainRpc(txs.map((t) => (t.signature === 'sol' ? { ...t, slot: 101 } : t)));
    expect(await code(() => collect(fetchAnnouncements(lying, { fromSlot: 0n })))).toBe('INVALID_RESPONSE');
    const ac = new AbortController();
    ac.abort();
    const adapter = createSolanaAdapter({ cluster: 'devnet', rpc: chainRpc(txs) });
    expect(
      await code(() =>
        collect(
          adapter.scan(
            { fromBlock: 0n },
            { viewingSecret: alice.viewSecret, spendingPublicKey: alice.spendPublicKey },
            ac.signal,
          ),
        ),
      ),
    ).toBe('ABORTED');
    const ac2 = new AbortController();
    const it2 = scanAnnouncements(
      fetchAnnouncements(chainRpc(txs), { fromSlot: 0n }),
      alice.viewSecret,
      alice.spendPublicKey,
      ac2.signal,
    );
    ac2.abort();
    expect(await code(() => collect(it2))).toBe('ABORTED');
  });

  it('skips transactions the RPC no longer returns', async () => {
    const { txs } = await fixtureChain();
    const rpc = chainRpc(txs);
    const orig = rpc.request.bind(rpc);
    rpc.request = (m, p) => (m === 'getTransaction' && p[0] === 'sol' ? Promise.resolve(null) : orig(m, p));
    const recs = await collect(fetchAnnouncements(rpc, { fromSlot: 0n }));
    expect(recs.map((r) => r.signature)).not.toContain('sol');
  });

  it('memosOf and creditsFor', async () => {
    const { txs } = await fixtureChain();
    const rpc = chainRpc(txs);
    const recs = await collect(fetchAnnouncements(rpc, { fromSlot: 0n, indexAddress: MEMO_PROGRAM_V1 }));
    expect(recs.length).toBeGreaterThan(0);
    const tx = recs[0]!.tx;
    expect(memosOf({ ...tx, instructions: [{ programIdIndex: 200, accounts: [], data: '' }] })).toEqual([]);
    expect(creditsFor(tx, 'nobody')).toEqual({ lamports: 0n, tokens: [] });
    expect(memosOf(tx)[0]?.startsWith(ANNOUNCEMENT_PREFIX)).toBe(true);
    const k = encodeAnnouncementMemo(alice.viewPublicKey, 1);
    expect(k.startsWith(ANNOUNCEMENT_PREFIX)).toBe(true);
  });
});

describe('Solana adapter surface', () => {
  it('chain ids, fees and mainnet guard', async () => {
    expect(solanaChainId('devnet')).toBe('sol-devnet');
    expect(await code(() => createSolanaAdapter({ cluster: 'mainnet' }))).toBe('CHAIN_DISABLED');
    expect(createSolanaAdapter({ cluster: 'mainnet', allowMainnet: true }).chainId).toBe('sol-mainnet');
    const a = createSolanaAdapter({ cluster: 'devnet' });
    expect(a.family).toBe('solana');
    expect(a.fees).toBe(SOLANA_FEES);
    expect(Object.values(SOLANA_FEES)).toEqual(['not_deployed', 'not_deployed', 'not_deployed']);
    expect(
      await code(() =>
        a.scan(
          { fromBlock: 0n },
          { viewingSecret: alice.viewSecret, spendingPublicKey: alice.spendPublicKey },
          new AbortController().signal,
        ),
      ),
    ).toBe('UNSUPPORTED');
  });
  it('parseRecipient canonicalises and enforces cluster', async () => {
    const a = createSolanaAdapter({ cluster: 'devnet' });
    const r = a.parseRecipient(aliceMeta);
    expect(r).toMatchObject({ family: 'solana', canonical: aliceMeta });
    expect(r.spendingPublicKey).toEqual(alice.spendPublicKey);
    const t = createSolanaAdapter({ cluster: 'testnet' });
    expect(await code(() => t.parseRecipient(aliceMeta))).toBe('NETWORK_MISMATCH');
  });
  it('buildPaymentRequest: native via RPC rent lookup, SPL, quotes and errors', async () => {
    const rpc = chainRpc([]);
    const a = createSolanaAdapter({ cluster: 'devnet', rpc, announcementIndexAddress: MEMO_PROGRAM });
    const req = a.buildPaymentRequest({
      chainId: 'sol-devnet',
      recipient: aliceMeta,
      asset: { kind: 'native' },
      amount: 1_000_000n,
    });
    expect(req).toMatchObject({
      family: 'solana',
      asset: 'native',
      grossAmount: 1_000_000n,
      netAmount: 1_000_000n,
      feeAmount: 0n,
    });
    const built = await req.build({ payer: payer.address, lifetime, rng: seededRng('adapter') });
    expect(built.tx.requiredSigners).toEqual([payer.address]);
    expect(rpc.calls.some((c) => c.method === 'getMinimumBalanceForRentExemption')).toBe(true);
    const low = a.buildPaymentRequest({
      chainId: 'sol-devnet',
      recipient: aliceMeta,
      asset: { kind: 'native' },
      amount: 5n,
    });
    expect(await code(() => low.build({ payer: payer.address, lifetime }))).toBe('BELOW_RENT_EXEMPT');

    const q = a.buildPaymentRequest(
      { chainId: 'sol-devnet', recipient: aliceMeta, asset: spl },
      { quotedTokenAmount: 5n },
    );
    expect(q.asset).toBe(mint);
    const b2 = await q.build({
      payer: payer.address,
      feePayer: sponsor.address,
      lifetime,
      payerTokenAccount: sponsor.address,
      rentExemptMinimum: 0n,
    });
    expect(b2.tx.requiredSigners).toEqual([sponsor.address, payer.address]);

    const noRpc = createSolanaAdapter({ cluster: 'devnet' });
    const r3 = noRpc.buildPaymentRequest({
      chainId: 'sol-devnet',
      recipient: aliceMeta,
      asset: { kind: 'native' },
      amount: 1_000_000n,
    });
    expect(await code(() => r3.build({ payer: payer.address, lifetime }))).toBe('INVALID_INPUT');
    expect(
      (await r3.build({ payer: payer.address, lifetime, rentExemptMinimum: 1n })).tx.requiredSigners,
    ).toHaveLength(1);

    expect(
      await code(() =>
        a.buildPaymentRequest({
          chainId: 'sol-mainnet',
          recipient: aliceMeta,
          asset: { kind: 'native' },
          amount: 1n,
        }),
      ),
    ).toBe('CHAIN_MISMATCH');
    expect(
      await code(() =>
        a.buildPaymentRequest({ chainId: 'sol-devnet', recipient: aliceMeta, asset: { kind: 'native' } }),
      ),
    ).toBe('INVALID_AMOUNT');
    expect(
      await code(() =>
        a.buildPaymentRequest({
          chainId: 'sol-devnet',
          recipient: aliceMeta,
          asset: { kind: 'native' },
          amount: 1n << 64n,
        }),
      ),
    ).toBe('INVALID_AMOUNT');
    expect(SYSTEM_PROGRAM).toBe('11111111111111111111111111111111');
  });
});
