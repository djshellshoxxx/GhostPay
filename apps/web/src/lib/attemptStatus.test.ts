// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { ATTEMPT_JOURNAL_KEY, attemptTxDigest, readAttempts, type WalletAttempt } from './duplicateAttemptJournal';
import { linkReplacement, resolveAttempt } from './attemptStatus';
import { mockRpc, type MockRpc } from '../test/mockRpc';
import { installTestLocks } from '../test/locks';

const CHAIN = 84532;
const ACCOUNT = '0x5555555555555555555555555555555555555555';
const OTHER = '0x6666666666666666666666666666666666666666';
const TO = '0x1111111111111111111111111111111111111111';
const DATA = '0xabcd';
const DIGEST = attemptTxDigest(CHAIN, ACCOUNT, TO, DATA, 5n);
const hashOf = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
const blockHash = (n: bigint): string => `0x${n.toString(16).padStart(64, 'b')}`;
const H = hashOf(1);
const R1 = hashOf(2);
const R2 = hashOf(3);

type Over = { -readonly [K in keyof WalletAttempt]?: WalletAttempt[K] | undefined };
const attempt = (over: Over = {}): WalletAttempt => ({
  id: '00000000-0000-4000-8000-000000000001', key: `0x${'a'.repeat(64)}`, chainId: CHAIN, account: ACCOUNT, kind: 'payment', createdAt: 1,
  status: 'submitted', hash: H, txDigest: DIGEST, ...over,
}) as WalletAttempt;
const tx = (hash: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  hash, from: ACCOUNT, to: TO, input: DATA, value: '0x5', nonce: '0x7', chainId: '0x14a34', blockHash: null, blockNumber: null, ...over,
});
const receipt = (hash: string, block: bigint, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  transactionHash: hash, to: TO, status: '0x1', blockNumber: `0x${block.toString(16)}`, blockHash: blockHash(block), ...over,
});

interface Chain {
  readonly rpc: MockRpc;
  readonly txs: Map<string, unknown>;
  readonly receipts: Map<string, unknown>;
  readonly canonical: Map<bigint, string>;
  head: bigint;
  latestNonce: bigint;
  fail?: string;
}
function chain(chainId = CHAIN): Chain {
  const c: Chain = {
    txs: new Map(), receipts: new Map(), canonical: new Map(), head: 100n, latestNonce: 7n,
    rpc: mockRpc(chainId, (method, params) => {
      if (c.fail === method) throw new Error('rpc down');
      switch (method) {
        case 'eth_getTransactionByHash': return c.txs.get(params[0] as string) ?? null;
        case 'eth_getTransactionReceipt': return c.receipts.get(params[0] as string) ?? null;
        case 'eth_getBlockByNumber': {
          const h = c.canonical.get(params[0] as bigint);
          return h === undefined ? null : { hash: h, parentHash: `0x${'0'.repeat(64)}` };
        }
        case 'eth_blockNumber': return `0x${c.head.toString(16)}`;
        case 'eth_getTransactionCount': return params[0] === ACCOUNT && params[1] === 'latest' ? `0x${c.latestNonce.toString(16)}` : 'bad';
        default: throw new Error(`unexpected ${method}`);
      }
    }),
  };
  return c;
}
function mined(c: Chain, hash: string, block: bigint, over: Record<string, unknown> = {}): void {
  const seen = c.txs.get(hash) as Record<string, unknown> | undefined;
  const evidence = receipt(hash, block, { to: seen?.['to'] ?? TO, ...over });
  c.receipts.set(hash, evidence);
  if (seen !== undefined) c.txs.set(hash, { ...seen, blockNumber: evidence['blockNumber'], blockHash: blockHash(block) });
  c.canonical.set(block, blockHash(block));
}

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); installTestLocks(); });

