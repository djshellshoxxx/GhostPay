import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createReceipt, PRESETS, validatePolicy, validateRecord } from './disclose.js';
import { analyzeDisclosure } from './warnings.js';
import { parseReceipt, MAX_RECEIPT_CHARS } from './parse.js';
import { verifyReceipt, type ChainVerifier, type ChainLookupResult } from './verify.js';
import { renderJson, renderText } from './render.js';
import { sha256Hex } from './digest.js';
import { canonicalJson } from './canonical.js';
import { RECIPIENT, SENDER, TX, record } from './fixtures.testutil.js';
import type { Receipt } from './types.js';

const mk = (p: keyof typeof PRESETS, over: Record<string, unknown> = {}) =>
  createReceipt(record(over), PRESETS[p]);
const codes = (r: unknown) => {
  const p = parseReceipt(r);
  return p.ok ? [] : p.issues.map((i) => i.code);
};

describe('validateRecord', () => {
  it('accepts a good record', () => expect(validateRecord(record()).amountBase).toBe('1500000'));
  it.each([['viewingKey'], ['spendingKey'], ['stealthPrivateKey'], ['seed'], ['mnemonic'], ['secret']])(
    'FORBIDDEN_FIELD for %s',
    (k) => {
      expect(() => validateRecord(record({ [k]: 'ab'.repeat(32) }))).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN_FIELD' }),
      );
    },
  );
  it('UNKNOWN_FIELD for others, and does not echo value', () => {
    try {
      validateRecord(record({ note: 'TOPSECRETVALUE' }));
      expect.unreachable();
    } catch (e) {
      expect((e as { code: string }).code).toBe('UNKNOWN_FIELD');
      expect((e as Error).message).not.toContain('TOPSECRETVALUE');
    }
  });
  it.each([
    ['createdAt', '2026-03-04'],
    ['chain', 'base'],
    ['amountBase', '0'],
    ['amountBase', '01'],
    ['amountBase', '1.5'],
    ['txHash', '0xABC'],
    ['txHash', 'ab'.repeat(32) + '0'],
    ['sender', 'x'],
    ['recipient', 'not an address!!!!!!!!'],
    ['recipientKind', 'other'],
    ['memo', ''],
    ['memo', 'a‮b'],
    ['asset', { symbol: 'USDC' }],
    ['asset', { symbol: 'US DC', decimals: 6 }],
    ['asset', { symbol: 'USDC', decimals: 40 }],
    ['asset', { symbol: 'USDC', decimals: 6, extra: 1 }],
    ['asset', null],
  ])('rejects bad %s', (k, v) => {
    expect(() => validateRecord(record({ [k]: v }))).toThrow(
      expect.objectContaining({ code: 'INVALID_FIELD' }),
    );
  });
  it('rejects non-objects', () => {
    for (const v of [null, 3, [], 'x']) expect(() => validateRecord(v)).toThrow();
  });
  it('memo optional', () => {
    const r = { ...record() } as Record<string, unknown>;
    delete r['memo'];
    expect(validateRecord(r).memo).toBeUndefined();
  });
});

describe('validatePolicy', () => {
  it('accepts presets', () => {
    for (const p of Object.values(PRESETS)) expect(validatePolicy(p)).toEqual(p);
  });
  it.each([
    [null],
    [{ ...PRESETS.full, time: 'x' }],
    [{ ...PRESETS.full, memo: 'yes' }],
    [{ ...PRESETS.full, sender: 'partial' }],
    [{ ...PRESETS.full, recipient: { head: 'a', tail: 1 } }],
  ])('rejects %j', (p) =>
    expect(() => validatePolicy(p)).toThrow(expect.objectContaining({ code: 'INVALID_POLICY' })),
  );
});

