import { describe, expect, it } from 'vitest';
import {
  buildEip681Erc20,
  buildEip681Native,
  parseEip681,
  PaymentUriError,
} from './index.js';

const TOKEN = '0x0000000000000000000000000000000000000001';
const RECIPIENT = '0x0000000000000000000000000000000000000002';

describe('EIP-681 amount validation and serialization', () => {
  it('uses the same validated native wei amount even when a getter changes afterwards', () => {
    let reads = 0;
    const input = {
      address: RECIPIENT,
      get value(): bigint {
        reads += 1;
        return reads === 1 ? 5n : 0n;
      },
    };

    const uri = buildEip681Native(input);
    expect(uri).toBe(`ethereum:${RECIPIENT}?value=5`);
    expect(parseEip681(uri)).toMatchObject({ kind: 'native', value: 5n });
    expect(reads).toBe(1);
  });

  it('uses the same validated ERC-20 amount even when a getter changes afterwards', () => {
    let reads = 0;
    const input = {
      token: TOKEN,
      recipient: RECIPIENT,
      get amount(): bigint {
        reads += 1;
        return reads === 1 ? 7n : -1n;
      },
    };

    const uri = buildEip681Erc20(input);
    expect(uri).toBe(`ethereum:${TOKEN}/transfer?address=${RECIPIENT}&uint256=7`);
    expect(parseEip681(uri)).toMatchObject({ kind: 'erc20-transfer', amount: 7n });
    expect(reads).toBe(1);
  });

  it('preserves optional absent amounts and ordinary positive amounts', () => {
    expect(buildEip681Native({ address: RECIPIENT })).toBe(`ethereum:${RECIPIENT}`);
    expect(buildEip681Erc20({ token: TOKEN, recipient: RECIPIENT })).toBe(
      `ethereum:${TOKEN}/transfer?address=${RECIPIENT}`,
    );
    expect(parseEip681(buildEip681Native({ address: RECIPIENT, value: 1n }))).toMatchObject({
      kind: 'native',
      value: 1n,
    });
  });

  it('still rejects invalid initial bigint values with typed errors', () => {
    for (const invalid of [0n, -1n, 1n << 256n]) {
      for (const invoke of [
        () => buildEip681Native({ address: RECIPIENT, value: invalid }),
        () => buildEip681Erc20({ token: TOKEN, recipient: RECIPIENT, amount: invalid }),
      ]) {
        expect(invoke).toThrow(PaymentUriError);
        try { invoke(); } catch (error) {
          expect((error as PaymentUriError).code).toBe('INVALID_AMOUNT');
        }
      }
    }
  });
});