describe('resolveAttempt', () => {
  it('needs a hash: an unknown outcome is reported without contacting the RPC', async () => {
    const c = chain();
    await expect(resolveAttempt(c.rpc, attempt({ status: 'unknown', hash: undefined }))).resolves.toEqual({ state: 'no-hash' });
    expect(c.rpc.calls).toEqual([]);
  });

  it('reports a transaction the RPC does not know as not found (never as failed)', async () => {
    await expect(resolveAttempt(chain().rpc, attempt())).resolves.toEqual({ state: 'not-found', reorged: false });
  });

  it('reports a known, unmined transaction as pending with its nonce', async () => {
    const c = chain();
    c.txs.set(H, tx(H));
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'pending', reorged: false, nonce: 7 });
  });

  it('confirms only a canonical receipt and counts confirmations from the head', async () => {
    const c = chain();
    c.txs.set(H, tx(H));
    mined(c, H, 90n);
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'confirmed', blockNumber: 90n, blockHash: blockHash(90n), confirmations: 11n, nonce: 7 });
    mined(c, H, 90n, { status: '0x0' });
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toMatchObject({ state: 'reverted', blockNumber: 90n, confirmations: 11n });
  });

  it('treats a receipt whose block is no longer canonical as reorged, not confirmed', async () => {
    const c = chain();
    c.txs.set(H, tx(H));
    mined(c, H, 90n);
    c.canonical.set(90n, blockHash(91n));
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'pending', reorged: true, nonce: 7 });
    c.canonical.delete(90n);
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'pending', reorged: true, nonce: 7 });
    c.txs.delete(H);
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'not-found', reorged: true });
  });

  it.each([
    ['hash', { hash: R1 }],
    ['from', { from: OTHER }],
    ['chainId', { chainId: '0x1' }],
    ['to', { to: null }],
    ['txDigest', { input: '0xabce' }],
    ['txDigest', { value: '0x6' }],
    ['txDigest', { to: OTHER }],
  ] as const)('raises a %s mismatch when the observed transaction differs from the requested one', async (field, over) => {
    const c = chain();
    c.txs.set(H, tx(H, over));
    mined(c, H, 90n);
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'mismatch', field });
  });

  it('raises a nonce mismatch against a recorded nonce, and skips the digest check for old records', async () => {
    const c = chain();
    c.txs.set(H, tx(H, { input: '0xffff' }));
    await expect(resolveAttempt(c.rpc, attempt({ txDigest: undefined }))).resolves.toMatchObject({ state: 'pending' });
    c.txs.set(H, tx(H));
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 3 }))).resolves.toEqual({ state: 'mismatch', field: 'nonce' });
  });

  it.each([
    ['a non-object transaction', (c: Chain) => { c.txs.set(H, 'tx'); }],
    ['a non-canonical value', (c: Chain) => { c.txs.set(H, tx(H, { value: '5' })); }],
    ['a missing nonce', (c: Chain) => { c.txs.set(H, tx(H, { nonce: undefined })); }],
    ['an oversized nonce', (c: Chain) => { c.txs.set(H, tx(H, { nonce: `0x${(2n ** 53n).toString(16)}` })); }],
    ['an unknown receipt status', (c: Chain) => { c.txs.set(H, tx(H)); mined(c, H, 90n, { status: '0x2' }); }],
    ['a receipt without a hash', (c: Chain) => { c.txs.set(H, tx(H)); mined(c, H, 90n, { transactionHash: undefined }); }],
    ['a receipt with a different recipient', (c: Chain) => { c.txs.set(H, tx(H)); mined(c, H, 90n, { to: OTHER }); }],
    ['inconsistent transaction and receipt blocks', (c: Chain) => { c.txs.set(H, tx(H)); mined(c, H, 90n); c.txs.set(H, tx(H)); }],
    ['a receipt for another hash', (c: Chain) => { c.txs.set(H, tx(H)); mined(c, H, 90n, { transactionHash: R1 }); }],
    ['a malformed receipt block hash', (c: Chain) => { c.txs.set(H, tx(H)); mined(c, H, 90n, { blockHash: '0x12' }); }],
    ['a head below the receipt block', (c: Chain) => { c.txs.set(H, tx(H)); mined(c, H, 90n); c.head = 80n; }],
    ['a throwing transaction lookup', (c: Chain) => { c.fail = 'eth_getTransactionByHash'; }],
    ['a throwing block lookup', (c: Chain) => { c.txs.set(H, tx(H)); mined(c, H, 90n); c.fail = 'eth_getBlockByNumber'; }],
    ['a canonical receipt without its transaction', (c: Chain) => { mined(c, H, 90n); }],
    ['a malformed account nonce', (c: Chain) => { c.txs.set(H, tx(H)); c.latestNonce = -1n; }],
  ] as const)('returns rpc-error, never confirmed, for %s', async (_name, arrange) => {
    const c = chain();
    arrange(c);
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'rpc-error' });
  });

  it('refuses an RPC for another chain', async () => {
    const c = chain(1);
    c.txs.set(H, tx(H));
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'rpc-error' });
  });

  it('says the nonce was consumed when the transaction is gone and the account moved past it', async () => {
    const c = chain();
    c.latestNonce = 8n;
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7 }))).resolves.toEqual({ state: 'nonce-consumed', nonce: 7, accountNonce: 8n });
    c.latestNonce = 7n;
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7 }))).resolves.toEqual({ state: 'not-found', reorged: false });
    // Still visible but unminable: another transaction already used its nonce.
    c.txs.set(H, tx(H));
    c.latestNonce = 8n;
    await expect(resolveAttempt(c.rpc, attempt())).resolves.toEqual({ state: 'nonce-consumed', nonce: 7, accountNonce: 8n });
  });

  it('follows a linked speed-up (same call) and a cancel (different call) to their own outcome', async () => {
    const c = chain();
    c.latestNonce = 8n;
    c.txs.set(R1, tx(R1, { input: DATA }));
    mined(c, R1, 95n);
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7, replacements: [R1] }))).resolves.toEqual({
      state: 'replaced', hash: R1, kind: 'same-call', outcome: { state: 'confirmed', blockNumber: 95n, blockHash: blockHash(95n), confirmations: 6n },
    });
    c.txs.set(R1, tx(R1, { to: ACCOUNT, input: '0x', value: '0x0' }));
    mined(c, R1, 95n);
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7, replacements: [R1] }))).resolves.toMatchObject({ state: 'replaced', hash: R1, kind: 'different-call', outcome: { state: 'confirmed' } });
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7, replacements: [R1], txDigest: undefined }))).resolves.toMatchObject({ kind: 'unknown-call' });
    c.receipts.delete(R1);
    c.txs.set(R1, tx(R1, { to: ACCOUNT, input: '0x', value: '0x0' }));
    c.latestNonce = 7n;
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7, replacements: [R2, R1] }))).resolves.toEqual({ state: 'replaced', hash: R1, kind: 'different-call', outcome: { state: 'pending' } });
  });

  it('reports a mined linked replacement whose receipt is withheld as an unusable answer, not a consumed nonce', async () => {
    const record = attempt({ nonce: 7, replacements: [R1] });
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([record]));
    const journal = window.localStorage.getItem(ATTEMPT_JOURNAL_KEY);
    const c = chain();
    c.latestNonce = 8n;
    c.txs.set(R1, tx(R1, { blockNumber: '0x5a', blockHash: blockHash(90n) }));
    await expect(resolveAttempt(c.rpc, record)).resolves.toEqual({ state: 'rpc-error' });
    // A later pending replacement does not hide the inconsistent one.
    c.txs.set(R2, tx(R2));
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7, replacements: [R1, R2] }))).resolves.toEqual({ state: 'rpc-error' });
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(journal);

    // Controls: with its receipt it is followed; a reorged or unknown replacement still leaves the nonce consumed.
    mined(c, R1, 90n);
    await expect(resolveAttempt(c.rpc, record)).resolves.toMatchObject({ state: 'replaced', hash: R1, outcome: { state: 'confirmed' } });
    c.receipts.set(R1, receipt(R1, 90n, { status: '0x0' }));
    await expect(resolveAttempt(c.rpc, record)).resolves.toMatchObject({ state: 'replaced', hash: R1, outcome: { state: 'reverted' } });
    c.canonical.set(90n, blockHash(91n));
    await expect(resolveAttempt(c.rpc, record)).resolves.toEqual({ state: 'nonce-consumed', nonce: 7, accountNonce: 8n });
    c.txs.delete(R1);
    c.receipts.delete(R1);
    await expect(resolveAttempt(c.rpc, record)).resolves.toEqual({ state: 'nonce-consumed', nonce: 7, accountNonce: 8n });
  });

  it.each([
    ['gone', (_c: Chain) => {}],
    ['still visible but unmined', (c: Chain) => { c.txs.set(H, tx(H)); }],
  ] as const)('reports a canonical replacement receipt without its transaction as an unusable answer (original %s)', async (_name, arrange) => {
    const record = attempt({ nonce: 7, replacements: [R1] });
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([record]));
    const journal = window.localStorage.getItem(ATTEMPT_JOURNAL_KEY);
    const c = chain();
    arrange(c);
    c.latestNonce = 8n;
    // The RPC returns a canonical receipt for the linked hash but not the transaction to compare with the request.
    mined(c, R1, 90n);
    await expect(resolveAttempt(c.rpc, record)).resolves.toEqual({ state: 'rpc-error' });
    // A pending replacement checked first does not hide the inconsistent one.
    c.txs.set(R2, tx(R2));
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7, replacements: [R2, R1] }))).resolves.toEqual({ state: 'rpc-error' });
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(journal);

    // Controls: a reorged receipt, or neither transaction nor receipt, leaves the account nonce as the evidence.
    const consumed = { state: 'nonce-consumed', nonce: 7, accountNonce: 8n };
    c.canonical.set(90n, blockHash(91n));
    await expect(resolveAttempt(c.rpc, record)).resolves.toEqual(consumed);
    c.receipts.delete(R1);
    await expect(resolveAttempt(c.rpc, record)).resolves.toEqual(consumed);
    expect(window.localStorage.getItem(ATTEMPT_JOURNAL_KEY)).toBe(journal);
  });

  it('alarms when a linked replacement no longer matches the sender or nonce', async () => {
    const c = chain();
    c.txs.set(R1, tx(R1, { from: OTHER }));
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7, replacements: [R1] }))).resolves.toEqual({ state: 'mismatch', field: 'replacement' });
    c.txs.set(R1, tx(R1, { nonce: '0x8' }));
    await expect(resolveAttempt(c.rpc, attempt({ nonce: 7, replacements: [R1] }))).resolves.toEqual({ state: 'mismatch', field: 'replacement' });
  });

  it('records the observed nonce in the journal once the transaction matches', async () => {
    const record = attempt();
    const other = attempt({ id: '00000000-0000-4000-8000-000000000002', key: hashOf(9), txDigest: undefined });
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([record, other]));
    const c = chain();
    c.txs.set(H, tx(H, { from: OTHER }));
    await resolveAttempt(c.rpc, record);
    expect(readAttempts()[0]?.nonce).toBeUndefined();
    c.txs.set(H, tx(H));
    await resolveAttempt(c.rpc, record);
    expect(readAttempts()[0]?.nonce).toBe(7);
    expect(readAttempts()[1]?.nonce).toBeUndefined();
  });
});

