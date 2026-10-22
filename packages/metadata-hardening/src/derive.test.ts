import { describe, expect, it } from 'vitest';
import { checkAnnouncement, decodeMetaAddress, deriveStealthPayment, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { deriveChainKeys, deriveInvoiceKeyRange, deriveInvoiceKeys, publicKeyHex } from './derive.js';
import { MetadataHardeningError } from './guard.js';
import { SEED } from './testutil.testutil.js';

describe('MH-ID-1 per-invoice keys', () => {
  it('is deterministic and distinct per index', () => {
    const a = deriveInvoiceKeys(SEED, 0);
    const a2 = deriveInvoiceKeys(SEED, 0);
    const b = deriveInvoiceKeys(SEED, 1);
    expect(a.metaAddress).toBe(a2.metaAddress);
    expect(publicKeyHex(a.signer.publicKey)).toBe(publicKeyHex(a2.signer.publicKey));
    expect(a.metaAddress).not.toBe(b.metaAddress);
    expect(publicKeyHex(a.signer.publicKey)).not.toBe(publicKeyHex(b.signer.publicKey));
  });

  // Independently recomputed with raw @noble hkdf + secp256k1 (spend=block0, view=block1).
  it('pins a regression vector (HKDF stream + rejection sampler)', () => {
    expect(deriveInvoiceKeys(SEED, 0).metaAddress).toMatchInlineSnapshot(`"st:eth:0x02d5f412f6d3a9c69a86a0a1b0978cfccb0dc046988b21deae0075ca04bd3d70440335f8a036cfb5713aac932a416540ee39b469224682b58151490e91ec7db48562"`);
  });

  it('keys pass decodeMetaAddress and spend != view != signer', () => {
    const k = deriveInvoiceKeys(SEED, 7);
    const d = decodeMetaAddress(k.metaAddress);
    expect(bytesToHex(d.spendingPublicKey)).not.toBe(bytesToHex(d.viewingPublicKey));
    expect(publicKeyHex(k.signer.publicKey)).not.toBe(bytesToHex(d.spendingPublicKey));
    expect(publicKeyHex(k.signer.publicKey)).not.toBe(bytesToHex(d.viewingPublicKey));
  });

  it('scanner finds payments for all i < N (5 invoices, none shared)', () => {
    const range = deriveInvoiceKeyRange(SEED, 0, 5);
    expect(new Set(range.map((r) => r.metaAddress)).size).toBe(5);
    expect(new Set(range.map((r) => publicKeyHex(r.signer.publicKey))).size).toBe(5);
    for (const target of range) {
      const pay = deriveStealthPayment(target.metaAddress);
      const ann = {
        stealthAddress: pay.stealthAddress,
        ephemeralPublicKey: '0x' + bytesToHex(pay.ephemeralPublicKey),
        metadata: '0x' + bytesToHex(pay.metadataPrefix),
      };
      const hits = range.filter((r) => checkAnnouncement(ann, r.keys.viewingSecret, r.keys.spendingPublicKey).matches);
      expect(hits.map((h) => h.index)).toEqual([target.index]);
    }
  });

  it('different seeds give different keys', () => {
    const other = SEED.map((b) => b ^ 0xff);
    expect(deriveInvoiceKeys(other, 0).metaAddress).not.toBe(deriveInvoiceKeys(SEED, 0).metaAddress);
  });

  it('secrets stay redacted', () => {
    const k = deriveInvoiceKeys(SEED, 0);
    expect(() => JSON.stringify(k.keys.spendingSecret)).toThrow();
    expect(() => JSON.stringify(k.signer.secret)).toThrow();
    expect(unsafeRevealSecret(k.signer.secret)).toHaveLength(32);
  });

  it('rejects bad seed, index and range', () => {
    expect(() => deriveInvoiceKeys(new Uint8Array(31), 0)).toThrow(MetadataHardeningError);
    expect(() => deriveInvoiceKeys(SEED, -1)).toThrow(MetadataHardeningError);
    expect(() => deriveInvoiceKeys(SEED, 1.5)).toThrow(MetadataHardeningError);
    expect(() => deriveInvoiceKeys(SEED, 2 ** 32)).toThrow(MetadataHardeningError);
    expect(() => deriveInvoiceKeyRange(SEED, 0, 10_001)).toThrow(MetadataHardeningError);
    expect(() => deriveInvoiceKeyRange(SEED, 2 ** 32 - 1, 2)).toThrow(MetadataHardeningError);
    expect(deriveInvoiceKeyRange(SEED, 0, 0)).toEqual([]);
  });
});

describe('signer modes and linkability copy', () => {
  it('long-lived signer is shared across indices and says so', () => {
    const a = deriveInvoiceKeys(SEED, 0, { signerMode: 'long-lived' });
    const b = deriveInvoiceKeys(SEED, 1, { signerMode: 'long-lived' });
    expect(publicKeyHex(a.signer.publicKey)).toBe(publicKeyHex(b.signer.publicKey));
    expect(a.metaAddress).not.toBe(b.metaAddress);
    expect(a.linkability.join(' ')).toMatch(/share one signer/);
  });
  it('per-chain signer needs a chain and is shared per chain only', () => {
    expect(() => deriveInvoiceKeys(SEED, 0, { signerMode: 'per-chain' })).toThrow(MetadataHardeningError);
    const a = deriveInvoiceKeys(SEED, 0, { chainId: 11155111, signerMode: 'per-chain' });
    const b = deriveInvoiceKeys(SEED, 1, { chainId: 11155111, signerMode: 'per-chain' });
    const c = deriveInvoiceKeys(SEED, 1, { chainId: 84532, signerMode: 'per-chain' });
    expect(publicKeyHex(a.signer.publicKey)).toBe(publicKeyHex(b.signer.publicKey));
    expect(publicKeyHex(a.signer.publicKey)).not.toBe(publicKeyHex(c.signer.publicKey));
    expect(a.linkability.join(' ')).toMatch(/same chain/);
  });
  it('per-invoice warns about signer pinning', () => {
    expect(deriveInvoiceKeys(SEED, 0).linkability.join(' ')).toMatch(/pin/);
  });
});

describe('MH-ID-2 per-chain keys', () => {
  it('differ per chain and from chain-agnostic keys', () => {
    const s = deriveChainKeys(SEED, 11155111);
    const b = deriveChainKeys(SEED, 84532);
    const none = deriveInvoiceKeys(SEED, 0);
    expect(s.metaAddress).not.toBe(b.metaAddress);
    expect(s.metaAddress).not.toBe(none.metaAddress);
    expect(publicKeyHex(s.signer.publicKey)).not.toBe(publicKeyHex(b.signer.publicKey));
  });
  it('a payment to chain A meta-address is not found with chain B keys', () => {
    const a = deriveChainKeys(SEED, 11155111);
    const b = deriveChainKeys(SEED, 84532);
    const pay = deriveStealthPayment(a.metaAddress);
    const ann = {
      stealthAddress: pay.stealthAddress,
      ephemeralPublicKey: '0x' + bytesToHex(pay.ephemeralPublicKey),
      metadata: '0x' + bytesToHex(pay.metadataPrefix),
    };
    expect(checkAnnouncement(ann, a.keys.viewingSecret, a.keys.spendingPublicKey).matches).toBe(true);
    expect(checkAnnouncement(ann, b.keys.viewingSecret, b.keys.spendingPublicKey).matches).toBe(false);
  });
  it('refuses mainnet and unknown chains', () => {
    expect(() => deriveChainKeys(SEED, 1)).toThrowError(/testnet/);
    expect(() => deriveInvoiceKeys(SEED, 0, { chainId: 8453 })).toThrow(MetadataHardeningError);
  });
});
