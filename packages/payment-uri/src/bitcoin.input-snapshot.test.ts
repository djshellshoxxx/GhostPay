import { describe, expect, it } from 'vitest';
import { buildBitcoinUri, parseBitcoinUri, PaymentUriError } from './index.js';
import * as F from './fixtures.testutil.js';

const MAX_SATS = 2_100_000_000_000_000n;

describe('Bitcoin URI checked-input snapshots', () => {
  it('serializes the validated amount rather than a later getter result', () => {
    let reads = 0;
    const uri = buildBitcoinUri({
      address: F.BTC_BECH32,
      get amountSats() {
        reads++;
        return reads <= 4 ? 2n : MAX_SATS + 1n;
      },
    });
    expect(uri).toBe(`bitcoin:${F.BTC_BECH32}?amount=0.00000002`);
    expect(reads).toBe(1);
    expect(parseBitcoinUri(uri).amountSats).toBe(2n);
  });

  it('does not permit a previously invalid amount to become valid after another read', () => {
    let reads = 0;
    expect(() =>
      buildBitcoinUri({
        address: F.BTC_BECH32,
        get amountSats() {
          reads++;
          return reads === 1 ? MAX_SATS + 1n : 1n;
        },
      }),
    ).toThrow(PaymentUriError);
    expect(reads).toBe(1);
  });

  it('returns the expected network it actually checked', () => {
    let reads = 0;
    const parsed = parseBitcoinUri(`bitcoin:${F.BTC_BECH32}`, {
      get expectedNetwork() {
        reads++;
        return reads <= 2 ? 'main' : 'test';
      },
    });
    expect(parsed.network).toBe('main');
    expect(reads).toBe(1);
  });

  it('rejects an incompatible expected network even if later reads would change it', () => {
    let reads = 0;
    expect(() =>
      parseBitcoinUri(`bitcoin:${F.BTC_BECH32}`, {
        get expectedNetwork() {
          reads++;
          return reads === 1 ? 'test' : 'main';
        },
      }),
    ).toThrow(PaymentUriError);
    expect(reads).toBe(1);
  });

  it('retains stable amounts and normal mainnet compatibility checks', () => {
    const uri = buildBitcoinUri({ address: F.BTC_BECH32, amountSats: 150_000_000n });
    expect(uri).toBe(`bitcoin:${F.BTC_BECH32}?amount=1.5`);
    expect(parseBitcoinUri(uri, { expectedNetwork: 'main' })).toMatchObject({
      amountSats: 150_000_000n,
      network: 'main',
    });
    expect(() => parseBitcoinUri(uri, { expectedNetwork: 'test' })).toThrow(PaymentUriError);
    expect(() => buildBitcoinUri({ address: F.BTC_BECH32, amountSats: MAX_SATS + 1n })).toThrow(
      PaymentUriError,
    );
  });
});
