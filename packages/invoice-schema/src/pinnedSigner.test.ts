import { gcm } from '@noble/ciphers/aes.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  FRAGMENT_PREFIX,
  InvoiceError,
  canonicalize,
  decodeBase64Url,
  encodeBase64Url,
  encodeFragment,
  isTrustedSeller,
  openFragment,
  parseFragment,
  signInvoice,
  type ParseOptions,
} from './index.js';
import {
  OTHER_META,
  OTHER_SIGNER,
  OTHER_SIGNING_KEY,
  SIGNER,
  sampleInvoice,
  sampleSigned,
} from './fixtures.testutil.js';
import { buildPassphraseAad } from './passphrase.js';

// The intersection lets this regression run against the pre-restoration parser,
// which silently ignored the requested policy instead of refusing the invoice.
const strict = (options: ParseOptions = {}): ParseOptions & { readonly requirePinnedSigner: true } =>
  ({ ...options, requirePinnedSigner: true });
const fragmentOf = (value: unknown): string =>
  FRAGMENT_PREFIX + encodeBase64Url(utf8ToBytes(canonicalize(value)));
const envelopeOf = (fragment: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(fragment.slice(FRAGMENT_PREFIX.length)))) as Record<string, unknown>;
const record = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(() => undefined, (reason: unknown) => reason);
  expect(error, `expected ${code}`).toBeInstanceOf(InvoiceError);
  expect(error).toMatchObject({ code });
  if (code === 'UNTRUSTED_SIGNER') {
    expect(error).toMatchObject({ name: 'UntrustedSignerError', message: 'invoice signer is not pinned', path: undefined });
  } else if (code === 'INVALID_SIGNATURE') {
    expect(error).toMatchObject({ name: 'InvalidSignatureError', message: 'invoice signature is invalid', path: undefined });
  }
}

const PASS = 'correct horse battery staple';

/** Authenticated passphrase envelope containing a genuinely altered signed invoice. */
function tamperedPassphraseFragment(): string {
  const signed = sampleSigned();
  const invoice = { ...signed.invoice, metaAddress: OTHER_META };
  const salt = new Uint8Array(16).fill(3);
  const nonce = new Uint8Array(12).fill(4);
  const params = { N: 1 << 15, r: 8, p: 1 };
  const key = scrypt(utf8ToBytes(PASS), salt, { ...params, dkLen: 32 });
  const aad = buildPassphraseAad(invoice.chainId, invoice.signer, params, salt);
  const ciphertext = gcm(key, nonce, aad).encrypt(utf8ToBytes(canonicalize({ inv: invoice, sig: signed.signature })));
  key.fill(0);
  return fragmentOf({
    alg: 'A256GCM-PW', chainId: invoice.chainId, signer: invoice.signer,
    kdf: { ...params, s: encodeBase64Url(salt) },
    enc: { n: encodeBase64Url(nonce), c: encodeBase64Url(ciphertext) },
  });
}

