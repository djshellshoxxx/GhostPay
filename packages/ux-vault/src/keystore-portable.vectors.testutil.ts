import { readFileSync } from 'node:fs';

// The canonical TEST-ONLY v1 seller keystore vector (test-vectors/seller-keystore-v1.json, written independently with
// node:crypto and noble by test-vectors/generate-seller-keystore.mjs; spec 18b). Its spending and viewing keys are the
// public keys of test-vectors/scheme1.json vector scheme1-001. Shared by the known-answer and fuzz tests; never imported
// by production code.
interface SellerKeystoreVectors {
  readonly passphrase: string;
  readonly seller: { readonly spendingPrivateKey: string; readonly viewingPrivateKey: string; readonly signingPrivateKey: string };
  readonly files: { readonly valid: { readonly text: string } };
}
const V = JSON.parse(readFileSync(new URL('../../../test-vectors/seller-keystore-v1.json', import.meta.url), 'utf8')) as SellerKeystoreVectors;
const bare = (key: string): string => key.replace(/^0x/, '').toLowerCase();

export const SCHEME1_001 = {
  spending: bare(V.seller.spendingPrivateKey),
  viewing: bare(V.seller.viewingPrivateKey),
  signing: bare(V.seller.signingPrivateKey),
} as const;
export const KEYSTORE_V1_PASSPHRASE = V.passphrase;
export const KEYSTORE_V1 = V.files.valid.text;
