/**
 * Cover lookups for matched router payments (`matchCover`), measured with the PRIV-T02 instrumentation over the real
 * scanner, client and fixed-window client against a synthetic chain. Evidence level T (deterministic mock): request
 * shapes and counts only, no live provider, no timing, no anonymity claim.
 */
import { unsafeRevealSecret } from '@ghostpay/core-crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeAbiParameters } from 'viem/utils';
import { SyntheticChain } from '../test/disclosureChain';
import { memoryCheckpoints, newSeller, runDisclosureScenario, sellerLog, strangerLog, type ScenarioOutput } from '../test/disclosureHarness';
import type { MadeLog } from '../test/announcements';
import type { RpcDisclosureRecord } from '../test/rpcDisclosure';
import { createMatchCover, type CoverItem } from './matchCover';

const seller = newSeller();
const txSpecific = (rows: readonly RpcDisclosureRecord[]): RpcDisclosureRecord[] => rows.filter((r) => r.classes.includes('transaction-specific'));
const count = (rows: readonly RpcDisclosureRecord[], method: string): number => rows.filter((r) => r.method === method).length;
const UNSUPPORTED_TOKEN = '0x00000000000000000000000000000000deadbeef' as const;

interface Asked { readonly method: string; readonly arg: string }
/** A chain that remembers what it was asked (values stay inside the test). */
function watched(logs: readonly MadeLog[], head = 2500): { readonly chain: SyntheticChain; readonly asked: Asked[] } {
  const chain = new SyntheticChain({ chainId: 84532, head, logs: logs.map((l) => l.log) });
  const asked: Asked[] = [];
  chain.intercept = (method, params) => {
    asked.push({ method, arg: String(params[0]).toLowerCase() });
    return undefined;
  };
  return { chain, asked };
}
const receipts = (asked: readonly Asked[]): string[] => asked.filter((a) => a.method === 'eth_getTransactionReceipt').map((a) => a.arg);
const hashOf = (m: MadeLog): string => (m.log.transactionHash ?? '').toLowerCase();
const block = (m: MadeLog): bigint => BigInt(m.log.blockNumber);

/** What the seller's own key selects: computed independently of the scan, from the same rule. */
const planner = createMatchCover(true, unsafeRevealSecret(seller.keys.viewingSecret))!;
const asItem = (m: MadeLog): CoverItem => {
  const [ephemeralPublicKey, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], m.log.data as `0x${string}`);
  return { announcement: { id: `${m.log.blockHash}:${String(BigInt(m.log.logIndex))}`, blockNumber: block(m), logIndex: Number(BigInt(m.log.logIndex)), transactionHash: hashOf(m), ephemeralPublicKey, stealthAddress: m.stealthAddress, metadata } };
};
const selected = (ms: readonly MadeLog[]): string[] => ms.filter((m) => planner.selects(asItem(m))).map(hashOf);

const mine = sellerLog(seller, { block: 500, index: 0 });
// Other people's router payments in the same 1000-block window, spread around the seller's payment.
const sameWindow = Array.from({ length: 16 }, (_, i) => strangerLog({ block: 100 + i * 50, index: i + 1 }));
const otherWindow = strangerLog({ block: 1500, index: 0 });
const junk = strangerLog({ block: 520, index: 30, token: UNSUPPORTED_TOKEN });
const mine2 = sellerLog(seller, { block: 1600, index: 3 });
// Spam: many cheap router payments in an unsupported token. Verification would skip them without a request, so as cover
// they would be silent lookups that add nothing.
const spam = Array.from({ length: 80 }, (_, i) => strangerLog({ block: 600 + i, index: 40 + i, token: UNSUPPORTED_TOKEN }));
const page = [mine, ...sameWindow, otherWindow, junk];

const out: Record<string, ScenarioOutput> = {};
const asked: Record<string, Asked[]> = {};
async function scenario(id: string, logs: readonly MadeLog[], options: { cover?: boolean; from?: bigint; secondary?: boolean; matched?: readonly MadeLog[] } = {}): Promise<void> {
  const w = watched(logs);
  const s = options.secondary === true ? watched(logs) : undefined;
  out[id] = await runDisclosureScenario({
    id, seller, chain: w.chain, matched: options.matched ?? [mine], checkpoints: memoryCheckpoints(),
    ...(s === undefined ? {} : { secondary: s.chain }),
    ...(options.from === undefined ? {} : { cursor: { nextBlock: options.from } }),
    ...(options.cover === true ? { matchCover: true } : {}),
  });
  asked[id] = w.asked;
  if (s !== undefined) asked[`${id}-secondary`] = s.asked;
}

