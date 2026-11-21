import { gcm } from '@noble/ciphers/aes.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FRAGMENT_PREFIX, InvoiceError, canonicalize, encodeBase64Url, encodeFragment, openFragment,
  parseFragment, signInvoice, type Invoice, type ParseOptions,
} from './index.js';
import { OTHER_META, OTHER_SIGNER, OTHER_SIGNING_KEY, SIGNER, sampleInvoice, sampleSigned } from './fixtures.testutil.js';
import { buildPassphraseAad } from './passphrase.js';

type Mode = 'none' | 'A256GCM' | 'A256GCM-PW';
const MODES: readonly Mode[] = ['none', 'A256GCM', 'A256GCM-PW'];
const PASS = 'independently confirmed test passphrase';
const good = sampleSigned({ amountPolicy: { mode: 'fixed_token', tokenAmount: '12345' } });
const fragmentOf = (body: unknown): string => FRAGMENT_PREFIX + encodeBase64Url(utf8ToBytes(canonicalize(body)));

/** Independently encrypt the supplied payload, so signatures are tested after valid GCM authentication. */
function craft(mode: Mode, invoice: Invoice, signature: unknown = good.signature, includeSignature = true, extra = false): string {
  const signed = { inv: invoice, ...(includeSignature ? { sig: signature } : {}), ...(extra ? { other: true } : {}) };
  if (mode === 'none') return fragmentOf({ alg: mode, ...signed });
  const nonce = new Uint8Array(12).fill(9);
  if (mode === 'A256GCM-PW') {
    const salt = new Uint8Array(16).fill(8);
    const params = { N: 1 << 15, r: 8, p: 1 };
    const key = scrypt(utf8ToBytes(PASS), salt, { ...params, dkLen: 32 });
    const ct = gcm(key, nonce, buildPassphraseAad(invoice.chainId, invoice.signer, params, salt))
      .encrypt(utf8ToBytes(canonicalize(signed)));
    key.fill(0);
    return fragmentOf({ alg: mode, chainId: invoice.chainId, signer: invoice.signer,
      kdf: { ...params, s: encodeBase64Url(salt) }, enc: { n: encodeBase64Url(nonce), c: encodeBase64Url(ct) } });
  }
  const { lineItems, memo, ...pub } = invoice;
  const key = new Uint8Array(32).fill(7);
  const chain = new Uint8Array(8);
  new DataView(chain.buffer).setBigUint64(0, BigInt(invoice.chainId));
  const aad = concatBytes(utf8ToBytes('GPI1'), chain, hexToBytes(invoice.signer));
  const ct = gcm(key, nonce, aad).encrypt(utf8ToBytes(canonicalize({ lineItems, ...(memo === undefined ? {} : { memo }) })));
  return fragmentOf({ alg: mode, pub, enc: { k: bytesToHex(key), n: bytesToHex(nonce), c: bytesToHex(ct) },
    ...(includeSignature ? { sig: signature } : {}), ...(extra ? { other: true } : {}) });
}

const options = (mode: Mode, extra: ParseOptions = {}): ParseOptions => ({
  ...(mode === 'A256GCM-PW' ? { passphrase: PASS } : {}), ...extra,
});

