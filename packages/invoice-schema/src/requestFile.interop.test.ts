import { describe, expect, it } from 'vitest';
import {
  FRAGMENT_PREFIX,
  InvalidSignatureError,
  NonCanonicalError,
  UntrustedSignerError,
  WrongPassphraseError,
  canonicalize,
  checkExpiry,
  decodeBase64Url,
  encodeBase64Url,
  encodeFragment,
  invoiceDigest,
  openFragment,
  parseFragment,
  parsePaymentRequestFile,
  serializePaymentRequestFile,
  type EncodeOptions,
} from './index.js';
import { NOW, OTHER_META, OTHER_SIGNER, SIGNER, sampleSigned, seededRng } from './fixtures.testutil.js';

const PASSPHRASE = 'cedar orbit velvet lantern meadow';
const MODES = ['plain', 'bearer', 'passphrase'] as const;
type Mode = (typeof MODES)[number];

function options(mode: Mode): EncodeOptions {
  return {
    rng: seededRng(`request-file-${mode}`),
    ...(mode === 'bearer' ? { encrypt: true } : {}),
    ...(mode === 'passphrase' ? { passphrase: PASSPHRASE, scryptN: 32_768 } : {}),
  };
}

function envelope(fragment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(fragment.slice(FRAGMENT_PREFIX.length)))) as Record<string, unknown>;
}

describe('payment request file independently preserves signed invoice intent', () => {
  it.each(MODES)('retains exact bytes, digest, signature and terms for a %s invoice across file and URL', async (mode) => {
    const signed = sampleSigned({
      amountPolicy: { mode: 'fixed_token', tokenAmount: '123456789012345678901234' },
      memo: 'Synthetic local invoice — référence 42',
    });
    const fragment = await encodeFragment(signed, options(mode));
    const file = serializePaymentRequestFile(fragment);
    // Decode the public file format independently of its owning parser too.
    expect(JSON.parse(file)).toEqual({ format: 'ghostpay-payment-request', version: 1, fragment });
    const imported = parsePaymentRequestFile(`\n${file}\n`);
    const urlFragment = new URL(`https://invoice.example.test/GhostPay/index.html${fragment}`).hash;
    expect(imported.fragment).toBe(fragment);
    expect(imported.fragment).toBe(urlFragment);
    expect(serializePaymentRequestFile(imported.fragment)).toBe(file);

    const parseOptions = { pinnedSigners: [SIGNER], ...(mode === 'passphrase' ? { passphrase: PASSPHRASE } : {}) };
    const fromFile = await parseFragment(imported.fragment, parseOptions);
    const fromUrl = await parseFragment(urlFragment, parseOptions);
    expect(fromFile).toEqual(fromUrl);
    expect(fromFile.invoice).toEqual(signed.invoice);
    expect(fromFile.signature).toBe(signed.signature);
    expect(invoiceDigest(fromFile.invoice)).toEqual(invoiceDigest(signed.invoice));
    expect(fromFile.verification).toEqual({ signatureValid: true, signerPinned: true });
    expect(fromFile.trust).toBe('trusted-seller');
    expect(fromFile.encrypted).toBe(mode !== 'plain');
    expect(fromFile.passphraseProtected).toBe(mode === 'passphrase');
    expect(checkExpiry(fromFile.invoice, signed.invoice.expiresAt)).toEqual({ invoiceExpired: true, quoteExpired: true, secondsRemaining: 0 });
  });

  it('does not turn a valid embedded signature into a trusted seller or infer a pin from the file', async () => {
    const signed = sampleSigned();
    const imported = parsePaymentRequestFile(serializePaymentRequestFile(await encodeFragment(signed)));
    const unpinned = await parseFragment(imported.fragment);
    expect(unpinned.verification).toEqual({ signatureValid: true, signerPinned: false });
    expect(unpinned.trust).toBe('valid-signature');
    await expect(parseFragment(imported.fragment, { requirePinnedSigner: true, pinnedSigners: [OTHER_SIGNER] })).rejects.toBeInstanceOf(UntrustedSignerError);
  });

  it('keeps passphrase contents closed and delegates wrong-passphrase refusal to the existing parser', async () => {
    const signed = sampleSigned({ memo: 'Synthetic confidential request note' });
    const fragment = await encodeFragment(signed, options('passphrase'));
    const file = serializePaymentRequestFile(fragment);
    const imported = parsePaymentRequestFile(file);
    expect(file).not.toContain(PASSPHRASE);
    expect(JSON.stringify(envelope(imported.fragment))).not.toContain(signed.invoice.memo);
    const opened = await openFragment(imported.fragment);
    expect(opened.status).toBe('needsPassphrase');
    expect('parsed' in opened).toBe(false);
    await expect(openFragment(imported.fragment, { passphrase: 'different synthetic passphrase' })).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it.each([
    ['amount', { amountPolicy: { mode: 'fixed_token', tokenAmount: '12346' } }],
    ['chain', { chainId: 11155111 }],
    ['recipient', { metaAddress: OTHER_META }],
    ['fees', { feePolicy: 'payer_pays' }],
    ['expiry', { expiresAt: NOW + 7200 }],
  ] as const)('does not authenticate a file whose signed %s was changed', async (_field, patch) => {
    const signed = sampleSigned({ amountPolicy: { mode: 'fixed_token', tokenAmount: '12345' } });
    const original = envelope(await encodeFragment(signed));
    const changed = { ...original, inv: { ...signed.invoice, ...patch } };
    const fragment = FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode(canonicalize(changed)));
    const imported = parsePaymentRequestFile(serializePaymentRequestFile(fragment));
    const parsed = await parseFragment(imported.fragment, { pinnedSigners: [SIGNER] });
    expect(parsed.signature).toBe(signed.signature);
    expect(parsed.verification).toEqual({ signatureValid: false, signerPinned: false });
    expect(parsed.trust).toBe('invalid-signature');
    await expect(parseFragment(imported.fragment, { requirePinnedSigner: true, pinnedSigners: [SIGNER] })).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it('does not repair a noncanonical signed envelope while transporting it', async () => {
    const fragment = await encodeFragment(sampleSigned());
    const formattedEnvelope = JSON.stringify(envelope(fragment), null, 2);
    const noncanonical = FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode(formattedEnvelope));
    const imported = parsePaymentRequestFile(serializePaymentRequestFile(noncanonical));
    expect(imported.fragment).toBe(noncanonical);
    await expect(openFragment(imported.fragment)).rejects.toBeInstanceOf(NonCanonicalError);
  });
});