beforeAll(async () => {
  await scenario('off', page);
  await scenario('on', page, { cover: true });
  await scenario('on-again', page, { cover: true });
  // A later scan that starts inside the window (a resume): it sees only part of the window.
  await scenario('resume', page, { cover: true, from: 300n });
  await scenario('two', page, { cover: true, secondary: true });
  await scenario('spam', [...page, ...spam], { cover: true });
  await scenario('pair-off', [...page, mine2], { matched: [mine, mine2] });
  await scenario('pair-on', [...page, mine2], { cover: true, matched: [mine, mine2] });
  // The same chain range without the seller's payment: nothing matches.
  await scenario('none-on', [...sameWindow, otherWindow, junk], { cover: true, matched: [] });
});

describe('cover lookups for a matched router payment', () => {
  it('fixtures: the seller key selects some cover in the window', () => {
    expect(selected(sameWindow).length).toBeGreaterThan(0);
    for (const [id, o] of Object.entries(out)) expect({ id, error: o.error }).toEqual({ id, error: undefined });
  });

  it('off (default): only the payment itself is looked up, exactly as before', () => {
    expect(receipts(asked['off']!)).toEqual([hashOf(mine)]);
    expect(txSpecific(out['off']!.rec.records)).toHaveLength(2);
  });

  it('on: the payment plus exactly the key-selected router payments of the page, never a silent one', () => {
    const lookups = receipts(asked['on']!);
    expect([...lookups].sort()).toEqual([hashOf(mine), ...selected([...sameWindow, otherWindow])].sort());
    // An unsupported-token router payment would be rejected before any request: never used as cover.
    expect(lookups).not.toContain(hashOf(junk));
    const rows = txSpecific(out['on']!.rec.records);
    expect(count(rows, 'eth_getTransactionReceipt')).toBe(lookups.length);
    expect(count(rows, 'eth_getTransactionByHash')).toBe(lookups.length);
    expect(rows.filter((r) => r.relatedToMatchedPayment)).toHaveLength(2);
  });

  it('on: a range with no payment is looked up exactly like one with a payment, so lookups do not reveal a match', () => {
    const none = receipts(asked['none-on']!);
    expect([...none].sort()).toEqual(selected([...sameWindow, otherWindow]).sort());
    expect(none.length).toBeGreaterThan(0);
    // The only lookup the payment adds is its own.
    expect([...receipts(asked['on']!)].sort()).toEqual([...none, hashOf(mine)].sort());
  });

  it('on: each cover lookup repeats the real one: the block read, the receipt and the transaction, in chain order', () => {
    const a = asked['on']!;
    const looked = receipts(a);
    const byHash = new Map(page.map((m) => [hashOf(m), m] as const));
    for (const h of looked) {
      const m = byHash.get(h)!;
      expect(a.some((x) => x.method === 'eth_getTransactionByHash' && x.arg === h)).toBe(true);
      expect(a.some((x) => x.method === 'eth_getBlockByNumber' && BigInt(x.arg) === block(m))).toBe(true);
    }
    const blocks = looked.map((h) => block(byHash.get(h)!));
    expect([...blocks].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))).toEqual(blocks);
  });

  it('on: the real verification is unchanged and cover produces no match', () => {
    const view = (o: ScenarioOutput): unknown => o.matches.map((m) => ({ id: m.announcement.id, receipt: m.receipt }));
    expect(view(out['on']!)).toEqual(view(out['off']!));
    expect(view(out['pair-on']!)).toEqual(view(out['pair-off']!));
  });

  it('on: a rescan, and a resume that sees only part of the range, look up the same selection (no intersection)', () => {
    expect([...receipts(asked['on-again']!)].sort()).toEqual([...receipts(asked['on']!)].sort());
    const resumed = receipts(asked['resume']!);
    const expected = [hashOf(mine), ...selected([...sameWindow, otherWindow].filter((m) => block(m) >= 300n))];
    expect([...resumed].sort()).toEqual([...expected].sort());
    // Overlap of the two scans: the payment and every selected cover the resume could see, never the payment alone.
    const overlap = resumed.filter((h) => receipts(asked['on']!).includes(h));
    expect(overlap.length).toBe(expected.length);
    expect(overlap.length).toBeGreaterThan(1);
  });

  it('on, under unsupported-token spam: cover is exactly the same as without it', () => {
    expect([...receipts(asked['spam']!)].sort()).toEqual([...receipts(asked['on']!)].sort());
  });

  it('on, two providers: the second provider gets the same lookups, cover included', () => {
    expect(receipts(asked['two']!).length).toBeGreaterThan(1);
    expect([...receipts(asked['two-secondary']!)].sort()).toEqual([...receipts(asked['two']!)].sort());
  });

  it('on, two payments: both looked up among the cover, in chain order', () => {
    const looked = receipts(asked['pair-on']!);
    expect(looked).toContain(hashOf(mine));
    expect(looked).toContain(hashOf(mine2));
    expect(looked.length).toBeGreaterThan(2);
    const blocks = looked.map((h) => block([...page, mine2].find((m) => hashOf(m) === h)!));
    expect([...blocks].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))).toEqual(blocks);
  });

  it('on: the scan wipes its viewing key', async () => {
    const viewingKey = unsafeRevealSecret(seller.keys.viewingSecret);
    const w = watched(page);
    const o = await runDisclosureScenario({ id: 'wipe', seller, chain: w.chain, matched: [mine], matchCover: true, viewingKey });
    expect(o.error).toBeUndefined();
    expect(viewingKey.every((byte) => byte === 0)).toBe(true);
  });
});

