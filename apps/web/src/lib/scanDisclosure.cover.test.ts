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
