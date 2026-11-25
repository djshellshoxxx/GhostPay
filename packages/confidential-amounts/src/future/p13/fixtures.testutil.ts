/** Deterministic synthetic P13 fixtures. Addresses are made up; nothing here refers to a deployed contract. */
import { createInvoice, type Invoice, type NewInvoice } from '@ghostpay/invoice-schema';
import type { ConfidentialAssetV1 } from './asset.js';
import { PINNED_MANIFEST_DIGESTS, REQUIRED_TRUST_IDS } from './asset.js';

/** CT-M (cleartext) asset on the local chain: 18-decimal underlying, 6-decimal confidential token. */
export const CTM_ASSET: ConfidentialAssetV1 = Object.freeze({
  schema: 'ghostpay.confidential-asset/v1',
  asset: { schema: 'ghostpay.asset-ref/v1', network: 'eip155:31337', asset: `0x${'c1'.repeat(20)}`, decimals: 6 },
  underlying: { schema: 'ghostpay.asset-ref/v1', network: 'eip155:31337', asset: `0x${'e2'.repeat(20)}`, decimals: 18 },
  rate: '1000000000000',
  protocolId: 'ctm-cleartext',
  manifestDigest: PINNED_MANIFEST_DIGESTS['ctm-cleartext'],
  confidentiality: 'none',
  trustStatementIds: [...REQUIRED_TRUST_IDS['ctm-cleartext']],
}) as ConfidentialAssetV1;

/** CT-1 asset on Sepolia: 6-decimal underlying (rate 1). */
export const CT1_ASSET: ConfidentialAssetV1 = Object.freeze({
  schema: 'ghostpay.confidential-asset/v1',
  asset: { schema: 'ghostpay.asset-ref/v1', network: 'eip155:11155111', asset: `0x${'a7'.repeat(20)}`, decimals: 6 },
  underlying: { schema: 'ghostpay.asset-ref/v1', network: 'eip155:11155111', asset: `0x${'b8'.repeat(20)}`, decimals: 6 },
  rate: '1',
  protocolId: 'ct1-zama',
  manifestDigest: PINNED_MANIFEST_DIGESTS['ct1-zama'],
  confidentiality: 'fhe',
  trustStatementIds: [...REQUIRED_TRUST_IDS['ct1-zama']],
}) as ConfidentialAssetV1;

/** Deep, mutable copy for negative tests. */
export function mutable<T>(v: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
}

/** Deterministic byte source (xorshift32); test use only, never for keys outside tests. */
export function seededBytes(seed: number): (n: number) => Uint8Array {
  let x = seed >>> 0 || 1;
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      out[i] = x & 0xff;
    }
    return out;
  };
}

/** Compressed secp256k1 points 3G, 4G (meta-address) and 7G (invoice signer); public test constants. */
export const META = 'st:eth:0x02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f902e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13';
export const SIGNER = '025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc';
/** Fixed clock: 2027-01-15T08:00:00Z. */
export const NOW = 1_800_000_000;

/** Ordinary (unchanged schema) invoice input for the CT-M fixture asset's underlying token. */
export function invoiceInput(overrides: Partial<NewInvoice> = {}): NewInvoice {
  return {
    chainId: 31337,
    metaAddress: META,
    fiat: { currency: 'USD', minorUnits: '1500' },
    token: CTM_ASSET.underlying.asset,
    amountPolicy: { mode: 'fixed_token', tokenAmount: '15000000000000000000' },
    quote: { source: 'fixed:test', timestamp: NOW, expiresAt: NOW + 600, maxSlippageBps: 0 },
    expiresAt: NOW + 3600,
    lineItems: [{ description: 'Test item', quantity: '1', unitMinorUnits: '1500' }],
    tax: { rateBps: 0, minorUnits: '0' },
    feePolicy: 'seller_pays',
    signer: SIGNER,
    ...overrides,
  };
}

/** Deterministic invoice (nonce from {@link seededBytes}). */
export function sampleInvoice(overrides: Partial<NewInvoice> = {}, seed = 7): Invoice {
  const bytes = seededBytes(seed);
  return createInvoice(invoiceInput(overrides), {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array !== null) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes(array.byteLength));
      return array;
    },
  });
}