describe('opt-in trusted-signer parsing (restored from PR #218)', () => {
  it.each([false, true])('preserves default review results (encrypt=%s)', async (encrypt) => {
    const fragment = await encodeFragment(sampleSigned(), { encrypt });
    const optional = { pinnedSigners: [OTHER_SIGNER], requirePinnedSigner: false };
    for (const options of [{}, optional]) {
      const parsed = await parseFragment(fragment, options);
      expect(parsed.trust).toBe('valid-signature');
      expect(isTrustedSeller(parsed)).toBe(false);
      expect(await openFragment(fragment, options)).toEqual({ status: 'ok', parsed });
    }
    const envelope = envelopeOf(fragment);
    envelope['sig'] = '1'.repeat(128);
    const invalid = await parseFragment(fragmentOf(envelope), { pinnedSigners: [SIGNER] });
    expect(invalid.trust).toBe('invalid-signature');
    expect(invalid.verification).toEqual({ signatureValid: false, signerPinned: false });
  });

  it.each([false, true])('accepts only a valid pinned signer when requested (encrypt=%s)', async (encrypt) => {
    const signed = sampleSigned();
    const fragment = await encodeFragment(signed, { encrypt });
    const options = strict({ pinnedSigners: [OTHER_SIGNER, SIGNER.toUpperCase()] });
    const parsed = await parseFragment(fragment, options);
    expect(parsed.invoice).toEqual(signed.invoice);
    expect(parsed.trust).toBe('trusted-seller');
    expect(parsed.verification).toEqual({ signatureValid: true, signerPinned: true });
    expect(isTrustedSeller(parsed)).toBe(true);
    expect(await openFragment(fragment, options)).toEqual({ status: 'ok', parsed });
    await rejectsWith(parseFragment(fragment, strict({ pinnedSigners: [OTHER_SIGNER] })), 'UNTRUSTED_SIGNER');
    await rejectsWith(openFragment(fragment, strict({ pinnedSigners: [OTHER_SIGNER] })), 'UNTRUSTED_SIGNER');
  });

  it('rejects a different self-signed payee despite its valid signature', async () => {
    const impostor = signInvoice(sampleInvoice({ signer: OTHER_SIGNER, metaAddress: OTHER_META }), OTHER_SIGNING_KEY);
    const fragment = await encodeFragment(impostor, { encrypt: true });
    expect((await parseFragment(fragment)).verification.signatureValid).toBe(true);
    await rejectsWith(parseFragment(fragment, strict({ pinnedSigners: [SIGNER] })), 'UNTRUSTED_SIGNER');
    await rejectsWith(openFragment(fragment, strict({ pinnedSigners: [SIGNER] })), 'UNTRUSTED_SIGNER');
  });

  it('missing, empty and nonmatching pin sets trust no signer; no 0x prefix is stripped', async () => {
    const fragment = await encodeFragment(sampleSigned());
    for (const options of [strict(), strict({ pinnedSigners: [] }), strict({ pinnedSigners: [''] }), strict({ pinnedSigners: [`0x${SIGNER}`] })]) {
      await rejectsWith(parseFragment(fragment, options), 'UNTRUSTED_SIGNER');
      await rejectsWith(openFragment(fragment, options), 'UNTRUSTED_SIGNER');
    }
  });

  it('untyped option values cannot silently disable the requested guard', async () => {
    const fragment = await encodeFragment(sampleSigned());
    for (const value of [null, 0, '', 'false', 1, {}]) {
      const options = { requirePinnedSigner: value } as unknown as ParseOptions;
      await rejectsWith(parseFragment(fragment, options), 'UNTRUSTED_SIGNER');
      await rejectsWith(openFragment(fragment, options), 'UNTRUSTED_SIGNER');
    }
  });

  it.each([false, true])('rejects changed payees as invalid before checking pins (encrypt=%s)', async (encrypt) => {
    const envelope = envelopeOf(await encodeFragment(sampleSigned(), { encrypt }));
    const field = encrypt ? 'pub' : 'inv';
    envelope[field] = { ...record(envelope[field]), metaAddress: OTHER_META };
    const fragment = fragmentOf(envelope);
    // The encrypted body remains authentic; the full invoice signature detects the changed public payee.
    expect((await parseFragment(fragment)).trust).toBe('invalid-signature');
    for (const options of [strict(), strict({ pinnedSigners: [SIGNER] }), strict({ pinnedSigners: [OTHER_SIGNER] })]) {
      await rejectsWith(parseFragment(fragment, options), 'INVALID_SIGNATURE');
      await rejectsWith(openFragment(fragment, options), 'INVALID_SIGNATURE');
    }
  });

  it('an impostor cannot claim the pinned signer while retaining its own signature', async () => {
    const signed = signInvoice(sampleInvoice({ signer: OTHER_SIGNER, metaAddress: OTHER_META }), OTHER_SIGNING_KEY);
    const envelope = envelopeOf(await encodeFragment(signed));
    envelope['inv'] = { ...record(envelope['inv']), signer: SIGNER };
    await rejectsWith(parseFragment(fragmentOf(envelope), strict({ pinnedSigners: [SIGNER] })), 'INVALID_SIGNATURE');
    await rejectsWith(openFragment(fragmentOf(envelope), strict({ pinnedSigners: [SIGNER] })), 'INVALID_SIGNATURE');
  });

  it('preserves earlier format, schema, decryption and unexpected-passphrase errors', async () => {
    const options = strict({ pinnedSigners: [SIGNER] });
    await rejectsWith(parseFragment('invalid', options), 'FRAGMENT_FORMAT');
    const plain = envelopeOf(await encodeFragment(sampleSigned()));
    delete plain['sig'];
    await rejectsWith(parseFragment(fragmentOf(plain), options), 'SCHEMA');
    plain['sig'] = 'bad';
    await rejectsWith(openFragment(fragmentOf(plain), options), 'SCHEMA');
    const encrypted = envelopeOf(await encodeFragment(sampleSigned(), { encrypt: true }));
    const ciphertext = record(encrypted['enc'])['c'] as string;
    record(encrypted['enc'])['c'] = (ciphertext[0] === '0' ? '1' : '0') + ciphertext.slice(1);
    await rejectsWith(parseFragment(fragmentOf(encrypted), options), 'DECRYPT');
    await rejectsWith(openFragment(fragmentOf(encrypted), options), 'DECRYPT');
    await rejectsWith(parseFragment(await encodeFragment(sampleSigned()), strict({ passphrase: PASS })), 'PASSPHRASE_UNEXPECTED');
  });

  it('prompts without trusting a passphrase header, then enforces the decrypted signer', async () => {
    const fragment = await encodeFragment(sampleSigned(), { passphrase: PASS, scryptN: 1 << 15 });
    expect((await openFragment(fragment, strict())).status).toBe('needsPassphrase');
    await rejectsWith(parseFragment(fragment, strict()), 'PASSPHRASE_REQUIRED');
    const trusted = strict({ pinnedSigners: [SIGNER], passphrase: PASS });
    const parsed = await parseFragment(fragment, trusted);
    expect(parsed.trust).toBe('trusted-seller');
    expect(parsed.passphraseProtected).toBe(true);
    expect(await openFragment(fragment, trusted)).toEqual({ status: 'ok', parsed });
    await rejectsWith(parseFragment(fragment, strict({ passphrase: PASS })), 'UNTRUSTED_SIGNER');
    await rejectsWith(openFragment(fragment, strict({ pinnedSigners: [OTHER_SIGNER], passphrase: PASS })), 'UNTRUSTED_SIGNER');
    await rejectsWith(openFragment(fragment, strict({ pinnedSigners: [SIGNER], passphrase: 'another wrong passphrase' })), 'PASSPHRASE');
  });

  it('also rejects an invalid invoice signature after successful passphrase decryption', async () => {
    const fragment = tamperedPassphraseFragment();
    const parsed = await parseFragment(fragment, { passphrase: PASS });
    expect(parsed.passphraseProtected).toBe(true);
    expect(parsed.invoice.metaAddress).toBe(OTHER_META);
    expect(parsed.trust).toBe('invalid-signature');
    for (const options of [strict({ pinnedSigners: [SIGNER], passphrase: PASS }), strict({ passphrase: PASS })]) {
      await rejectsWith(parseFragment(fragment, options), 'INVALID_SIGNATURE');
      await rejectsWith(openFragment(fragment, options), 'INVALID_SIGNATURE');
    }
  });
});
