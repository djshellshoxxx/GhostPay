import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assessAccount,
  choosePath,
  classifyAccount,
  evaluateWait,
  isContractAccount,
  isVerifiable,
  lookupProfile,
  parsePendingRef,
  pollPolicy,
  validateMatrix,
  type WalletProfile,
} from './compat.js';

const row = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'safe',
  rdns: 'Example.Safe',
  name: 'Example Safe',
  kind: 'contract',
  eip1271: true,
  eip4337: false,
  eip5792: true,
  typedDataV4: true,
  asyncConfirmation: true,
  ...o,
});
const eoaRow = row({
  id: 'plain',
  rdns: 'example.plain',
  name: 'Plain',
  kind: 'eoa',
  eip1271: false,
  eip5792: false,
  asyncConfirmation: false,
});
const matrix = (): readonly WalletProfile[] => {
  const m = validateMatrix([
    row(),
    eoaRow,
    row({ id: 'nots', rdns: 'example.nots', kind: 'eoa', typedDataV4: 'unknown' }),
  ]);
  if (!m.ok) throw new Error(m.error);
  return m.value;
};

describe('classifyAccount', () => {
  it('SMART-4 / T-1', () => {
    expect(isContractAccount('0x')).toBe(false);
    expect(isContractAccount('0x0')).toBe(false);
    expect(isContractAccount('0x6080604052')).toBe(true);
    expect(isContractAccount('0x00')).toBe(true); // real (STOP) contract code
    expect(classifyAccount('0x' + 'ef0100' + 'ab'.repeat(20))).toBe('delegated-eoa');
    expect(isContractAccount('0x' + 'ef0100' + 'ab'.repeat(20))).toBe(false);
  });
  it('malformed is invalid, never EOA', () => {
    for (const x of ['', '6080', '0x608', '0xzz', null, undefined, 5, '0x60 80'])
      expect(classifyAccount(x)).toBe('invalid');
  });
  it('property: any non-trivial even hex is contract', () => {
    fc.assert(
      fc.property(
        fc
          .uint8Array({ minLength: 1, maxLength: 20 })
          .map((b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''))
          .filter((h) => (!h.startsWith('ef0100') && !/^0*$/.test(h)) || h === '00'),
        (h) => classifyAccount('0x' + h) === 'contract',
      ),
    );
  });
});

describe('choosePath / pollPolicy', () => {
  it('T-2 and SMART-1', () => {
    expect(choosePath({ isContract: true, tokenPermit: true })).toBe('approve');
    expect(choosePath({ isContract: false, tokenPermit: true })).toBe('permit');
    expect(choosePath({ isContract: false, tokenPermit: false })).toBe('approve');
    expect(choosePath({ isContract: true, tokenPermit: false, native: true })).toBe('direct');
  });
  it('property: contract never permit', () => {
    fc.assert(
      fc.property(fc.boolean(), (p) => choosePath({ isContract: true, tokenPermit: p }) !== 'permit'),
    );
  });
  it('T-3 and EOA finite', () => {
    expect(pollPolicy(true).timeoutMs).toBeNull();
    expect(pollPolicy(true).cancellable).toBe(true);
    expect(pollPolicy(false)).toMatchObject({ timeoutMs: 180_000, label: 'confirming' });
    expect(pollPolicy(false, 5000).timeoutMs).toBe(5000);
    expect(() => pollPolicy(false, 0)).toThrow(RangeError);
    expect(() => pollPolicy(false, 1.5)).toThrow(RangeError);
  });
});

describe('evaluateWait', () => {
  const c = pollPolicy(true);
  const e = pollPolicy(false, 1000);
  it('contract waits for days', () => {
    expect(evaluateWait(c, 3 * 24 * 3600 * 1000, { receipt: 'none' })).toBe('awaiting-signers');
  });
  it('eoa times out', () => {
    expect(evaluateWait(e, 999, { receipt: 'none' })).toBe('waiting');
    expect(evaluateWait(e, 1000, { receipt: 'none' })).toBe('timed-out');
  });
  it('precedence', () => {
    expect(evaluateWait(e, 5000, { receipt: 'success' })).toBe('confirmed');
    expect(evaluateWait(e, 0, { receipt: 'reverted' })).toBe('reverted');
    expect(evaluateWait(c, 0, { receipt: 'none', dropped: true, userStopped: true })).toBe('dropped');
    expect(evaluateWait(c, 0, { receipt: 'none', userStopped: true })).toBe('stopped');
  });
});

