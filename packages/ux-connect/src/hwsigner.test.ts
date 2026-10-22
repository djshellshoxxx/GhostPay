import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  advance,
  classifyHwError,
  createSignSession,
  describeRequest,
  describeSigningRisk,
  describeTx,
  describeTypedData,
  hwError,
  parseTypedData,
  validateTxRequest,
  type DisplayWarning,
  type HwErrorCode,
  type TxSignRequest,
  type TypedDataSignRequest,
} from './hwsigner.js';
import { ADDR_A, ADDR_B, SIG, TOKEN } from './fixtures.testutil.js';

const pad = (a: string): string => '0'.repeat(24) + a.slice(2);
const u256 = (n: bigint): string => n.toString(16).padStart(64, '0');
const tx = (o: Partial<TxSignRequest> = {}): TxSignRequest => ({
  kind: 'transaction',
  chainId: 1,
  to: ADDR_A,
  value: 1_500_000_000_000_000_000n,
  data: '0x',
  nonce: 7,
  gasLimit: 21000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  ...o,
});
const typed = (o: Record<string, unknown> = {}, chainId = 1): TypedDataSignRequest => ({
  kind: 'typedData',
  chainId,
  typedData: {
    domain: {
      name: 'FakeToken',
      version: '1',
      chainId,
      verifyingContract: TOKEN.toUpperCase().replace('0X', '0x'),
    },
    primaryType: 'Permit',
    types: { Permit: [{ name: 'owner', type: 'address' }] },
    message: { owner: ADDR_A, spender: ADDR_B, value: '1000000', nonce: 0, deadline: 1900000000 },
    ...o,
  },
});

describe('validateTxRequest', () => {
  it('accepts a good tx', () => expect(validateTxRequest(tx()).ok).toBe(true));
  it.each<[string, Partial<TxSignRequest>]>([
    ['chain', { chainId: 0 }],
    ['to', { to: '0x12' }],
    ['data odd', { data: '0xabc' }],
    ['value neg', { value: -1n }],
    ['value big', { value: 1n << 256n }],
    ['nonce', { nonce: -1 }],
    ['gas zero', { gasLimit: 0n }],
    ['gas huge', { gasLimit: 1n << 64n }],
    ['fee neg', { maxFeePerGas: -1n, maxPriorityFeePerGas: -2n }],
    ['prio>max', { maxPriorityFeePerGas: 40_000_000_000n }],
    ['data huge', { data: '0x' + '00'.repeat(128 * 1024 + 1) }],
  ])('rejects bad %s', (_n, o) => expect(validateTxRequest(tx(o)).ok).toBe(false));
});

describe('describeTx', () => {
  it('plain transfer: exact lines, full address, no warnings', () => {
    const d = describeTx(tx({ to: '0x' + 'AB'.repeat(20) }));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.value.lines.find((l) => l.label === 'To')?.value).toBe('0x' + 'ab'.repeat(20));
    expect(d.value.lines.find((l) => l.label === 'Amount')?.value).toBe('1.5 ETH');
    expect(d.value.warnings).toEqual([]);
    expect(d.value.blind).toBe(false);
    expect(d.value.text).toContain('Nonce: 7');
  });
  it('decodes ERC-20 transfer', () => {
    const data = '0xa9059cbb' + pad(ADDR_B) + u256(2_500_000n);
    const d = describeTx(tx({ to: TOKEN, value: 0n, data }), {
      tokenDecimals: 6,
      tokenSymbol: 'USDC',
      nativeSymbol: 'ETH',
    });
    expect(d.ok && d.value.lines).toEqual(
      expect.arrayContaining([
        { label: 'Token recipient', value: ADDR_B },
        { label: 'Token amount', value: '2.5 USDC' },
      ]),
    );
    expect(d.ok && d.value.blind).toBe(false);
  });
  it('transfer without decimals shows base units', () => {
    const d = describeTx(tx({ value: 0n, data: '0xa9059cbb' + pad(ADDR_B) + u256(5n) }));
    expect(d.ok && d.value.lines.some((l) => l.value === '5 (base units)')).toBe(true);
  });
  it('approval limited vs unlimited', () => {
    const lim = describeTx(tx({ value: 0n, data: '0x095ea7b3' + pad(ADDR_B) + u256(10n) }));
    expect(lim.ok && lim.value.warnings).toEqual([]);
    const unl = describeTx(tx({ value: 0n, data: '0x095ea7b3' + pad(ADDR_B) + 'f'.repeat(64) }), {
      tokenDecimals: 6,
    });
    expect(unl.ok && unl.value.warnings).toEqual(['unlimited-approval']);
    expect(unl.ok && unl.value.lines.some((l) => l.label === 'Spender')).toBe(true);
  });
  it('unknown calldata is blind; value+data flagged', () => {
    const d = describeTx(tx({ data: '0xdeadbeef00' }));
    expect(d.ok && d.value.warnings).toEqual(['blind-signing', 'unknown-contract-call', 'value-with-data']);
    expect(d.ok && d.value.blind).toBe(true);
  });
  it('malformed transfer calldata (dirty address word / short) is blind, not decoded', () => {
    const dirty = describeTx(tx({ value: 0n, data: '0xa9059cbb' + 'ff'.repeat(32) + u256(1n) }));
    expect(dirty.ok && dirty.value.blind).toBe(true);
    const short = describeTx(tx({ value: 0n, data: '0xa9059cbb00' }));
    expect(short.ok && short.value.blind).toBe(true);
  });
  it('invalid tx propagates error', () => expect(describeTx(tx({ chainId: -1 })).ok).toBe(false));
  it('property: shown recipient equals encoded recipient', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 20, maxLength: 20 }),
        fc.bigInt({ min: 0n, max: (1n << 256n) - 1n }),
        (b, amt) => {
          const a = '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
          const d = describeTx(tx({ value: 0n, data: '0xa9059cbb' + pad(a) + u256(amt) }));
          expect(d.ok && d.value.lines.find((l) => l.label === 'Token recipient')?.value).toBe(a);
        },
      ),
    );
  });
});