async function failure(promise: Promise<unknown>, code: string, path?: string): Promise<void> {
  const error: unknown = await promise.then(() => undefined, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(InvoiceError);
  expect(error).toMatchObject({ code, ...(path === undefined ? {} : { path }) });
  expect((error as Error).message).not.toContain(PASS);
  expect((error as Error).message).not.toContain(good.signature);
  expect((error as Error).message).not.toContain(good.invoice.metaAddress);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe.each(MODES)('invoice verification classification (%s)', (mode) => {
  it('distinguishes a missing signature and never trusts it under an existing pin', async () => {
    const fragment = craft(mode, good.invoice, undefined, false);
    await failure(parseFragment(fragment, options(mode)), 'MISSING_SIGNATURE');
    await failure(openFragment(fragment, options(mode, { pinnedSigners: [SIGNER], requirePinnedSigner: true })), 'MISSING_SIGNATURE');
  });

  it('does not hide unknown fields behind the missing-signature status', async () => {
    await failure(parseFragment(craft(mode, good.invoice, undefined, false, true), options(mode)), 'SCHEMA');
  });

  it('keeps malformed signature bytes distinct from a missing signature', async () => {
    for (const signature of ['', 'xx', 7, good.signature.toUpperCase(), `${good.signature}00`]) {
      await failure(parseFragment(craft(mode, good.invoice, signature), options(mode)), 'SCHEMA', 'sig');
    }
  });

  it('rejects unsupported invoice versions separately from malformed version fields', async () => {
    await failure(parseFragment(craft(mode, { ...good.invoice, v: 3 } as unknown as Invoice), options(mode)), 'UNSUPPORTED');
    for (const v of [0, '3', null]) {
      await failure(parseFragment(craft(mode, { ...good.invoice, v } as unknown as Invoice), options(mode)), 'SCHEMA', 'v');
    }
  });

  it('never lets another valid signer satisfy the selected trusted identity', async () => {
    const other = signInvoice(sampleInvoice({ signer: OTHER_SIGNER }), OTHER_SIGNING_KEY);
    const fragment = craft(mode, other.invoice, other.signature);
    await failure(parseFragment(fragment, options(mode, { pinnedSigners: [SIGNER], requirePinnedSigner: true })), 'UNTRUSTED_SIGNER');
    const parsed = await parseFragment(fragment, options(mode, { pinnedSigners: [SIGNER, OTHER_SIGNER], requirePinnedSigner: true }));
    expect(parsed.verification).toEqual({ signatureValid: true, signerPinned: true });
    expect(parsed.invoice.signer).toBe(OTHER_SIGNER);
  });
});

describe('unsupported format versus unavailable verification', () => {
  it('reports recognized but unsupported fragment versions without decoding their payload', async () => {
    for (const version of ['2', '3', '100']) {
      await failure(openFragment(`#gpi=v${version}.abc`), 'UNSUPPORTED');
    }
    for (const fragment of ['#gpi=v0.abc', '#gpi=v01.abc', '#gpi=v2', '#gpi=V2.abc']) {
      await failure(openFragment(fragment), 'FRAGMENT_FORMAT');
    }
  });

  it('reports unavailable Web Crypto separately while plaintext verification still works offline', async () => {
    const encrypted = craft('A256GCM', good.invoice);
    vi.stubGlobal('crypto', undefined);
    await failure(parseFragment(encrypted), 'VERIFICATION_UNAVAILABLE');
    const parsed = await parseFragment(craft('none', good.invoice), { pinnedSigners: [SIGNER], requirePinnedSigner: true });
    expect(parsed.verification).toEqual({ signatureValid: true, signerPinned: true });
  });

  it('does not expose provider exceptions when the Web Crypto key import is unavailable', async () => {
    const encrypted = craft('A256GCM', good.invoice);
    vi.stubGlobal('crypto', { subtle: { importKey: () => Promise.reject(new Error(PASS)) } });
    await failure(parseFragment(encrypted), 'VERIFICATION_UNAVAILABLE');
  });

  it('reports an interrupted decrypt without classifying a signature as invalid', async () => {
    const encrypted = craft('A256GCM', good.invoice);
    vi.stubGlobal('crypto', { subtle: { importKey: () => Promise.resolve({}), decrypt: () => Promise.reject(new DOMException(PASS, 'AbortError')) } });
    await failure(parseFragment(encrypted), 'VERIFICATION_UNAVAILABLE');
  });

  it('keeps unsupported algorithms separate from local capability failures', async () => {
    vi.stubGlobal('crypto', undefined);
    await failure(openFragment(fragmentOf({ alg: 'ECDSA-other', inv: good.invoice, sig: good.signature })), 'UNSUPPORTED');
  });
});

const TAMPERS: ReadonlyArray<readonly [string, (invoice: Invoice) => Invoice]> = [
  ['payment recipient meta-address', (invoice) => ({ ...invoice, metaAddress: OTHER_META })],
  ['chain identifier', (invoice) => ({ ...invoice, chainId: 11155111 })],
  ['token', (invoice) => ({ ...invoice, token: 'native' })],
  ['payment amount', (invoice) => ({ ...invoice, amountPolicy: { mode: 'fixed_token', tokenAmount: '99999' } })],
  ['claimed recipient signing identity', (invoice) => ({ ...invoice, signer: OTHER_SIGNER })],
  ['expiration', (invoice) => ({ ...invoice, expiresAt: invoice.expiresAt + 1 })],
  ['invoice identifier nonce', (invoice) => ({ ...invoice, nonce: 'ef'.repeat(16) })],
  ['invoice metadata memo', (invoice) => ({ ...invoice, memo: 'Changed memo' })],
  ['line-item metadata', (invoice) => ({ ...invoice, lineItems: [{ description: 'Changed item', quantity: '1', unitMinorUnits: '12345' }] })],
  ['fee policy', (invoice) => ({ ...invoice, feePolicy: 'payer_pays' })],
];

describe.each(MODES)('authenticated payload tamper matrix (%s)', (mode) => {
  it.each(TAMPERS)('rejects changed %s after envelope authentication', async (_name, change) => {
    const fragment = craft(mode, change(good.invoice));
    const parsed = await parseFragment(fragment, options(mode, { pinnedSigners: [SIGNER, OTHER_SIGNER] }));
    expect(parsed.verification).toEqual({ signatureValid: false, signerPinned: false });
    expect(parsed.trust).toBe('invalid-signature');
    await failure(parseFragment(fragment, options(mode, { pinnedSigners: [SIGNER, OTHER_SIGNER], requirePinnedSigner: true })), 'INVALID_SIGNATURE');
  });

  it('keeps supported v2 gas-buffer policy inside the existing signed payload', async () => {
    const signed = sampleSigned({ bufferPolicy: { accepted: true, minWei: '1', maxWei: '100', refund: 'none' } });
    const correct = await encodeFragment(signed, mode === 'A256GCM-PW' ? { passphrase: PASS, scryptN: 1 << 15 } : { encrypt: mode === 'A256GCM' });
    expect((await parseFragment(correct, options(mode))).verification.signatureValid).toBe(true);
    const changed = { ...signed.invoice, bufferPolicy: { accepted: true, minWei: '1', maxWei: '101', refund: 'none' as const } };
    expect((await parseFragment(craft(mode, changed, signed.signature), options(mode))).verification).toEqual({ signatureValid: false, signerPinned: false });
  });
});
