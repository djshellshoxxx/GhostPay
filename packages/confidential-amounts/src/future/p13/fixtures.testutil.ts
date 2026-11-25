/** Deterministic synthetic P13 fixtures. Addresses are made up; nothing here refers to a deployed contract. */
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
