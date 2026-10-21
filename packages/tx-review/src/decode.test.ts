import { ghostPayRouterAbi } from '@ghostpay/chain-adapters';
import { decodeFunctionData, encodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  CHAIN, DEST, EPH, EVIL_TOKEN, NOW, RELAYER, ROUTER, STEALTH, USDC,
  approve, buildTx, buildTyped, directSweep, erc20Metadata, permitSig, relayedSweep, routerPayment,
} from './build.testutil.js';
import { decodeTx, decodeTypedData } from './decode.js';
import type { Hex, Intent, TxInput, TypedDataInput } from './types.js';

const tx = (i: Intent): TxInput => buildTx(i);

describe('decodeTx round trips', () => {
  const cases: [string, Intent][] = [
    ['payERC20', routerPayment()],
    ['payERC20WithPermit', routerPayment({ method: 'payERC20WithPermit' })],
    ['payNative', routerPayment({ token: 'native', gross: 10n ** 18n })],
    ['approve', approve()],
    ['erc20 direct sweep', directSweep()],
    ['native direct sweep', directSweep({ token: 'native', to: DEST })],
  ];
  it.each(cases)('%s', (_n, intent) => {
    expect(decodeTx(tx(intent))).toEqual(intent);
  });
  it('accepts lowercase addresses and uppercase hex digits in calldata', () => {
    const t = tx(approve());
    expect(decodeTx({ ...t, to: t.to.toLowerCase(), data: `0x${t.data.slice(2).toUpperCase()}` })).toEqual(approve());
  });
});

describe('decodeTypedData round trips', () => {
  it.each([['sweep', relayedSweep()], ['permit', permitSig()], ['permit to relayer', permitSig({ spender: RELAYER })]])('%s', (_n, i) => {
    expect(decodeTypedData(buildTyped(i))).toEqual(i);
  });
});

