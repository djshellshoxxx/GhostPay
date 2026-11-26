/**
 * Cover lookups for matched router payments (`matchCover`), measured with the PRIV-T02 instrumentation over the real
 * scanner, client and fixed-window client against a synthetic chain. Evidence level T (deterministic mock): request
 * shapes and counts only, no live provider, no timing, no anonymity claim.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { SyntheticChain } from '../test/disclosureChain';
import { memoryCheckpoints, newSeller, runDisclosureScenario, sellerLog, strangerLog, type ScenarioOutput } from '../test/disclosureHarness';
import type { MadeLog } from '../test/announcements';
import type { RpcDisclosureRecord } from '../test/rpcDisclosure';
import { MATCH_COVER_SIZE } from './matchCover';

const seller = newSeller();
const txSpecific = (rows: readonly RpcDisclosureRecord[]): RpcDisclosureRecord[] => rows.filter((r) => r.classes.includes('transaction-specific'));
const role = (rows: readonly RpcDisclosureRecord[], name: string): RpcDisclosureRecord[] => rows.filter((r) => r.role === name);
const count = (rows: readonly RpcDisclosureRecord[], method: string): number => rows.filter((r) => r.method === method).length;

/** A chain that remembers which transaction hashes it was asked about (values stay inside the test). */
function watched(logs: readonly MadeLog[]): { readonly chain: SyntheticChain; readonly asked: () => string[] } {
  const chain = new SyntheticChain({ chainId: 84532, head: 2500, logs: logs.map((l) => l.log) });
  const asked: string[] = [];
  chain.intercept = (method, params) => {
    if (method === 'eth_getTransactionReceipt') asked.push(String(params[0]).toLowerCase());
    return undefined;
  };
  return { chain, asked: () => [...asked] };
}

const mine = sellerLog(seller, { block: 120, index: 0 });
// Other people's router payments in the same 1000-block window as the seller's, and one in a different window.
const sameWindow = [130, 140, 150, 160, 170, 180].map((block, i) => strangerLog({ block, index: i + 1 }));
const otherWindow = strangerLog({ block: 1500, index: 0 });
const page = [mine, ...sameWindow, otherWindow];
const hashOf = (m: MadeLog): string => (m.log.transactionHash ?? '').toLowerCase();

const out: Record<string, ScenarioOutput> = {};
const asked: Record<string, string[]> = {};
beforeAll(async () => {
  for (const [id, cover] of [['off', undefined], ['on', MATCH_COVER_SIZE], ['on-again', MATCH_COVER_SIZE]] as const) {
    const w = watched(page);
    out[id] = await runDisclosureScenario({ id: `cover-${id}`, seller, chain: w.chain, matched: [mine], checkpoints: memoryCheckpoints(), ...(cover === undefined ? {} : { matchCover: cover }) });
    asked[id] = w.asked();
  }
  const thin = watched([mine, sameWindow[0]!, otherWindow]);
  out['thin'] = await runDisclosureScenario({ id: 'cover-thin', seller, chain: thin.chain, matched: [mine], checkpoints: memoryCheckpoints(), matchCover: MATCH_COVER_SIZE });
  asked['thin'] = thin.asked();
  const p = watched(page);
  const s = watched(page);
  out['two'] = await runDisclosureScenario({ id: 'cover-two-providers', seller, chain: p.chain, secondary: s.chain, matched: [mine], checkpoints: memoryCheckpoints(), matchCover: MATCH_COVER_SIZE });
  asked['two-primary'] = p.asked();
  asked['two-secondary'] = s.asked();
});

describe('cover lookups for a matched router payment', () => {
  it('all scenarios complete without a scan error', () => {
    for (const [id, o] of Object.entries(out)) expect({ id, error: o.error }).toEqual({ id, error: undefined });
  });

  it('off (default): only the payment itself is looked up, exactly as before', () => {
    expect(asked['off']).toEqual([hashOf(mine)]);
    expect(txSpecific(out['off']!.rec.records)).toHaveLength(2);
  });

  it('on: the payment is looked up among size - 1 other router payments of its window, with identical requests', () => {
    const lookups = asked['on']!;
    expect(lookups).toHaveLength(MATCH_COVER_SIZE);
    expect(new Set(lookups).size).toBe(MATCH_COVER_SIZE);
    expect(lookups).toContain(hashOf(mine));
    const windowHashes = new Set(sameWindow.map(hashOf));
    expect(lookups.filter((h) => h !== hashOf(mine)).every((h) => windowHashes.has(h))).toBe(true);
    expect(lookups).not.toContain(hashOf(otherWindow));
    const rows = txSpecific(out['on']!.rec.records);
    // Each lookup is the same pair as the real verification: one receipt and one transaction request.
    expect(count(rows, 'eth_getTransactionReceipt')).toBe(MATCH_COVER_SIZE);
    expect(count(rows, 'eth_getTransactionByHash')).toBe(MATCH_COVER_SIZE);
    // Ground truth only the test knows: 2 of the 8 requests concern the real payment, as without cover.
    expect(rows.filter((r) => r.relatedToMatchedPayment)).toHaveLength(2);
  });

  it('on: verification of the real payment is unchanged and decoys produce no match', () => {
    const view = (o: ScenarioOutput): unknown => o.matches.map((m) => ({ id: m.announcement.id, receipt: m.receipt, viaRouter: m.viaRouter }));
    expect(view(out['on']!)).toEqual(view(out['off']!));
    expect(out['on']!.matches).toHaveLength(1);
  });

  it('on: a rescan looks up exactly the same cover set (comparing scans does not single out the payment)', () => {
    expect([...asked['on-again']!].sort()).toEqual([...asked['on']!].sort());
  });

  it('on, thin window: uses the router payments that exist and never borrows from another window', () => {
    expect([...asked['thin']!].sort()).toEqual([hashOf(mine), hashOf(sameWindow[0]!)].sort());
  });

  it('on, two providers: the second provider receives the same cover lookups as the first', () => {
    expect(asked['two-primary']).toHaveLength(MATCH_COVER_SIZE);
    expect([...asked['two-secondary']!].sort()).toEqual([...asked['two-primary']!].sort());
    const rows = out['two']!.rec.records;
    expect(count(txSpecific(role(rows, 'secondary')), 'eth_getTransactionReceipt')).toBe(MATCH_COVER_SIZE);
  });
});
