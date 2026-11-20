import { describe, expect, it } from 'vitest';
import {
  buildBitcoinUri,
  buildSolanaPay,
  buildTronUri,
  MAX_URI_LENGTH,
  parseBitcoinUri,
  parseSolanaPay,
  parseTronUri,
  PaymentUriError,
  pctEncode,
} from './index.js';
import * as F from './fixtures.testutil.js';

const label = 'é'.repeat(64); // 128 UTF-8 bytes, the accepted label limit.

function expectTooLong(fn: () => unknown): void {
  try {
    fn();
    expect.fail('Expected a typed TOO_LONG rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentUriError);
    expect((error as PaymentUriError).code).toBe('TOO_LONG');
  }
}

/**
 * Derive a message that makes an independently constructed URI exactly the parser's
 * 2048-character wire limit. A trailing ASCII suffix allows -1/+1 boundary cases
 * without violating the decoded message's 512-byte cap.
 */
function boundaryMessage(prefix: string): string {
  const remainder = MAX_URI_LENGTH - prefix.length;
  for (let multi = 0; multi <= 256; multi++) {
    const ascii = remainder - 6 * multi; // each NFC é becomes %C3%A9
    if (ascii >= 2 && 2 * multi + ascii <= 510) {
      const message = 'é'.repeat(multi) + 'a'.repeat(ascii);
      expect(prefix + pctEncode(message)).toHaveLength(MAX_URI_LENGTH);
      return message;
    }
  }
  throw new Error('Boundary fixture no longer fits the permitted text budget');
}

describe('builder/parser aggregate encoded URI boundary (QA-02)', () => {
  it('Bitcoin rejects otherwise-valid combined label, silent payment and message fields', () => {
    const base = {
      address: F.BTC_BECH32,
      silentPayment: F.spAddr('sp'),
      amountSats: 1n,
      label,
    };
    expectTooLong(() => buildBitcoinUri({ ...base, message: 'é'.repeat(256) }));
  });

  it('Solana rejects otherwise-valid token, reference, memo, label and message fields', () => {
    const base = {
      recipient: F.SOL,
      splToken: F.SOL_MINT,
      references: [F.SOL_REF],
      amount: '1',
      label,
      memo: 'é'.repeat(128),
    };
    expectTooLong(() => buildSolanaPay({ ...base, message: 'é'.repeat(256) }));
  });

  it('TRON rejects otherwise-valid token, amount, label and message fields', () => {
    const base = {
      recipient: F.TRX,
      token: F.TRX2,
      network: 'mainnet' as const,
      amount: '1000000000000000000000000000000',
      label,
    };
    expectTooLong(() => buildTronUri({ ...base, message: 'é'.repeat(256) }));
  });

  it('Bitcoin returns exact-limit and shorter wire links that its parser accepts, but rejects +1', () => {
    const base = { address: F.BTC_BECH32, silentPayment: F.spAddr('sp'), amountSats: 1n, label };
    const prefix = buildBitcoinUri(base) + '&message=';
    const message = boundaryMessage(prefix);
    const exact = buildBitcoinUri({ ...base, message });
    expect(exact).toHaveLength(MAX_URI_LENGTH);
    expect(parseBitcoinUri(exact).message).toBe(message);
    const shorter = buildBitcoinUri({ ...base, message: message.slice(0, -1) });
    expect(shorter).toHaveLength(MAX_URI_LENGTH - 1);
    expect(parseBitcoinUri(shorter).message).toBe(message.slice(0, -1));
    expectTooLong(() => buildBitcoinUri({ ...base, message: message + 'a' }));
  });

  it('Solana returns exact-limit and shorter wire links that its parser accepts, but rejects +1', () => {
    const base = {
      recipient: F.SOL,
      splToken: F.SOL_MINT,
      references: [F.SOL_REF],
      amount: '1',
      label,
      memo: 'é'.repeat(128),
    };
    const prefix = buildSolanaPay(base) + '&message=';
    const message = boundaryMessage(prefix);
    const exact = buildSolanaPay({ ...base, message });
    expect(exact).toHaveLength(MAX_URI_LENGTH);
    expect(parseSolanaPay(exact).message).toBe(message);
    expect(parseSolanaPay(exact).references).toEqual([F.SOL_REF]);
    const shorter = buildSolanaPay({ ...base, message: message.slice(0, -1) });
    expect(shorter).toHaveLength(MAX_URI_LENGTH - 1);
    expect(parseSolanaPay(shorter).message).toBe(message.slice(0, -1));
    expectTooLong(() => buildSolanaPay({ ...base, message: message + 'a' }));
  });

  it('TRON returns exact-limit and shorter wire links that its parser accepts, but rejects +1', () => {
    const base = {
      recipient: F.TRX,
      token: F.TRX2,
      network: 'mainnet' as const,
      amount: '1000000000000000000000000000000',
      label,
    };
    const prefix = buildTronUri(base) + '&message=';
    const message = boundaryMessage(prefix);
    const exact = buildTronUri({ ...base, message });
    expect(exact).toHaveLength(MAX_URI_LENGTH);
    expect(parseTronUri(exact).message).toBe(message);
    expect(parseTronUri(exact).token?.canonical).toBe(F.TRX2);
    const shorter = buildTronUri({ ...base, message: message.slice(0, -1) });
    expect(shorter).toHaveLength(MAX_URI_LENGTH - 1);
    expect(parseTronUri(shorter).message).toBe(message.slice(0, -1));
    expectTooLong(() => buildTronUri({ ...base, message: message + 'a' }));
  });

  it('ordinary ASCII text retains all semantic values after building and parsing', () => {
    expect(parseBitcoinUri(buildBitcoinUri({ address: F.BTC_BECH32, label: 'Alice', message: 'Invoice 123' })).label)
      .toBe('Alice');
    expect(parseSolanaPay(buildSolanaPay({ recipient: F.SOL, label: 'Alice', message: 'Invoice 123' })).message)
      .toBe('Invoice 123');
    expect(parseTronUri(buildTronUri({ recipient: F.TRX, label: 'Alice', message: 'Invoice 123' })).message)
      .toBe('Invoice 123');
  });
});