describe('createReceipt', () => {
  it('minimal reveals only day', async () => {
    const r = await mk('minimal');
    expect(r).toMatchObject({
      v: 1,
      type: 'ghostpay.receipt',
      createdAt: '2026-03-04',
      redacted: ['chain', 'amount', 'memo', 'txHash', 'sender', 'recipient'],
    });
    for (const k of ['chain', 'asset', 'amount', 'memo', 'txHash', 'sender', 'recipient'])
      expect(r).not.toHaveProperty(k);
    const text = JSON.stringify(r);
    expect(text).not.toContain(SENDER.slice(2));
    expect(text).not.toContain(TX.slice(2));
  });
  it('standard truncates addresses, hides memo and tx', async () => {
    const r = await mk('standard');
    expect(r).toMatchObject({
      createdAt: '2026-03-04T05:06:07.089Z',
      chain: 'eip155:8453',
      amount: '1500000',
      asset: { symbol: 'USDC', decimals: 6 },
      sender: '0x1111...1111',
      recipient: '0x2222...2222',
      redacted: ['memo', 'txHash'],
    });
    expect(r).not.toHaveProperty('memo');
    expect(r).not.toHaveProperty('txHash');
  });
  it('full reveals everything but has no key fields', async () => {
    const r = await mk('full');
    expect(r).toMatchObject({
      memo: 'Lunch split',
      txHash: TX,
      sender: SENDER,
      recipient: RECIPIENT,
      redacted: [],
    });
    expect(Object.keys(r).sort()).toEqual([
      'amount',
      'asset',
      'chain',
      'createdAt',
      'digest',
      'memo',
      'recipient',
      'redacted',
      'sender',
      'txHash',
      'type',
      'v',
    ]);
  });
  it('digest equals SHA-256 of canonical body', async () => {
    const r = await mk('full');
    const { digest, ...body } = r;
    expect(digest).toEqual({ alg: 'SHA-256', hex: await sha256Hex(canonicalJson(body)) });
  });
  it('is deterministic', async () => {
    expect(await mk('standard')).toEqual(await mk('standard'));
  });
  it('time hidden; memo requested but absent => not listed', async () => {
    const rec = { ...record() } as Record<string, unknown>;
    delete rec['memo'];
    const r = await createReceipt(rec, { ...PRESETS.full, time: 'hidden' });
    expect(r.redacted).toEqual(['time']);
    expect(r).not.toHaveProperty('memo');
    expect(parseReceipt(r).ok).toBe(true);
  });
  it.each(['my viewing key is here', 'ab'.repeat(32), 'seed phrase: x'])(
    'refuses secret-like revealed memo %#',
    async (memo) => {
      await expect(createReceipt(record({ memo }), PRESETS.full)).rejects.toMatchObject({
        code: 'SECRET_LIKE_MEMO',
      });
    },
  );
  it('secret-like memo is fine when memo withheld', async () => {
    const r = await createReceipt(record({ memo: 'viewing key abc' }), PRESETS.standard);
    expect(JSON.stringify(r)).not.toContain('viewing');
  });
  it('rejects bad truncation', async () => {
    await expect(
      createReceipt(record(), { ...PRESETS.full, sender: { head: 30, tail: 30 } }),
    ).rejects.toMatchObject({
      code: 'INVALID_POLICY',
    });
  });
  it('withheld values never appear in output (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ chain: fc.boolean(), amount: fc.boolean(), memo: fc.boolean(), txHash: fc.boolean() }),
        fc.constantFrom('full' as const, 'hidden' as const, { head: 6, tail: 4 }),
        async (flags, form) => {
          const r = await createReceipt(record(), {
            ...PRESETS.full,
            ...flags,
            sender: form,
            recipient: form,
          });
          const s = JSON.stringify(r);
          return (
            (flags.memo || !s.includes('Lunch')) &&
            (flags.txHash || !s.includes(TX.slice(2))) &&
            (flags.amount || !s.includes('1500000')) &&
            (flags.chain || !s.includes('eip155')) &&
            (form !== 'hidden' || !s.includes('1111'))
          );
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('parseReceipt', () => {
  it('accepts string and object', async () => {
    const r = await mk('full');
    expect(parseReceipt(JSON.stringify(r)).ok).toBe(true);
    expect(parseReceipt(r).ok).toBe(true);
  });
  it('rejects bad json / size / non-object', () => {
    expect(codes('{nope')).toEqual(['MALFORMED']);
    expect(codes('x'.repeat(MAX_RECEIPT_CHARS + 1))).toEqual(['TOO_LARGE']);
    expect(codes('[]')).toEqual(['MALFORMED']);
    expect(codes('null')).toEqual(['MALFORMED']);
  });
  it('flags key material and unknown fields', async () => {
    const r = await mk('full');
    expect(codes({ ...r, viewingKey: 'x' })).toContain('FORBIDDEN_FIELD');
    expect(codes({ ...r, extra: 1 })).toContain('UNKNOWN_FIELD');
    expect(codes(JSON.parse('{"__proto__":{"x":1}}'))).toContain('UNKNOWN_FIELD');
  });
  it('flags structural problems', async () => {
    const r = (await mk('full')) as unknown as Record<string, unknown>;
    const bad = (o: Record<string, unknown>): boolean => !parseReceipt({ ...r, ...o }).ok;
    expect(bad({ v: 2 })).toBe(true);
    expect(bad({ type: 'x' })).toBe(true);
    expect(bad({ redacted: 'x' })).toBe(true);
    expect(bad({ redacted: ['nope'] })).toBe(true);
    expect(bad({ redacted: ['memo', 'memo'] })).toBe(true);
    expect(bad({ redacted: ['amount'] })).toBe(true);
    expect(bad({ createdAt: 'yesterday' })).toBe(true);
    expect(bad({ chain: 'x' })).toBe(true);
    expect(bad({ asset: { symbol: 'USDC', decimals: 6, z: 1 } })).toBe(true);
    expect(bad({ asset: 'USDC' })).toBe(true);
    expect(bad({ asset: { symbol: '!', decimals: 6 } })).toBe(true);
    expect(bad({ amount: '-1' })).toBe(true);
    expect(bad({ memo: 'a\nb' })).toBe(true);
    expect(bad({ txHash: 'zz' })).toBe(true);
    expect(bad({ sender: 'a...b...c' })).toBe(true);
    expect(bad({ digest: { alg: 'MD5', hex: 'ab' } })).toBe(true);
    expect(bad({ digest: { alg: 'SHA-256', hex: 'ab'.repeat(32), x: 1 } })).toBe(true);
    expect(bad({ digest: null })).toBe(true);
    const noAmount = { ...r };
    delete noAmount['amount'];
    expect(parseReceipt(noAmount).ok).toBe(false);
    const noChain = { ...r };
    delete noChain['chain'];
    expect(parseReceipt(noChain).ok).toBe(false);
  });
});

class Fake implements ChainVerifier {
  calls: { chain: string; txHash: string }[] = [];
  constructor(private readonly res: ChainLookupResult | Error) {}
  lookup(q: { chain: string; txHash: string }): Promise<ChainLookupResult> {
    this.calls.push(q);
    return this.res instanceof Error ? Promise.reject(this.res) : Promise.resolve(this.res);
  }
}
const found = (facts: object): ChainLookupResult => ({
  status: 'found',
  facts: { confirmed: true, ...facts },
});

describe('verifyReceipt', () => {
  it('self-consistent without verifier: honest verdict', async () => {
    const rep = await verifyReceipt(await mk('full'));
    expect(rep).toMatchObject({ verdict: 'self_consistent_unverified', selfConsistent: true, issues: [] });
    expect(rep.chain.status).toBe('not_checked');
    expect(rep.caveats).toEqual(['digest_not_signature', 'chain_not_checked']);
  });
  it('forged-but-consistent receipt passes self check (documented limitation)', async () => {
    const forged = await createReceipt(record({ amountBase: '999999999' }), PRESETS.full);
    expect((await verifyReceipt(forged)).verdict).toBe('self_consistent_unverified');
  });
  it('forged receipt is caught by chain facts', async () => {
    const forged = await createReceipt(record({ amountBase: '999999999' }), PRESETS.full);
    const rep = await verifyReceipt(forged, { verifier: new Fake(found({ amountBase: '1500000' })) });
    expect(rep.verdict).toBe('chain_problem');
  });
  it('detects tampering', async () => {
    const r = await mk('full');
    const rep = await verifyReceipt({ ...r, amount: '9999999' });
    expect(rep).toMatchObject({ verdict: 'invalid', selfConsistent: false });
    expect(rep.issues[0]?.path).toBe('digest');
  });
  it('detects tampering via redacted list and string input', async () => {
    const r = await mk('standard');
    expect((await verifyReceipt(JSON.stringify({ ...r, redacted: ['memo'] }))).verdict).toBe('invalid');
  });
  it('invalid shape short-circuits', async () => {
    expect(await verifyReceipt('garbage')).toMatchObject({ verdict: 'invalid', selfConsistent: false });
  });
  it('flags future date only when nowMs injected', async () => {
    const r = await mk('full');
    const t = Date.parse('2026-03-04T05:06:07.089Z');
    expect((await verifyReceipt(r, { nowMs: t - 10 * 60_000 })).verdict).toBe('invalid');
    expect((await verifyReceipt(r, { nowMs: t - 60_000 })).verdict).toBe('self_consistent_unverified');
    expect((await verifyReceipt(r, { nowMs: t - 10 * 60_000, maxSkewMs: 3_600_000 })).selfConsistent).toBe(
      true,
    );
    const day = await mk('minimal');
    expect((await verifyReceipt(day, { nowMs: Date.parse('2026-03-01T00:00:00Z') })).verdict).toBe('invalid');
  });
  it('chain confirmed on matching facts', async () => {
    const v = new Fake(
      found({ amountBase: '1500000', assetSymbol: 'USDC', sender: SENDER, recipient: RECIPIENT }),
    );
    const rep = await verifyReceipt(await mk('standard'), { verifier: v });
    expect(rep.chain.status).toBe('not_checkable');
    expect(v.calls).toEqual([]);
    const full = await verifyReceipt(await mk('full'), { verifier: v });
    expect(full.verdict).toBe('chain_confirmed');
    expect(full.chain.matched).toEqual(['amount', 'asset', 'sender', 'recipient']);
    expect(v.calls).toEqual([{ chain: 'eip155:8453', txHash: TX }]);
  });
  it('truncated addresses are compared by head/tail', async () => {
    const r = await createReceipt(record(), { ...PRESETS.full, sender: { head: 6, tail: 4 } });
    const ok = await verifyReceipt(r, { verifier: new Fake(found({ sender: SENDER })) });
    expect(ok.chain.matched).toEqual(['sender']);
    const no = await verifyReceipt(r, {
      verifier: new Fake(found({ sender: '0x1111111111111111111111111111111111112222' })),
    });
    expect(no).toMatchObject({
      verdict: 'chain_problem',
      chain: { status: 'mismatch', mismatches: ['sender'] },
    });
  });
  it('mismatch beats confirmed', async () => {
    const rep = await verifyReceipt(await mk('full'), {
      verifier: new Fake(found({ amountBase: '1', recipient: RECIPIENT })),
    });
    expect(rep).toMatchObject({
      verdict: 'chain_problem',
      chain: { status: 'mismatch', mismatches: ['amount'], matched: ['recipient'] },
    });
  });
  it('mismatched asset', async () => {
    const rep = await verifyReceipt(await mk('full'), { verifier: new Fake(found({ assetSymbol: 'DAI' })) });
    expect(rep.chain.mismatches).toEqual(['asset']);
  });
  it('unconfirmed / exists-only / not_found / unavailable / throws', async () => {
    const r = await mk('full');
    const unconf = await verifyReceipt(r, {
      verifier: new Fake({ status: 'found', facts: { confirmed: false, amountBase: '1500000' } }),
    });
    expect(unconf.chain.status).toBe('unconfirmed');
    const eo = await verifyReceipt(r, { verifier: new Fake(found({})) });
    expect(eo).toMatchObject({ verdict: 'self_consistent_unverified', chain: { status: 'tx_exists_only' } });
    expect(eo.caveats).toContain('tx_exists_but_unmatched');
    expect(await verifyReceipt(r, { verifier: new Fake({ status: 'not_found' }) })).toMatchObject({
      verdict: 'chain_problem',
      chain: { status: 'not_found' },
    });
    const un = await verifyReceipt(r, { verifier: new Fake({ status: 'unavailable' }) });
    expect(un).toMatchObject({ verdict: 'self_consistent_unverified', chain: { status: 'unavailable' } });
    expect(un.caveats).toContain('chain_unavailable');
    expect((await verifyReceipt(r, { verifier: new Fake(new Error('boom')) })).chain.status).toBe(
      'unavailable',
    );
    const weird = new Fake({ status: 'wat' } as unknown as ChainLookupResult);
    expect((await verifyReceipt(r, { verifier: weird })).chain.status).toBe('unavailable');
  });
  it('not_checkable adds caveat', async () => {
    const rep = await verifyReceipt(await mk('minimal'), { verifier: new Fake({ status: 'not_found' }) });
    expect(rep.caveats).toContain('not_chain_checkable');
  });
});

describe('render', () => {
  it('text, standard', async () => {
    const r = await mk('standard');
    expect(renderText(r)).toBe(
      [
        'GhostPay payment receipt',
        'Amount: 1.5 USDC',
        'Chain: eip155:8453',
        'Time: 2026-03-04T05:06:07.089Z',
        'From: 0x1111...1111',
        'To: 0x2222...2222',
        'Withheld: memo, txHash',
        'Digest (SHA-256): ' + r.digest.hex,
        'Unsigned: the digest only detects edits. Verify the transaction on a block explorer.',
      ].join('\n'),
    );
  });
  it('text, full with custom labels', async () => {
    const t = renderText(await mk('full'), { title: 'Recu', memo: 'Note' });
    expect(t.split('\n')[0]).toBe('Recu');
    expect(t).toContain('Note: Lunch split');
    expect(t).toContain('Transaction: ' + TX);
    expect(t).not.toContain('Withheld');
  });
  it('sanitizes hostile content in hand-built receipts', async () => {
    const r = { ...(await mk('full')), memo: 'ok‮evil\nline', sender: 'x\u0007y' } as Receipt;
    const t = renderText(r);
    expect(t.includes('\u202e') || t.includes('\u0007')).toBe(false);
    expect(t.split('\n').filter((l) => l.startsWith('Memo:')).length).toBe(1);
  });
  it('json canonical and pretty both re-verify', async () => {
    const r = await mk('full');
    const c = renderJson(r);
    expect(c).not.toContain('\n');
    expect(c).not.toContain('": ');
    expect(c.startsWith('{"amount"')).toBe(true);
    const p = renderJson(r, { pretty: true });
    expect(p).toContain('\n  ');
    for (const s of [c, p]) expect((await verifyReceipt(s)).verdict).toBe('self_consistent_unverified');
    expect(renderJson(r, { pretty: false })).toBe(c);
  });
});

describe('analyzeDisclosure', () => {
  const codesOf = (p: Parameters<typeof analyzeDisclosure>[1], over = {}) =>
    analyzeDisclosure(record(over), p).map((w) => `${w.severity}:${w.code}`);
  it('minimal', () => {
    expect(codesOf(PRESETS.minimal)).toEqual([
      'info:not_chain_checkable',
      'info:digest_not_signature',
      'info:sharing_irreversible',
    ]);
  });
  it('standard', () => {
    expect(codesOf(PRESETS.standard)).toEqual([
      'info:truncated_address_matchable',
      'info:not_chain_checkable',
      'info:digest_not_signature',
      'info:sharing_irreversible',
    ]);
  });
  it('full, stealth', () => {
    expect(codesOf(PRESETS.full)).toEqual([
      'caution:memo_free_text',
      'high:txhash_links_onchain',
      'high:sender_full_address',
      'caution:stealth_recipient_full',
      'info:exact_time_with_txhash',
      'info:digest_not_signature',
      'info:sharing_irreversible',
    ]);
  });
  it('public recipient, tx hash without chain, secret memo', () => {
    const w = codesOf(
      { ...PRESETS.full, chain: false, sender: 'hidden' },
      { recipientKind: 'public', memo: 'viewing key' },
    );
    expect(w).toContain('high:memo_secret_like');
    expect(w).toContain('high:txhash_links_onchain');
    expect(w).toContain('info:txhash_without_chain');
    expect(w).toContain('caution:recipient_full_address');
    expect(w).not.toContain('high:sender_full_address');
  });
  it('tx hash with only truncated addresses is caution', () => {
    expect(codesOf({ ...PRESETS.standard, txHash: true })).toContain('caution:txhash_links_onchain');
  });
  it('memo warning skipped when no memo', () => {
    const rec = { ...record() } as Record<string, unknown>;
    delete rec['memo'];
    expect(analyzeDisclosure(rec, PRESETS.full).map((w) => w.code)).not.toContain('memo_free_text');
  });
});