describe('typed data', () => {
  it('permit layout and lowercase verifying contract', () => {
    const d = describeTypedData(typed());
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.value.lines).toEqual(
      expect.arrayContaining([
        { label: 'Verifying contract', value: TOKEN },
        { label: 'spender', value: ADDR_B },
        { label: 'value', value: '1000000' },
        { label: 'deadline', value: '1900000000' },
      ]),
    );
    expect(d.value.warnings).toEqual([]);
  });
  it('accepts JSON string and hex chain id', () => {
    const r: TypedDataSignRequest = {
      kind: 'typedData',
      chainId: 10,
      typedData: JSON.stringify(typed({}, 10).typedData),
    };
    expect(describeRequest(r).ok).toBe(true);
    const h = typed({ domain: { chainId: '0xa' } }, 10);
    expect(parseTypedData(h).ok).toBe(true);
  });
  it('unlimited permit flagged', () => {
    const d = describeTypedData(
      typed({ message: { owner: ADDR_A, spender: ADDR_B, value: (2n ** 256n - 1n).toString() } }),
    );
    expect(d.ok && d.value.warnings).toEqual(['unlimited-approval']);
  });
  it('nested non-permit is blind', () => {
    const d = describeTypedData(
      typed({
        primaryType: 'Order',
        types: { Order: [] },
        message: { maker: ADDR_A, legs: [1, 2], flag: true },
      }),
    );
    expect(d.ok && d.value.blind).toBe(true);
    expect(d.ok && d.value.warnings).toEqual(['nested-structure', 'blind-signing']);
  });
  it('nested inside permit warns but is not blind', () => {
    const d = describeTypedData(typed({ message: { extra: { a: 1 } } }));
    expect(d.ok && d.value.blind).toBe(false);
  });
  it('unnamed domain, no verifying contract', () => {
    const d = describeTypedData(typed({ domain: { chainId: 1 } }));
    expect(d.ok && d.value.lines).toEqual(
      expect.arrayContaining([
        { label: 'App / contract', value: '(unnamed)' },
        { label: 'Verifying contract', value: '(none)' },
      ]),
    );
  });
  it.each<[string, unknown]>([
    ['not json', '{nope'],
    ['too big', 'x'.repeat(70_000)],
    ['array', []],
    ['missing', { domain: {} }],
    ['primary missing', { domain: { chainId: 1 }, primaryType: 'Zed', types: {}, message: {} }],
    ['primary def', { domain: { chainId: 1 }, primaryType: 'A', types: { A: 1 }, message: {} }],
    ['chain mismatch', { domain: { chainId: 5 }, primaryType: 'A', types: { A: [] }, message: {} }],
    ['chain junk', { domain: { chainId: 'abc' }, primaryType: 'A', types: { A: [] }, message: {} }],
  ])('rejects %s', (_n, td) =>
    expect(parseTypedData({ kind: 'typedData', chainId: 1, typedData: td }).ok).toBe(false),
  );
  it('describeRequest dispatches', () => expect(describeRequest(tx()).ok).toBe(true));
});

describe('describeSigningRisk', () => {
  it('has a distinct message for each warning', () => {
    const all: DisplayWarning[] = [
      'blind-signing',
      'unlimited-approval',
      'contract-creation',
      'unknown-contract-call',
      'nested-structure',
      'value-with-data',
    ];
    expect(new Set(all.map(describeSigningRisk)).size).toBe(all.length);
  });
});

