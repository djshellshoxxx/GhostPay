/**
 * PRIV-T02: what the RPC endpoints OBSERVE across the scanning lifecycle, measured with test-only instrumentation over the
 * real scanner (`runScan`), the real `createClient` and the real fixed-window client, against a synthetic chain.
 *
 * Evidence level T (deterministic mock). These tests pin observed request shapes. They do not show what a live provider
 * logs, do not measure timing on a network, and prove no anonymity. Records hold parameter classes and counts only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { SyntheticChain } from '../test/disclosureChain';
import {
  GRID,
  memoryCheckpoints,
  newSeller,
  runDisclosureScenario,
  sellerLog,
  strangerLog,
  type ScenarioOutput,
} from '../test/disclosureHarness';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { TOKEN_84532, type MadeLog } from '../test/announcements';
import {
  addedSignatures,
  assertSanitized,
  renderReport,
  sameShape,
  summarize,
  WireFault,
  type RpcDisclosureRecord,
} from '../test/rpcDisclosure';

const seller = newSeller();
const chainOf = (logs: readonly MadeLog[], head = 2500): SyntheticChain => new SyntheticChain({ chainId: 84532, head, logs: logs.map((l) => l.log) });
const roleRows = (rows: readonly RpcDisclosureRecord[], role: string): RpcDisclosureRecord[] => rows.filter((r) => r.role === role);
const txSpecific = (rows: readonly RpcDisclosureRecord[]): RpcDisclosureRecord[] => rows.filter((r) => r.classes.includes('transaction-specific'));
const methods = (rows: readonly RpcDisclosureRecord[]): string[] => rows.map((r) => r.method);

const out: Record<string, ScenarioOutput> = {};
const forbidden: string[] = [FAKE_ROUTER, FAKE_ANNOUNCER, TOKEN_84532];

beforeAll(async () => {
  const mine = sellerLog(seller, { block: 120, index: 0 });
  const mine2 = sellerLog(seller, { block: 1500, index: 1 });
  const mine3 = sellerLog(seller, { block: 2100, index: 2 });
  const others = [strangerLog({ block: 130, index: 1 }), strangerLog({ block: 2100, index: 0 })];
  forbidden.push(...[mine, mine2, mine3].flatMap((m) => [m.stealthAddress, m.log.transactionHash ?? '']));

  // Baseline for match-dependence: identical public footprint (same blocks), but nothing belongs to the seller.
  const twin = (m: MadeLog): MadeLog => strangerLog({ block: Number(BigInt(m.log.blockNumber)), index: Number(BigInt(m.log.logIndex)) });

  out['A'] = await runDisclosureScenario({ id: 'A-empty', seller, chain: chainOf([]), checkpoints: memoryCheckpoints() });
  out['B'] = await runDisclosureScenario({ id: 'B-public-only', seller, chain: chainOf(others), checkpoints: memoryCheckpoints() });
  out['N'] = await runDisclosureScenario({ id: 'N-nonmatching-twin', seller, chain: chainOf([twin(mine), others[0]!]), checkpoints: memoryCheckpoints() });
  out['C'] = await runDisclosureScenario({ id: 'C-match', seller, chain: chainOf([mine, others[0]!]), matched: [mine], checkpoints: memoryCheckpoints() });
  out['N3'] = await runDisclosureScenario({ id: 'N3-twin', seller, chain: chainOf([twin(mine), twin(mine2), twin(mine3), others[0]!]), checkpoints: memoryCheckpoints() });
  out['D'] = await runDisclosureScenario({ id: 'D-multi', seller, chain: chainOf([mine, mine2, mine3, others[0]!]), matched: [mine, mine2, mine3], checkpoints: memoryCheckpoints() });

  // E: (1) addressed to the seller but with a wrong view tag; (2) a router claim whose transaction cannot be found.
  const wrongTag = sellerLog(seller, { block: 150, index: 0, wrongTag: true });
  const unverifiable = sellerLog(seller, { block: 600, index: 1 });
  forbidden.push(wrongTag.stealthAddress, unverifiable.stealthAddress, unverifiable.log.transactionHash ?? '');
  out['E1'] = await runDisclosureScenario({ id: 'E1-wrong-tag', seller, chain: chainOf([wrongTag, others[0]!]), rejected: [wrongTag], checkpoints: memoryCheckpoints() });
  const chE2 = chainOf([unverifiable, others[0]!]);
  chE2.intercept = (m, p) => ((m === 'eth_getTransactionReceipt' || m === 'eth_getTransactionByHash') && String(p[0]).toLowerCase() === unverifiable.log.transactionHash?.toLowerCase() ? null : undefined);
  out['E2'] = await runDisclosureScenario({ id: 'E2-unverifiable-claim', seller, chain: chE2, rejected: [unverifiable], checkpoints: memoryCheckpoints() });
  out['N2'] = await runDisclosureScenario({ id: 'N2-twin', seller, chain: chainOf([twin(unverifiable), others[0]!]), checkpoints: memoryCheckpoints() });

  // H and G share one saved checkpoint on a longer chain: first run, resume, then a fork at the checkpoint anchor.
  const deep = sellerLog(seller, { block: 120, index: 5 });
  forbidden.push(deep.stealthAddress, deep.log.transactionHash ?? '');
  const chH = chainOf([deep, strangerLog({ block: 2200, index: 1 })], 5000);
  const cp = memoryCheckpoints();
  out['H0'] = await runDisclosureScenario({ id: 'H0-first-run', seller, chain: chH, matched: [deep], checkpoints: cp });
  const anchor = cp.saved.at(-1)!;
  out['H'] = await runDisclosureScenario({ id: 'H-resume', seller, chain: chH, matched: [deep], checkpoints: cp, cursor: anchor });
  chH.fork(Number(anchor.last?.number ?? 0));
  out['G'] = await runDisclosureScenario({ id: 'G-reorg', seller, chain: chH, matched: [deep], checkpoints: cp, cursor: anchor });
  (out['H0'] as ScenarioOutput & { anchor?: unknown }).anchor = anchor;

  // I: two providers. Agreeing, then the second omitting the payment's announcement.
  const common = [mine, others[0]!];
  out['IA'] = await runDisclosureScenario({ id: 'I-agree', seller, chain: chainOf(common), secondary: chainOf(common), matched: [mine], checkpoints: memoryCheckpoints() });
  out['ID'] = await runDisclosureScenario({ id: 'I-disagree', seller, chain: chainOf(common), secondary: chainOf([others[0]!]), matched: [mine], checkpoints: memoryCheckpoints() });

  // J: long historical range with one retried request.
  const chJ = chainOf([mine, strangerLog({ block: 5300, index: 1 })], 12000);
  chJ.failNext('eth_getLogs', new WireFault('http', 503), 1);
  out['J'] = await runDisclosureScenario({ id: 'J-large', seller, chain: chJ, matched: [mine], checkpoints: memoryCheckpoints() });
  out['J0'] = await runDisclosureScenario({ id: 'J0-large-no-retry', seller, chain: chainOf([mine, strangerLog({ block: 5300, index: 1 })], 12000), matched: [mine], checkpoints: memoryCheckpoints() });
});

const rows = (k: string): readonly RpcDisclosureRecord[] => (out[k] as ScenarioOutput).rec.records;
const ALL = ['A', 'B', 'N', 'C', 'N3', 'D', 'E1', 'E2', 'N2', 'H0', 'H', 'G', 'IA', 'ID', 'J', 'J0'];

describe('all scenarios', () => {
  it('complete without a scan error (except none expected)', () => {
    for (const k of ALL) expect((out[k] as ScenarioOutput).error, k).toBeUndefined();
  });

  it('every observed request is recognised: nothing is classed unknown', () => {
    for (const k of ALL) expect(summarize(k, rows(k)).unknown, k).toBe(0);
  });

  it('no scan-path request names a user address, a recipient filter or a token contract', () => {
    for (const k of ALL) {
      const s = summarize(k, rows(k));
      expect(s.addressSpecific, k).toBe(0);
      expect(s.recipientSpecific, k).toBe(0);
      expect(rows(k).some((r) => r.hasRecipientFilter || r.hasTokenIdentifier), k).toBe(false);
    }
  });

  it('every log query targets the public announcer, spans at most one grid window and is not progress-revealing', () => {
    for (const k of ALL) {
      for (const r of rows(k).filter((x) => x.method === 'eth_getLogs')) {
        expect(r.classes, k).toEqual(['public-block-range', 'contract-specific']);
        expect(r.blockRangeSize ?? Infinity, k).toBeLessThanOrEqual(GRID);
        expect(r.hasEventTopic, k).toBe(true);
        expect(r.revealsScanProgress, k).toBe(false);
      }
    }
  });

  it('fixed windows do not hide position: every progress-revealing request is an exact block read', () => {
    for (const k of ALL) {
      const revealing = rows(k).filter((r) => r.revealsScanProgress);
      expect(revealing.length, k).toBeGreaterThan(0);
      expect(new Set(methods(revealing)), k).toEqual(new Set(['eth_getBlockByNumber']));
    }
  });

  it('only the configured endpoint roles are contacted (no silent third provider)', () => {
    for (const k of ALL) for (const r of rows(k)) expect(['primary', 'secondary'], k).toContain(r.role);
  });

  it('records and the rendered report hold no raw address, hash or token', () => {
    for (const k of ALL) assertSanitized(rows(k), forbidden);
    assertSanitized(renderReport('t', ALL.map((k) => summarize(k, rows(k)))), forbidden);
  });
});

describe('A, B: empty and public-only scans', () => {
  it('A: chain identity, head, windows, exact block reads; no transaction-specific request', () => {
    const m = new Set(methods(rows('A')));
    expect(m).toEqual(new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getLogs']));
    expect(txSpecific(rows('A'))).toHaveLength(0);
  });

  it('B: public announcements of other users add only public block reads, never an address or transaction request', () => {
    const added = addedSignatures(rows('A'), rows('B'));
    expect(added.size).toBeGreaterThan(0);
    for (const sig of added.keys()) expect(sig).toContain('eth_getBlockByNumber|public-chain-metadata');
    expect(txSpecific(rows('B'))).toHaveLength(0);
  });
});

describe('C, D, F: matching payments and receipt verification', () => {
  it('C: a matched router payment adds exactly one receipt and one transaction lookup, and nothing address-specific', () => {
    const tx = txSpecific(rows('C'));
    expect(methods(tx).sort()).toEqual(['eth_getTransactionByHash', 'eth_getTransactionReceipt']);
    expect(tx.every((r) => r.relatedToMatchedPayment && r.classes.includes('payment-specific'))).toBe(true);
    expect(rows('C').filter((r) => r.relatedToMatchedPayment)).toHaveLength(2);
  });

  it('C vs a non-matching twin with the same public footprint: the match is directly observable as transaction-specific traffic', () => {
    expect(txSpecific(rows('N'))).toHaveLength(0);
    expect(sameShape(rows('N'), rows('C'))).toBe(false);
    const added = [...addedSignatures(rows('N'), rows('C'))];
    expect(added.filter(([sig]) => sig.includes('transaction-specific')).reduce((n, [, c]) => n + c, 0)).toBe(2);
  });

  it('D: three matches show up as three receipt and transaction pairs (the count is observable)', () => {
    expect(txSpecific(rows('D'))).toHaveLength(6);
    expect(txSpecific(rows('N3'))).toHaveLength(0);
    expect(rows('D').filter((r) => r.relatedToMatchedPayment)).toHaveLength(6);
    expect(methods(txSpecific(rows('D'))).filter((m) => m === 'eth_getTransactionReceipt')).toHaveLength(3);
  });

  it('D: each confirmation is its own round trip that follows a fresh head read, so it is not batched with the others', () => {
    const r = rows('D');
    const receiptIdx = r.map((x, i) => (x.method === 'eth_getTransactionReceipt' ? i : -1)).filter((i) => i >= 0);
    for (const i of receiptIdx) expect(r.slice(Math.max(0, i - 3), i).some((x) => x.method === 'eth_blockNumber'), String(i)).toBe(true);
  });

  it('F: verification traffic is limited to those lookups plus exact block reads; no balance or eth_call', () => {
    const extra = [...addedSignatures(rows('N'), rows('C'))].map(([sig]) => sig.split('|')[1]);
    expect(new Set(extra)).toEqual(new Set(['eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_blockNumber'].filter((m) => extra.includes(m))));
    expect(rows('C').some((r) => r.method === 'eth_getBalance' || r.method === 'eth_call')).toBe(false);
  });

  it('F: the receipt and the transaction request follow the response that carried the transaction hash', () => {
    expect(txSpecific(rows('C')).every((r) => r.followsResponse)).toBe(true);
  });
});

describe('E: rejected candidates', () => {
  it('E1: a wrong view tag is rejected locally and adds no request at all', () => {
    expect(sameShape(rows('E1'), rows('N'))).toBe(true);
    expect(txSpecific(rows('E1'))).toHaveLength(0);
  });

  it('E2: a tag-valid router claim whose transaction is unknown still triggers the lookups, indistinguishable by shape from a real payment', () => {
    expect(out['E2']?.matches.map((m) => m.receipt)).toEqual(['claimed']);
    expect(txSpecific(rows('E2'))).toHaveLength(2);
    expect(txSpecific(rows('N2'))).toHaveLength(0);
    const strip = (rs: readonly RpcDisclosureRecord[]): string[] => txSpecific(rs).map((r) => `${r.method}|${r.role}`).sort();
    expect(strip(rows('E2'))).toEqual(strip(rows('C')));
  });
});

describe('G, H: reorganisation and resume', () => {
  it('H: resuming starts with an exact read of the checkpoint block: the saved position is visible to the provider', () => {
    const r = rows('H');
    expect(r[0]?.method).toBe('eth_chainId');
    expect(r[1]?.method).toBe('eth_getBlockByNumber');
    expect(r[1]?.revealsScanProgress).toBe(true);
  });

  it('H: resuming does not repeat the earlier matched payment lookups', () => {
    expect(txSpecific(rows('H0')).length).toBeGreaterThan(0);
    expect(txSpecific(rows('H'))).toHaveLength(0);
    expect(rows('H').filter((r) => r.relatedToMatchedPayment)).toHaveLength(0);
  });

  it('H: a resume scan is much smaller than the first run', () => {
    expect(rows('H').length).toBeLessThan(rows('H0').length / 2);
  });

  it('G: a fork at the checkpoint anchor makes the scanner re-read the range and ask about the same payment again', () => {
    expect(rows('G').length).toBeGreaterThan(rows('H').length * 2);
    expect(txSpecific(rows('G')).length).toBeGreaterThan(0);
    expect(rows('G').filter((r) => r.relatedToMatchedPayment).length).toBeGreaterThan(0);
  });
});

describe('I: two providers', () => {
  it('the second provider receives the same payment-specific lookups as the first (match disclosure is duplicated)', () => {
    const p = txSpecific(roleRows(rows('IA'), 'primary'));
    const s = txSpecific(roleRows(rows('IA'), 'secondary'));
    expect(methods(s).sort()).toEqual(methods(p).sort());
    expect(summarize('IA', rows('IA')).classesByRole['secondary']).toContain('payment-specific');
  });

  it('the second provider also receives exact block reads, so its view of scan position is not coarser', () => {
    expect(roleRows(rows('IA'), 'secondary').some((r) => r.revealsScanProgress)).toBe(true);
  });

  it('a disagreeing second provider is surfaced and causes no extra provider to be contacted', () => {
    expect(out['ID']?.discrepancies).toBeGreaterThan(0);
    expect(new Set(rows('ID').map((r) => r.role))).toEqual(new Set(['primary', 'secondary']));
    expect(summarize('ID', rows('ID')).classesByRole['primary']).toEqual(summarize('IA', rows('IA')).classesByRole['primary']);
  });
});

describe('J: large historical scan and retries', () => {
  it('request count is bounded by the range: one log request per grid window plus the single retry', () => {
    const logs = rows('J0').filter((r) => r.method === 'eth_getLogs');
    expect(logs.length).toBeLessThanOrEqual(Math.ceil(12_001 / GRID) + 1);
    expect(rows('J0').length).toBeLessThan(100);
  });

  it('a retried log request repeats the identical shape and adds exactly one chain-identity re-check', () => {
    const failed = rows('J').filter((r) => r.outcome === 'error');
    const retries = rows('J').filter((r) => r.attempt > 0);
    expect(failed).toHaveLength(1);
    expect(retries).toHaveLength(1);
    expect(retries[0]?.method).toBe('eth_getLogs');
    expect(retries[0]?.classes).toEqual(failed[0]?.classes);
    expect(retries[0]?.blockRangeSize).toBe(failed[0]?.blockRangeSize);
    expect(rows('J').filter((r) => r.method === 'eth_chainId').length - rows('J0').filter((r) => r.method === 'eth_chainId').length).toBe(1);
  });

  it('retries introduce no address, transaction or recipient disclosure beyond the same scan without a retry', () => {
    const a = summarize('J', rows('J'));
    const b = summarize('J0', rows('J0'));
    expect([a.addressSpecific, a.transactionSpecific, a.recipientSpecific]).toEqual([b.addressSpecific, b.transactionSpecific, b.recipientSpecific]);
  });
});

describe('report', () => {
  it('writes the sanitized comparison when GHOSTPAY_DISCLOSURE_REPORT names a file (test-only, off by default)', async () => {
    const target = process.env['GHOSTPAY_DISCLOSURE_REPORT'];
    const labels: Record<string, string> = {
      A: 'A empty scan', B: 'B public announcements only', N: 'N non-matching twin of C', C: 'C one matching payment', N3: 'N3 non-matching twin of D',
      D: 'D three matching payments', E1: 'E1 wrong view tag', E2: 'E2 unverifiable router claim', N2: 'N2 non-matching twin of E2',
      H0: 'H0 first run (saves checkpoint)', H: 'H resume from checkpoint', G: 'G fork at checkpoint anchor', IA: 'I two providers agree',
      ID: 'I two providers disagree', J: 'J 12k blocks with one retry', J0: 'J0 12k blocks no retry',
    };
    const text = renderReport('Scan lifecycle request counts (mock chain, sanitized)', ALL.map((k) => ({ ...summarize(labels[k] ?? k, rows(k)) })));
    assertSanitized(text, forbidden);
    if (target === undefined || target === '') return;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(target, text);
  });
});