describe('decodeTx refusals', () => {
  const reason = (t: Partial<TxInput> & { data?: string }, base: Intent = approve()): string => {
    const r = decodeTx({ ...tx(base), ...t });
    return r.kind === 'unknown' ? r.reason : 'DECODED';
  };

  it('unknown selector (transferFrom, random)', () => {
    expect(reason({ data: `0x23b872dd${'00'.repeat(96)}` })).toBe('UNKNOWN_SELECTOR');
    expect(reason({ data: '0xdeadbeef' })).toBe('UNKNOWN_SELECTOR');
  });
  it('payERC20WithBuffer is rejected (L-04) even with well-formed calldata', () => {
    const args = [USDC, STEALTH, 10n ** 9n, 9n * 10n ** 8n, BigInt(NOW + 60), 10n ** 15n, EPH, erc20Metadata(1, USDC, 997_500_000n)];
    const data = (encodeFunctionData as (p: unknown) => Hex)({ abi: ghostPayRouterAbi, functionName: 'payERC20WithBuffer', args });
    expect(reason({ to: ROUTER, data, value: 5n })).toBe('BUFFER_PAYMENT_UNSUPPORTED');
    expect(reason({ to: ROUTER, data, value: 0n })).toBe('BUFFER_PAYMENT_UNSUPPORTED');
  });
  it('truncated calldata', () => {
    const d = tx(approve()).data;
    expect(reason({ data: d.slice(0, -2) })).toBe('MALFORMED_CALLDATA');
    expect(reason({ data: d.slice(0, 10) })).toBe('MALFORMED_CALLDATA');
    expect(reason({ data: '0xa905' })).toBe('MALFORMED_CALLDATA');
    const r = tx(routerPayment()).data;
    expect(reason({ to: ROUTER, data: r.slice(0, r.length - 64) }, routerPayment())).toBe('MALFORMED_CALLDATA');
  });
  it('trailing bytes', () => {
    expect(reason({ data: `${tx(approve()).data}00` })).toBe('TRAILING_BYTES');
    expect(reason({ data: `${tx(approve()).data}${'00'.repeat(32)}` })).toBe('TRAILING_BYTES');
    expect(reason({ data: `${tx(routerPayment()).data}ff` }, routerPayment())).toBe('TRAILING_BYTES');
  });
  it('dirty address padding is non-canonical', () => {
    const d = tx(approve()).data;
    expect(reason({ data: `${d.slice(0, 10)}ff${d.slice(12)}` })).toBe('NON_CANONICAL_CALLDATA');
  });
  it('non-hex or odd-length data', () => {
    expect(reason({ data: '0xzz' })).toBe('MALFORMED_CALLDATA');
    expect(reason({ data: '0xabc' })).toBe('MALFORMED_CALLDATA');
    expect(reason({ data: 5 as unknown as string })).toBe('MALFORMED_CALLDATA');
  });
  it('value on ERC-20 calls', () => {
    expect(reason({ value: 1n })).toBe('VALUE_UNEXPECTED');
    expect(reason({ value: 1n }, directSweep())).toBe('VALUE_UNEXPECTED');
    expect(reason({ value: 1n }, routerPayment())).toBe('VALUE_UNEXPECTED');
    expect(reason({ value: 1n }, routerPayment({ method: 'payERC20WithPermit' }))).toBe('VALUE_UNEXPECTED');
  });
  it('payNative with zero value is an invalid payment', () => {
    expect(reason({ value: 0n }, routerPayment({ token: 'native' }))).toBe('INVALID_PAYMENT');
  });
  it('router calldata that chain-adapters rejects (metadata net differs)', () => {
    const bad = routerPayment({ metadata: erc20Metadata(7, USDC, 1n) });
    expect(reason({}, bad)).toBe('INVALID_PAYMENT');
  });
  it('invalid tx fields', () => {
    expect(reason({ chainId: 0 })).toBe('INVALID_TX_FIELD');
    expect(reason({ chainId: 1.5 })).toBe('INVALID_TX_FIELD');
    expect(reason({ value: -1n })).toBe('INVALID_TX_FIELD');
    expect(reason({ to: '0x123' })).toBe('INVALID_TX_FIELD');
    expect(reason({ to: '0x0000000000000000000000000000000000000000' })).toBe('INVALID_TX_FIELD');
    expect(reason({ to: 7 as unknown as string })).toBe('INVALID_TX_FIELD');
    expect(reason({ to: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A66' })).toBe('INVALID_TX_FIELD');
  });
  it('approve/transfer with zero spender or recipient, zero transfer', () => {
    const zero = `0x095ea7b3${'00'.repeat(64)}`;
    expect(reason({ data: zero })).toBe('INVALID_TX_FIELD');
    expect(reason({ data: `0xa9059cbb${'00'.repeat(64)}` }, directSweep())).toBe('INVALID_TX_FIELD');
    const t = tx(directSweep());
    expect(reason({ data: `0xa9059cbb${DEST.slice(2).toLowerCase().padStart(64, '0')}${'00'.repeat(32)}` }, directSweep())).toBe('INVALID_TX_FIELD');
    expect(t.data.startsWith('0xa9059cbb')).toBe(true);
  });
  it('approve of zero amount still decodes (revocation)', () => {
    expect(decodeTx(tx(approve({ amount: 0n })))).toEqual(approve({ amount: 0n }));
  });
  it('direct sweep needs sender and gas fields', () => {
    const base = tx(directSweep());
    for (const k of ['from', 'maxFeePerGas', 'maxPriorityFeePerGas', 'gasLimit'] as const) {
      const t: Record<string, unknown> = { ...base };
      delete t[k];
      expect(decodeTx(t as unknown as TxInput)).toEqual({ kind: 'unknown', reason: 'MISSING_TX_FIELD' });
    }
  });
  it('direct sweep with invalid sender or gas', () => {
    const base = tx(directSweep());
    expect(decodeTx({ ...base, from: '0x12' })).toEqual({ kind: 'unknown', reason: 'INVALID_TX_FIELD' });
    expect(decodeTx({ ...base, maxFeePerGas: -1n })).toEqual({ kind: 'unknown', reason: 'INVALID_TX_FIELD' });
    expect(decodeTx({ ...base, maxPriorityFeePerGas: -1n })).toEqual({ kind: 'unknown', reason: 'INVALID_TX_FIELD' });
    expect(decodeTx({ ...base, gasLimit: 0n })).toEqual({ kind: 'unknown', reason: 'INVALID_TX_FIELD' });
  });
  it('native transfer with zero value', () => {
    expect(decodeTx({ ...tx(directSweep({ token: 'native' })), value: 0n })).toEqual({ kind: 'unknown', reason: 'INVALID_TX_FIELD' });
  });
  it('direct sweep never trusts a token field: a non-allowlisted `to` still decodes as ERC-20 (review refuses it)', () => {
    const r = decodeTx(tx(directSweep({ token: EVIL_TOKEN })));
    expect(r).toMatchObject({ kind: 'direct_sweep', token: EVIL_TOKEN });
  });
  it('decodeFunctionData sanity: router ABI knows the three reviewed methods', () => {
    const d = decodeFunctionData({ abi: ghostPayRouterAbi, data: tx(routerPayment()).data as Hex });
    expect(d.functionName).toBe('payERC20');
  });
});

describe('decodeTypedData refusals', () => {
  const sweep = (): TypedDataInput => buildTyped(relayedSweep());
  const permit = (): TypedDataInput => buildTyped(permitSig());
  const reason = (t: TypedDataInput): string => {
    const r = decodeTypedData(t);
    return r.kind === 'unknown' ? r.reason : 'DECODED';
  };
  const withMsg = (t: TypedDataInput, m: Record<string, unknown>): TypedDataInput => ({ ...t, message: { ...t.message, ...m } });
  const withDom = (t: TypedDataInput, m: Record<string, unknown>): TypedDataInput => ({ ...t, domain: { ...t.domain, ...m } });

  it('unknown primary type', () => {
    expect(reason({ ...sweep(), primaryType: 'Order' })).toBe('UNKNOWN_TYPED_DATA');
  });
  it('type definitions must be exact', () => {
    expect(reason({ ...sweep(), types: { Sweep: sweep().types['Sweep']!.slice(1) } })).toBe('INVALID_TYPED_DATA');
    expect(reason({ ...sweep(), types: { ...sweep().types, Extra: [] } })).toBe('INVALID_TYPED_DATA');
    expect(reason({ ...sweep(), types: { Other: sweep().types['Sweep']! } })).toBe('INVALID_TYPED_DATA');
    const swapped = [...permit().types['Permit']!];
    swapped[2] = { name: 'value', type: 'uint128' };
    expect(reason({ ...permit(), types: { Permit: swapped } })).toBe('INVALID_TYPED_DATA');
    const renamed = [...permit().types['Permit']!];
    renamed[1] = { name: 'operator', type: 'address' };
    expect(reason({ ...permit(), types: { Permit: renamed } })).toBe('INVALID_TYPED_DATA');
  });
  it('domain must be exact', () => {
    expect(reason(withDom(sweep(), { salt: '0x00' }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withDom(sweep(), { name: 'Other' }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withDom(sweep(), { version: '2' }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withDom(sweep(), { chainId: 0 }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withDom(sweep(), { chainId: '1' }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withDom(sweep(), { chainId: 1.5 }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withDom(sweep(), { verifyingContract: '0x12' }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withDom(permit(), { name: '' }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withDom(permit(), { version: 2 }))).toBe('INVALID_TYPED_DATA');
  });
  it('message must be exact, typed and non-zero', () => {
    expect(reason(withMsg(sweep(), { extra: 1n }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withMsg(permit(), { extra: 1n }))).toBe('INVALID_TYPED_DATA');
    for (const k of ['token', 'owner', 'destination', 'feeTo']) {
      expect(reason(withMsg(sweep(), { [k]: '0x0000000000000000000000000000000000000000' }))).toBe('INVALID_TYPED_DATA');
    }
    for (const k of ['amount', 'fee', 'deadline', 'nonce']) {
      expect(reason(withMsg(sweep(), { [k]: '5' }))).toBe('INVALID_TYPED_DATA');
      expect(reason(withMsg(sweep(), { [k]: -1n }))).toBe('INVALID_TYPED_DATA');
    }
    for (const k of ['owner', 'spender']) expect(reason(withMsg(permit(), { [k]: 'nope' }))).toBe('INVALID_TYPED_DATA');
    for (const k of ['value', 'nonce', 'deadline']) expect(reason(withMsg(permit(), { [k]: 1 }))).toBe('INVALID_TYPED_DATA');
    expect(reason(withMsg(permit(), { value: 1n << 256n }))).toBe('INVALID_TYPED_DATA');
  });
  it('uses the checksum rule for mixed-case addresses', () => {
    expect(reason(withMsg(permit(), { spender: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A66' }))).toBe('INVALID_TYPED_DATA');
    expect(decodeTypedData(withMsg(permit(), { spender: DEST.toLowerCase() }))).toMatchObject({ spender: DEST });
  });
  it('chain id is preserved from the domain', () => {
    expect(decodeTypedData(withDom(permit(), { chainId: 8453 }))).toMatchObject({ chainId: 8453 });
    expect(CHAIN).not.toBe(8453);
  });
});