describe('pending refs', () => {
  it('only txHash is verifiable', () => {
    const h = '0x' + 'AB'.repeat(32);
    const a = parsePendingRef('safeTxHash', h);
    expect(a.ok && isVerifiable(a.value)).toBe(false);
    const b = parsePendingRef('txHash', h);
    expect(b.ok && isVerifiable(b.value) && b.value.hash).toBe('0x' + 'ab'.repeat(32));
    expect(parsePendingRef('txHash', '0x12').ok).toBe(false);
  });
});

describe('validateMatrix', () => {
  it('accepts and lowercases rdns', () => {
    expect(matrix()[0]?.rdns).toBe('example.safe');
    expect(lookupProfile(matrix(), 'EXAMPLE.SAFE')?.id).toBe('safe');
    expect(lookupProfile(matrix(), 'example')).toBeUndefined();
    expect(lookupProfile(matrix(), undefined)).toBeUndefined();
  });
  it('accepts profile without rdns', () => {
    expect(validateMatrix([row({ rdns: undefined })]).ok).toBe(true);
  });
  it.each([
    ['not array', {}],
    ['row not object', [1]],
    ['bad id', [row({ id: 'Bad Id' })]],
    ['dup id', [row(), row({ rdns: 'other.example' })]],
    ['dup rdns', [row(), row({ id: 'b' })]],
    ['bad name', [row({ name: '' })]],
    ['bad kind', [row({ kind: 'x' })]],
    ['bad rdns', [row({ rdns: 'a b' })]],
    ['bad flag', [row({ eip1271: 'yes' })]],
  ])('rejects %s', (_n, v) => {
    expect(validateMatrix(v).ok).toBe(false);
  });
});

describe('assessAccount', () => {
  const code = '0x6080';
  it('safe: approve, no timeout, can batch', () => {
    const r = assessAccount({ code, rdns: 'example.safe', matrix: matrix(), token: { permit: true } });
    expect(r.path).toBe('approve');
    expect(r.poll.timeoutMs).toBeNull();
    expect(r.canBatch).toBe(true);
    expect(r.warnings).toContain('two-transactions');
  });
  it('eoa with typed data: permit', () => {
    const r = assessAccount({ code: '0x', rdns: 'example.plain', matrix: matrix(), token: { permit: true } });
    expect(r.path).toBe('permit');
    expect(r.canBatch).toBe(false);
    expect(r.warnings).toEqual([]);
  });
  it('eoa without confirmed typed-data support falls back to approve', () => {
    const r = assessAccount({ code: '0x', rdns: 'example.nots', matrix: matrix(), token: { permit: true } });
    expect(r.path).toBe('approve');
    expect(r.warnings).toContain('no-typed-data');
  });
  it('unknown wallet + EOA code trusts chain', () => {
    const r = assessAccount({ code: '0x', matrix: matrix(), token: { permit: true } });
    expect(r.path).toBe('permit');
    expect(r.warnings).toContain('unknown-wallet');
  });
  it('profile/code mismatch is flagged and chain wins', () => {
    const r = assessAccount({ code: '0x', rdns: 'example.safe', matrix: matrix(), token: { permit: true } });
    expect(r.warnings).toContain('profile-kind-mismatch');
    expect(r.accountKind).toBe('eoa');
  });
  it('invalid code is safe path with no timeout', () => {
    const r = assessAccount({ code: 'garbage', matrix: matrix(), token: { permit: true } });
    expect(r.path).toBe('approve');
    expect(r.poll.timeoutMs).toBeNull();
    expect(r.warnings).toContain('invalid-code');
  });
  it('delegated EOA flagged; native is direct', () => {
    const r = assessAccount({
      code: '0xef0100' + 'ab'.repeat(20),
      matrix: matrix(),
      token: { permit: false, native: true },
    });
    expect(r.warnings).toContain('delegated-account');
    expect(r.path).toBe('direct');
  });
});
