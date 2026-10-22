import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evmToTronAddress } from './address.js';
import { TronError } from './errors.js';
import {
  MAX_CALL_VALUE_SUN,
  MAX_FEE_LIMIT_SUN,
  TRC20_BALANCE_OF_SIGNATURE,
  TRC20_BALANCE_OF_SELECTOR,
  TRC20_TRANSFER_SELECTOR,
  TRC20_TRANSFER_SIGNATURE,
  UINT256_MAX,
  buildTrc20BalanceOfRequest,
  buildTrc20TransferRequest,
  decodeUint256Result,
  encodeTrc20BalanceOfArgs,
  encodeTrc20TransferArgs,
  encodeTrc20TransferCalldata,
  encodeUint256,
  selectorOf,
} from './trc20.js';

// FAKE addresses: derived from fixed byte patterns, not real accounts.
const OWNER = evmToTronAddress(`0x${'aa'.repeat(20)}`);
const TOKEN = evmToTronAddress(`0x${'bb'.repeat(20)}`);
const TO = evmToTronAddress(`0x${'cc'.repeat(20)}`);

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof TronError) return e.code;
    throw e;
  }
  return undefined;
}

describe('selectors', () => {
  it('match keccak of signatures and the well-known ERC-20 values', () => {
    expect(selectorOf(TRC20_TRANSFER_SIGNATURE)).toBe(TRC20_TRANSFER_SELECTOR);
    expect(selectorOf(TRC20_BALANCE_OF_SIGNATURE)).toBe(TRC20_BALANCE_OF_SELECTOR);
    expect(TRC20_TRANSFER_SELECTOR).toBe('a9059cbb');
  });
});

describe('transfer encoding', () => {
  it('encodes exact ABI words', () => {
    const args = encodeTrc20TransferArgs(TO, 1_000_000n);
    expect(args).toHaveLength(64);
    const hex = Buffer.from(args).toString('hex');
    expect(hex).toBe(`${'00'.repeat(12)}${'cc'.repeat(20)}${'00'.repeat(29)}0f4240`);
    expect(encodeTrc20TransferCalldata(TO, 1_000_000n)).toBe(`a9059cbb${hex}`);
  });
  it('amount bounds', () => {
    expect(code(() => encodeTrc20TransferArgs(TO, 0n))).toBe('INVALID_AMOUNT');
    expect(code(() => encodeTrc20TransferArgs(TO, -1n))).toBe('INVALID_AMOUNT');
    expect(code(() => encodeTrc20TransferArgs(TO, UINT256_MAX + 1n))).toBe('INVALID_AMOUNT');
    expect(code(() => encodeTrc20TransferArgs(TO, 5 as unknown as bigint))).toBe('INVALID_AMOUNT');
    expect(Buffer.from(encodeTrc20TransferArgs(TO, UINT256_MAX)).subarray(32).toString('hex')).toBe('ff'.repeat(32));
    expect(code(() => encodeUint256(-1n))).toBe('INVALID_AMOUNT');
    expect(encodeUint256(0n)).toEqual(new Uint8Array(32));
  });
  it('invalid recipient', () => {
    expect(code(() => encodeTrc20TransferArgs('T123', 1n))).toBeDefined();
  });
  it('property: round trip of amount and address', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: UINT256_MAX }), fc.uint8Array({ minLength: 20, maxLength: 20 }), (amt, b) => {
        const to = evmToTronAddress(`0x${Buffer.from(b).toString('hex')}`);
        const args = encodeTrc20TransferArgs(to, amt);
        expect(BigInt(`0x${Buffer.from(args.subarray(32)).toString('hex')}`)).toBe(amt);
        expect(Buffer.from(args.subarray(12, 32))).toEqual(Buffer.from(b));
        expect(decodeUint256Result(Buffer.from(args.subarray(32)).toString('hex'))).toBe(amt);
      }),
    );
  });
});

