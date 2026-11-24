import { describe, expect, it } from 'vitest';
import {
  createSignSession,
  describeTx,
  validateTxRequest,
  type TxSignRequest,
} from './hwsigner.js';

const tx = (): TxSignRequest => ({
  kind: 'transaction',
  chainId: 1,
  to: '0x' + 'ab'.repeat(20),
  value: 1n,
  data: '0x',
  nonce: 0,
  gasLimit: 21_000n,
  maxFeePerGas: 10n,
  maxPriorityFeePerGas: 1n,
});

describe('hardware signer runtime amount types (bug regression)', () => {
  const invalid: ReadonlyArray<readonly [keyof TxSignRequest, unknown]> = [
    ['value', 1.5],
    ['value', 1],
    ['value', null],
    ['value', undefined],
    ['gasLimit', 21_000],
    ['gasLimit', 1.5],
    ['gasLimit', null],
    ['maxFeePerGas', 10],
    ['maxFeePerGas', null],
    ['maxPriorityFeePerGas', 1],
    ['maxPriorityFeePerGas', null],
    ['maxPriorityFeePerGas', undefined],
  ];

  it.each(invalid)('rejects non-bigint %s (%s) before producing a signing display', (field, value) => {
    const malformed = { ...tx(), [field]: value } as TxSignRequest;
    expect(validateTxRequest(malformed).ok).toBe(false);
    expect(describeTx(malformed).ok).toBe(false);
    expect(createSignSession({ id: 'runtime-amount', request: malformed, nowMs: 1_000 }).ok).toBe(false);
  });

  it('continues to accept valid bigint amounts and gas fields, including boundaries', () => {
    const good = [
      tx(),
      { ...tx(), value: 0n, gasLimit: 1n, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n },
      {
        ...tx(),
        value: (1n << 256n) - 1n,
        gasLimit: (1n << 64n) - 1n,
        maxFeePerGas: (1n << 256n) - 1n,
        maxPriorityFeePerGas: (1n << 256n) - 1n,
      },
    ];
    for (const request of good) {
      expect(validateTxRequest(request).ok).toBe(true);
      expect(describeTx(request).ok).toBe(true);
      expect(createSignSession({ id: 'valid-bigint', request, nowMs: 1_000 }).ok).toBe(true);
    }
  });

  it('preserves existing bigint range errors', () => {
    expect(validateTxRequest({ ...tx(), value: -1n })).toEqual({ ok: false, error: 'bad value' });
    expect(validateTxRequest({ ...tx(), gasLimit: 0n })).toEqual({ ok: false, error: 'bad gasLimit' });
    expect(validateTxRequest({ ...tx(), maxFeePerGas: -1n })).toEqual({ ok: false, error: 'bad maxFeePerGas' });
    expect(validateTxRequest({ ...tx(), maxPriorityFeePerGas: 11n })).toEqual({
      ok: false,
      error: 'priority fee exceeds max fee',
    });
  });
});