describe('cover lookups and the replay after a pending or failed check', () => {
  /** A stranger's payment at the same position as the seller's, picked until the seller's key selects it as cover. */
  const selectedStranger = (): MadeLog => {
    for (;;) {
      const m = strangerLog({ block: 525, index: 0 });
      if (planner.selects(asItem(m))) return m;
    }
  };
  const real = sellerLog(seller, { block: 525, index: 0 });
  const decoy = selectedStranger();

  /** One page up to head 900 (finality depth 100), so a scan with nothing to replay saves block 801. */
  async function replayRun(target: MadeLog, matched: readonly MadeLog[], options: { fail?: boolean; lateHead?: number; cover?: boolean; from?: bigint } = {}) {
    const w = watched([target, ...sameWindow], 900);
    const record = w.chain.intercept!;
    let fetched = false;
    w.chain.intercept = (method, params) => {
      record(method, params);
      if (method === 'eth_getLogs') fetched = true;
      if (options.fail === true && method === 'eth_getTransactionReceipt' && String(params[0]).toLowerCase() === hashOf(target)) return null;
      return fetched && options.lateHead !== undefined && method === 'eth_blockNumber' ? `0x${options.lateHead.toString(16)}` : undefined;
    };
    const checkpoints = memoryCheckpoints();
    const o = await runDisclosureScenario({
      id: 'replay', seller, chain: w.chain, matched, checkpoints, matchCover: options.cover ?? true,
      ...(options.from === undefined ? {} : { cursor: { nextBlock: options.from } }),
    });
    expect(o.error).toBeUndefined();
    const blockReads = w.asked.filter((a) => a.method === 'eth_getBlockByNumber').map((a) => BigInt(a.arg))
      .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return { blockReads, saved: checkpoints.saved.at(-1)?.nextBlock, receipts: o.matches.map((m) => m.receipt) };
  }

  it('reads the same blocks after a failed check of a payment as after the same failure of cover', async () => {
    const mineFails = await replayRun(real, [real], { fail: true });
    const coverFails = await replayRun(decoy, [], { fail: true });
    expect(mineFails.receipts).toEqual(['claimed']);
    expect(coverFails.receipts).toEqual([]);
    expect(coverFails.blockReads).toEqual(mineFails.blockReads);
    // The replay anchor: the block before the failed check, where the next scan starts.
    expect(mineFails.blockReads).toContain(524n);
    expect([mineFails.saved, coverFails.saved]).toEqual([525n, 525n]);
  });

  it('reads the same blocks when a lower head leaves a payment or the same cover pending', async () => {
    const minePending = await replayRun(real, [real], { lateHead: 550 });
    const coverPending = await replayRun(decoy, [], { lateHead: 550 });
    expect(minePending.receipts).toEqual(['pending']);
    expect(coverPending.blockReads).toEqual(minePending.blockReads);
    expect(coverPending.saved).toBe(minePending.saved);
    expect(minePending.saved).toBeLessThanOrEqual(525n);
  });

  it('replays a failed cover check once: a scan resumed at it saves past it', async () => {
    expect((await replayRun(decoy, [], { fail: true, from: 525n })).saved).toBe(801n);
  });

  it('does not move the checkpoint for a claim that sends no request while cover is on', async () => {
    const dust = sellerLog(seller, { block: 525, index: 0, token: UNSUPPORTED_TOKEN });
    const on = await replayRun(dust, [dust]);
    expect(on.receipts).toEqual(['claimed']);
    expect(on.saved).toBe(801n);
    // Off keeps the earlier rule.
    expect((await replayRun(dust, [dust], { cover: false })).saved).toBe(525n);
  });
});