describe('request bodies', () => {
  const base = { owner: OWNER, contract: TOKEN, to: TO, amount: 42n, feeLimit: 100_000_000n };
  it('builds transfer body', () => {
    const body = buildTrc20TransferRequest(base);
    expect(body).toEqual({
      owner_address: `41${'aa'.repeat(20)}`,
      contract_address: `41${'bb'.repeat(20)}`,
      function_selector: 'transfer(address,uint256)',
      parameter: `${'00'.repeat(12)}${'cc'.repeat(20)}${'00'.repeat(31)}2a`,
      fee_limit: 100_000_000,
      call_value: 0,
      visible: false,
    });
    expect(JSON.parse(JSON.stringify(body))).toEqual(body);
  });
  it('accepts hex owner and explicit call value', () => {
    const b = buildTrc20TransferRequest({ ...base, owner: `41${'aa'.repeat(20)}`, callValue: 7n });
    expect(b.call_value).toBe(7);
    expect(b.owner_address).toBe(`41${'aa'.repeat(20)}`);
  });
  it('fee_limit bounds', () => {
    expect(buildTrc20TransferRequest({ ...base, feeLimit: 1n }).fee_limit).toBe(1);
    expect(buildTrc20TransferRequest({ ...base, feeLimit: MAX_FEE_LIMIT_SUN }).fee_limit).toBe(15_000_000_000);
    expect(code(() => buildTrc20TransferRequest({ ...base, feeLimit: 0n }))).toBe('INVALID_FEE_LIMIT');
    expect(code(() => buildTrc20TransferRequest({ ...base, feeLimit: MAX_FEE_LIMIT_SUN + 1n }))).toBe('INVALID_FEE_LIMIT');
    expect(code(() => buildTrc20TransferRequest({ ...base, feeLimit: 1 as unknown as bigint }))).toBe('INVALID_FEE_LIMIT');
  });
  it('call_value bounds', () => {
    expect(code(() => buildTrc20TransferRequest({ ...base, callValue: -1n }))).toBe('INVALID_CALL_VALUE');
    expect(code(() => buildTrc20TransferRequest({ ...base, callValue: MAX_CALL_VALUE_SUN + 1n }))).toBe('INVALID_CALL_VALUE');
    expect(code(() => buildTrc20TransferRequest({ ...base, callValue: 1 as unknown as bigint }))).toBe('INVALID_CALL_VALUE');
  });
  it('rejects bad addresses and amounts', () => {
    expect(code(() => buildTrc20TransferRequest({ ...base, owner: 'x' }))).toBeDefined();
    expect(code(() => buildTrc20TransferRequest({ ...base, contract: 'x' }))).toBeDefined();
    expect(code(() => buildTrc20TransferRequest({ ...base, to: 'x' }))).toBeDefined();
    expect(code(() => buildTrc20TransferRequest({ ...base, amount: 0n }))).toBe('INVALID_AMOUNT');
  });
  it('balanceOf', () => {
    expect(Buffer.from(encodeTrc20BalanceOfArgs(TO)).toString('hex')).toBe(`${'00'.repeat(12)}${'cc'.repeat(20)}`);
    expect(buildTrc20BalanceOfRequest(OWNER, TOKEN, TO)).toEqual({
      owner_address: `41${'aa'.repeat(20)}`,
      contract_address: `41${'bb'.repeat(20)}`,
      function_selector: 'balanceOf(address)',
      parameter: `${'00'.repeat(12)}${'cc'.repeat(20)}`,
      visible: false,
    });
  });
  it('decodeUint256Result', () => {
    expect(decodeUint256Result(`0x${'00'.repeat(31)}ff`)).toBe(255n);
    expect(decodeUint256Result('ff'.repeat(32))).toBe(UINT256_MAX);
    expect(code(() => decodeUint256Result('00'))).toBe('INVALID_ABI_DATA');
    expect(code(() => decodeUint256Result(5 as unknown as string))).toBe('INVALID_ABI_DATA');
    expect(code(() => decodeUint256Result('zz'.repeat(32)))).toBe('INVALID_ABI_DATA');
  });
});