describe('linkReplacement', () => {
  function stored(over: Over = {}): WalletAttempt {
    const record = attempt(over);
    window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, JSON.stringify([record]));
    return record;
  }

  it('links a verified speed-up or cancel and saves the nonce read from the original', async () => {
    const record = stored();
    const c = chain();
    c.txs.set(H, tx(H));
    c.txs.set(R1, tx(R1));
    c.txs.set(R2, tx(R2, { to: ACCOUNT, input: '0x', value: '0x0' }));
    await expect(linkReplacement(record.id, ` ${R1.toUpperCase().replace('0X', '0x')} `, c.rpc)).resolves.toMatchObject({ nonce: 7, replacements: [R1] });
    await linkReplacement(record.id, R2, c.rpc);
    await linkReplacement(record.id, R2, c.rpc);
    expect(readAttempts()[0]).toMatchObject({ hash: H, nonce: 7, replacements: [R1, R2] });
  });

  it('uses the recorded nonce when the original is no longer visible', async () => {
    const record = stored({ nonce: 7 });
    const c = chain();
    c.txs.set(R1, tx(R1, { to: ACCOUNT, input: '0x', value: '0x0' }));
    await linkReplacement(record.id, R1, c.rpc);
    expect(readAttempts()[0]?.replacements).toEqual([R1]);
  });

  it.each([
    ['another sender', /same account, with the same nonce/, (c: Chain) => { c.txs.set(R1, tx(R1, { from: OTHER })); }],
    ['another nonce', /same account, with the same nonce/, (c: Chain) => { c.txs.set(R1, tx(R1, { nonce: '0x8' })); }],
    ['another chain', /same account, with the same nonce/, (c: Chain) => { c.txs.set(R1, tx(R1, { chainId: '0x1' })); }],
    ['an unknown replacement', /could not be checked/, () => undefined],
    ['a throwing RPC', /could not be checked/, (c: Chain) => { c.txs.set(R1, tx(R1)); c.fail = 'eth_getTransactionByHash'; }],
    ['a malformed RPC answer', /could not be checked/, (c: Chain) => { c.txs.set(R1, 'x'); }],
  ] as const)('refuses %s and stores nothing', async (_name, message, arrange) => {
    const record = stored();
    const c = chain();
    c.txs.set(H, tx(H));
    arrange(c);
    await expect(linkReplacement(record.id, R1, c.rpc)).rejects.toThrow(message);
    expect(readAttempts()).toEqual([record]);
  });

  it('refuses an unverifiable original, a mismatched original, bad input, an unknown record and the bound', async () => {
    const c = chain();
    c.txs.set(R1, tx(R1));
    let record = stored();
    await expect(linkReplacement(record.id, R1, c.rpc)).rejects.toThrow(/could not be checked/);
    c.txs.set(H, tx(H, { input: '0xffff' }));
    await expect(linkReplacement(record.id, R1, c.rpc)).rejects.toThrow(/same account, with the same nonce/);
    await expect(linkReplacement(record.id, 'not-a-hash', c.rpc)).rejects.toThrow(/64 hexadecimal/);
    await expect(linkReplacement(record.id, H, c.rpc)).rejects.toThrow(/same account, with the same nonce/);
    await expect(linkReplacement(record.id, R1, chain(1).rpc)).rejects.toThrow(/same account, with the same nonce/);
    await expect(linkReplacement('00000000-0000-4000-8000-00000000ffff', R1, c.rpc)).rejects.toThrow(/cleared or changed/);
    record = stored({ status: 'unknown', hash: undefined });
    await expect(linkReplacement(record.id, R1, c.rpc)).rejects.toThrow(/cleared or changed/);
    const full = Array.from({ length: 8 }, (_, i) => hashOf(100 + i));
    record = stored({ nonce: 7, replacements: full });
    await expect(linkReplacement(record.id, R1, c.rpc)).rejects.toThrow(/maximum number/);
    expect(readAttempts()).toEqual([record]);
  });
});
