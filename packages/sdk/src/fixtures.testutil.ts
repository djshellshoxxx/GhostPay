import { signerPublicKeyHex, type NewInvoice, type RandomSource } from '@ghostpay/invoice-schema';

export const NOW = 1_800_000_000;

export function key(n: number): Uint8Array {
  const k = new Uint8Array(32);
  k[31] = n;
  return k;
}

/** Deterministic non-crypto test RNG (counter bytes). */
export function testRng(): RandomSource {
  let c = 1;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const v = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < v.length; i++) v[i] = (c++ * 37 + i) & 0xff;
      return array;
    },
  };
}

export const SIGNING_KEY = key(7);
export const SIGNER = signerPublicKeyHex(SIGNING_KEY);
export const META = `st:eth:0x${signerPublicKeyHex(key(3))}${signerPublicKeyHex(key(4))}`;

export function input(over: Partial<NewInvoice> = {}): NewInvoice {
  return {
    chainId: 8453,
    metaAddress: META,
    fiat: { currency: 'USD', minorUnits: '12345' },
    token: 'native',
    amountPolicy: { mode: 'fiat_quote' },
    quote: { source: 'chainlink:eth-usd', timestamp: NOW, expiresAt: NOW + 600, maxSlippageBps: 50 },
    expiresAt: NOW + 3600,
    lineItems: [{ description: 'Consulting, 2 hours', quantity: '2', unitMinorUnits: '5000' }],
    tax: { rateBps: 500, minorUnits: '345' },
    feePolicy: 'seller_pays',
    memo: 'Ref #42',
    signer: SIGNER,
    ...over,
  };
}