describe('classifyHwError', () => {
  it.each<[unknown, HwErrorCode]>([
    [{ code: 4001 }, 'user-rejected'],
    [{ code: '0x6985' }, 'user-rejected'],
    [{ message: 'User denied transaction' }, 'user-rejected'],
    [{ code: '0x5515' }, 'device-locked'],
    [{ message: 'Device is LOCKED' }, 'device-locked'],
    [{ code: '0x6a80' }, 'blind-signing-disabled'],
    [{ message: 'Enable blind signing' }, 'blind-signing-disabled'],
    [{ code: '0x6e00' }, 'app-not-open'],
    [{ code: '0x6d00' }, 'app-not-open'],
    [{ code: '0x6511' }, 'app-not-open'],
    [{ code: 4900 }, 'device-disconnected'],
    [{ message: 'no device found' }, 'device-disconnected'],
    [{ code: 4200 }, 'unsupported-method'],
    [{ code: -32601 }, 'unsupported-method'],
    [{ message: 'request timed out' }, 'timeout'],
    [{ code: 999 }, 'unknown'],
    ['weird', 'unknown'],
    [null, 'unknown'],
  ])('%j -> %s', (raw, code) => expect(classifyHwError(raw).code).toBe(code));
  it('rejection is retryable, unsupported is not; hwError looks up', () => {
    expect(classifyHwError({ code: 4001 }).retryable).toBe(true);
    expect(hwError('unsupported-method').retryable).toBe(false);
  });
});

describe('sign session', () => {
  const mk = (timeoutMs?: number) => {
    const s = createSignSession({
      id: 's1',
      request: tx(),
      nowMs: 1000,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
    if (!s.ok) throw new Error(s.error);
    return s.value;
  };
  it('builds display up front and sets deadline', () => {
    const s = mk();
    expect(s.deadlineMs).toBe(121_000);
    expect(s.display.text).toContain('To: ' + ADDR_A);
    expect(s.status).toBe('awaiting-device');
  });
  it('rejects bad inputs', () => {
    expect(createSignSession({ id: 's', request: tx(), nowMs: 0, timeoutMs: 5 }).ok).toBe(false);
    expect(createSignSession({ id: 's', request: tx(), nowMs: 0, timeoutMs: 700_000 }).ok).toBe(false);
    expect(createSignSession({ id: 'bad id!', request: tx(), nowMs: 0 }).ok).toBe(false);
    expect(createSignSession({ id: 's', request: tx(), nowMs: NaN }).ok).toBe(false);
    expect(createSignSession({ id: 's', request: tx({ chainId: 0 }), nowMs: 0 }).ok).toBe(false);
  });
  it('T-2 happy path and tick', () => {
    const s = mk();
    expect(advance(s, { type: 'tick' }, 2000)).toBe(s);
    const done = advance(
      s,
      { type: 'signature', signature: SIG, from: ADDR_A.toUpperCase().replace('0X', '0x') },
      5000,
      ADDR_A,
    );
    expect(done).toMatchObject({ status: 'signed', signature: SIG });
  });
  it('cancel on device -> user-rejected message', () => {
    const f = advance(mk(), { type: 'error', raw: { code: 4001 } }, 2000);
    expect(f.status).toBe('failed');
    expect(f.error?.message).toMatch(/declined/);
  });
  it('malformed signature fails; 32-byte secret never accepted', () => {
    const f = advance(mk(), { type: 'signature', signature: '0x' + '11'.repeat(32) }, 2000);
    expect(f).toMatchObject({ status: 'failed', error: { code: 'malformed-signature' } });
    expect(f.signature).toBeUndefined();
  });
  it('wrong account fails', () => {
    const f = advance(mk(), { type: 'signature', signature: SIG, from: ADDR_B }, 2000, ADDR_A);
    expect(f.error?.code).toBe('wrong-account');
  });
  it('skips account check when none supplied', () => {
    expect(advance(mk(), { type: 'signature', signature: SIG }, 2000).status).toBe('signed');
    expect(advance(mk(), { type: 'signature', signature: SIG, from: ADDR_B }, 2000).status).toBe('signed');
  });
  it('expiry on tick; late signature discarded', () => {
    const s = mk(10_000);
    const e = advance(s, { type: 'tick' }, 11_000);
    expect(e).toMatchObject({ status: 'expired', error: { code: 'timeout' } });
    const late = advance(s, { type: 'signature', signature: SIG }, 11_000);
    expect(late).toMatchObject({ status: 'expired', lateSignatureDiscarded: true });
    expect(late.signature).toBeUndefined();
    const later = advance(e, { type: 'signature', signature: SIG }, 12_000);
    expect(later).toMatchObject({ status: 'expired', lateSignatureDiscarded: true });
    expect(advance(later, { type: 'signature', signature: SIG }, 13_000)).toBe(later);
  });
  it('terminal states are sticky', () => {
    const done = advance(mk(), { type: 'signature', signature: SIG }, 2000);
    expect(advance(done, { type: 'error', raw: {} }, 3000)).toBe(done);
    expect(advance(done, { type: 'signature', signature: SIG }, 3000)).toBe(done);
    const failed = advance(mk(), { type: 'error', raw: {} }, 2000);
    expect(advance(failed, { type: 'tick' }, 3000)).toBe(failed);
    expect(advance(failed, { type: 'signature', signature: SIG }, 3000).lateSignatureDiscarded).toBe(true);
  });
});
