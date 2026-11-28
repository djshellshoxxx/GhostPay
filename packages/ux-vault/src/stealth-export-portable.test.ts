import { createCipheriv, randomFillSync, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { addressOfSecret } from '@ghostpay/chain-adapters';
import { CURVE_ORDER, deriveStealthSecret, encodeMetaAddress, generateKeySet, parseCompressedPoint, secretScalarFromBytes, unsafeRevealSecret, type SecretScalar } from '@ghostpay/core-crypto';
import { canonicalize } from '@ghostpay/invoice-schema';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createKeystoreApi,
  createStealthExportApi,
  PortableVaultError,
  type StealthExportAnnouncement,
  type StealthPublicRecord,
  type VerifiedStealthPayment,
} from './portable.js';

// Pass-through spies: production behaviour is unchanged unless a test overrides one call.
vi.mock('@noble/hashes/scrypt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@noble/hashes/scrypt.js')>();
  return { ...actual, scryptAsync: vi.fn(actual.scryptAsync) };
});
vi.mock('@ghostpay/chain-adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/chain-adapters')>();
  return { ...actual, addressOfSecret: vi.fn(actual.addressOfSecret) };
});
vi.mock('@ghostpay/core-crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/core-crypto')>();
  return { ...actual, secretScalarFromBytes: vi.fn(actual.secretScalarFromBytes) };
});

const { secretScalarFromBytes: realScalar } = await vi.importActual<typeof import('@ghostpay/core-crypto')>('@ghostpay/core-crypto');

interface VectorAnnouncement {
  readonly id: string;
  readonly announcement: {
    readonly schemeId: string; readonly stealthAddress: string; readonly ephemeralPublicKey: string; readonly metadata: string;
    readonly blockHash: string; readonly blockNumber: string; readonly logIndex: number; readonly transactionHash?: string;
  };
  readonly expected: { readonly stealthAddress: string; readonly publicKey: string; readonly privateKey: string; readonly announcedViewTag: string; readonly derivedViewTag: string; readonly tagMatches: boolean };
}
interface VectorFile { readonly salt: string; readonly iv: string; readonly text: string; readonly announcements: readonly string[] }
interface Vectors {
  readonly chainId: number;
  readonly exportedAt: string;
  readonly passphrase: string;
  readonly kdf: { readonly N: number };
  readonly seller: { readonly spendingPrivateKey: string; readonly viewingPrivateKey: string; readonly spendingPublicKey: string; readonly viewingPublicKey: string; readonly metaAddress: string };
  readonly announcements: readonly VectorAnnouncement[];
  readonly files: {
    readonly public: { readonly announcement: string; readonly text: string };
    readonly single: VectorFile;
    readonly archive: VectorFile & { readonly omitted: readonly string[] };
    readonly master: { readonly salt: string; readonly iv: string; readonly text: string };
    readonly rawPrivateKey: { readonly announcement: string; readonly text: string };
  };
  readonly invalid: readonly { readonly id: string; readonly format: 'keypair' | 'master'; readonly passphrase?: string; readonly text: string; readonly error: string }[];
}
interface Scheme1 { readonly vectors: readonly { readonly id: string; readonly spendingPrivateKey: string; readonly viewingPrivateKey: string; readonly stealthPrivateKey: string; readonly stealthAddress: string }[] }

const V = JSON.parse(readFileSync(new URL('../../../test-vectors/stealth-export.json', import.meta.url), 'utf8')) as Vectors;
const SCHEME1 = JSON.parse(readFileSync(new URL('../../../test-vectors/scheme1.json', import.meta.url), 'utf8')) as Scheme1;

const api = createStealthExportApi();
const N = V.kdf.N;
const PASS = V.passphrase;
const KEYPAIR_DOMAIN = 'GhostPay.stealth-keypair.v1';
const MASTER_DOMAIN = 'GhostPay.stealth-master.v1';

const scalar = (hex: string): SecretScalar => secretScalarFromBytes(hexToBytes(hex.slice(2)));
const revealHex = (s: SecretScalar): string => `0x${bytesToHex(unsafeRevealSecret(s))}`;
const SELLER = { spendingSecret: scalar(V.seller.spendingPrivateKey), viewingSecret: scalar(V.seller.viewingPrivateKey) };
const byId = (id: string): VectorAnnouncement => {
  const a = V.announcements.find((x) => x.id === id);
  if (a === undefined) throw new Error(`missing vector ${id}`);
  return a;
};
const announcementOf = (v: VectorAnnouncement): StealthExportAnnouncement => {
  const { schemeId, blockNumber, transactionHash, ...rest } = v.announcement;
  return { ...rest, schemeId: BigInt(schemeId), blockNumber: BigInt(blockNumber), ...(transactionHash === undefined ? {} : { transactionHash }) };
};
const verified = (id: string, over: Partial<StealthExportAnnouncement> = {}): VerifiedStealthPayment =>
  api.buildVerifiedPayment({ chainId: V.chainId, announcement: { ...announcementOf(byId(id)), ...over }, keys: SELLER, exportedAt: new Date(V.exportedAt) });

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const parse = (text: string): { [key: string]: Json } => JSON.parse(text) as { [key: string]: Json };
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PortableVaultError);
    return (error as PortableVaultError).code;
  }
  throw new Error('expected a refusal');
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(PortableVaultError);
    return (error as PortableVaultError).code;
  }
  throw new Error('expected a refusal');
}

/**
 * Test-only injection of the export salt and IV. Production code draws them from crypto.getRandomValues only, as one
 * 28-byte request (salt then IV); every other request (such as the curve library's blinding) keeps real randomness.
 */
async function withRandom<T>(salt: string, iv: string, run: () => Promise<T>): Promise<T> {
  const queue = [hexToBytes(salt.slice(2) + iv.slice(2))];
  const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<A extends ArrayBufferView | null>(array: A): A => {
    if (array === null) return array;
    const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    if (view.length !== 28) {
      randomFillSync(view);
      return array;
    }
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected second envelope draw');
    view.set(next);
    return array;
  });
  try {
    return await run();
  } finally {
    spy.mockRestore();
    expect(queue).toHaveLength(0);
  }
}

/** An independent node:crypto sealer, so tests can build authentic files with crafted headers or bodies. */
function sealWith(domain: string, header: { [key: string]: Json }, plaintext: string, passphrase = PASS): string {
  const kdf = header['kdf'] as { N: number; r: number; p: number; salt: string };
  const cipher = header['cipher'] as { iv: string };
  const key = scryptSync(passphrase.normalize('NFKC'), Buffer.from(kdf.salt.slice(2), 'hex'), 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 2 ** 29 });
  const c = createCipheriv('aes-256-gcm', key, Buffer.from(cipher.iv.slice(2), 'hex'));
  c.setAAD(Buffer.from(`${domain}\n${canonicalize(header)}`, 'utf8'));
  const ct = Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final(), c.getAuthTag()]);
  return pretty({ ...header, ciphertext: `0x${ct.toString('hex')}` });
}

function headerOf(text: string): { [key: string]: Json } {
  const header = parse(text);
  delete header['ciphertext'];
  return header;
}

/** A synthetic but fully consistent record for a random one-time key (used for bounds and conflicts, not derivation). */
function syntheticPayment(over: Partial<{ chainId: number; blockNumber: string; logIndex: number; blockHash: string; ephemeralPublicKey: string; transactionHash: string }> = {}): VerifiedStealthPayment {
  const secret = secretScalarFromBytes(secp256k1.utils.randomSecretKey());
  const record: StealthPublicRecord = {
    format: 'ghostpay-stealth-public-v1', version: 1, schemeId: 1, chainId: over.chainId ?? V.chainId,
    stealthAddress: addressOfSecret(secret),
    publicKey: { encoding: 'secp256k1-compressed', value: `0x${bytesToHex(secp256k1.getPublicKey(unsafeRevealSecret(secret), true))}` },
    ephemeralPublicKey: over.ephemeralPublicKey ?? `0x${bytesToHex(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true))}`,
    viewTag: '0x7f',
    announcement: {
      blockHash: over.blockHash ?? `0x${'cd'.repeat(32)}`, blockNumber: over.blockNumber ?? '100', logIndex: over.logIndex ?? 0,
      ...(over.transactionHash === undefined ? {} : { transactionHash: over.transactionHash }),
    },
    exportedAt: V.exportedAt,
  };
  return { record, secret };
}

const scrypt = vi.mocked(scryptAsync);
const independentAddress = vi.mocked(addressOfSecret);
const scalarFromBytes = vi.mocked(secretScalarFromBytes);
beforeEach(() => { scrypt.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('reference vectors (test-vectors/stealth-export.json)', () => {
  it('derives each announcement to the exact public key, EIP-55 address and private key, deep scan included', () => {
    const seed = SCHEME1.vectors.find((v) => v.id === 'scheme1-001');
    expect(byId('a1').expected.privateKey).toBe(seed?.stealthPrivateKey);
    expect(byId('a1').expected.stealthAddress).toBe(seed?.stealthAddress);
    for (const v of V.announcements) {
      const { record, secret } = verified(v.id);
      expect(record.stealthAddress).toBe(v.expected.stealthAddress);
      expect(record.publicKey).toEqual({ encoding: 'secp256k1-compressed', value: v.expected.publicKey });
      expect(revealHex(secret)).toBe(v.expected.privateKey);
      expect(`0x${bytesToHex(secp256k1.getPublicKey(hexToBytes(v.expected.privateKey.slice(2)), true))}`).toBe(v.expected.publicKey);
      expect(record.viewTag).toBe(v.expected.announcedViewTag);
      expect(v.expected.announcedViewTag === v.expected.derivedViewTag).toBe(v.expected.tagMatches);
      expect(record.announcement.transactionHash).toBe(v.announcement.transactionHash);
      expect(Object.keys(record.announcement).includes('transactionHash')).toBe(v.announcement.transactionHash !== undefined);
    }
    expect(byId('a4').expected.tagMatches).toBe(false);
  });

  it('serializes the public record byte for byte and parses it back', () => {
    const { record } = verified(V.files.public.announcement);
    expect(api.serializePublicRecord(record)).toBe(V.files.public.text);
    expect(api.parsePublicRecord(V.files.public.text)).toEqual(record);
  });

  it('encrypts the single keypair file byte for byte from injected salt and IV', async () => {
    const text = await withRandom(V.files.single.salt, V.files.single.iv, () => api.encryptPaymentKeys([verified('a1')], { scope: 'single', passphrase: PASS, N }));
    expect(text).toBe(V.files.single.text);
  });

  it('encrypts the three-entry archive byte for byte, whatever the input order', async () => {
    const items = ['a2', 'a4', 'a1'].map((id) => verified(id));
    const text = await withRandom(V.files.archive.salt, V.files.archive.iv, () => api.encryptPaymentKeys(items, { scope: 'selected', passphrase: PASS, N }));
    expect(text).toBe(V.files.archive.text);
    expect(api.inspectPaymentKeys(text).payments.map((p) => p.stealthAddress)).toEqual(V.files.archive.announcements.map((id) => byId(id).expected.stealthAddress));
  });

  it('encrypts the master backup byte for byte', async () => {
    const text = await withRandom(V.files.master.salt, V.files.master.iv, () => api.encryptMasterBackup(SELLER, { passphrase: PASS, exportedAt: new Date(V.exportedAt), N }));
    expect(text).toBe(V.files.master.text);
  });

  it('decrypts the single file, the archive and the master backup to the exact keys', async () => {
    for (const file of [V.files.single, V.files.archive]) {
      const out = await api.decryptPaymentKeys(file.text, PASS, { expectedChainId: V.chainId });
      expect(out.header).toEqual(api.inspectPaymentKeys(file.text));
      expect(out.payments.map((p) => revealHex(p.secret))).toEqual(file.announcements.map((id) => byId(id).expected.privateKey));
      expect(out.payments.map((p) => p.record)).toEqual(file.announcements.map((id) => verified(id).record));
    }
    const master = await api.decryptMasterBackup(V.files.master.text, PASS);
    expect(revealHex(master.spendingSecret)).toBe(V.seller.spendingPrivateKey);
    expect(revealHex(master.viewingSecret)).toBe(V.seller.viewingPrivateKey);
    expect(master.header).toEqual(api.inspectMasterBackup(V.files.master.text));
    expect(master.header.metaAddress).toBe(V.seller.metaAddress);
  });

  it('formats the raw private key text exactly (lowercase 0x + 64 hex, final newline)', () => {
    const { record, secret } = verified(V.files.rawPrivateKey.announcement);
    const text = api.formatRawPrivateKey(record, secret);
    expect(text).toBe(V.files.rawPrivateKey.text);
    expect(text).toMatch(/\nPrivate key: 0x[0-9a-f]{64}\n$/);
  });

  it.each(V.invalid)('refuses $id with error.stealthExport.$error', async (bad) => {
    const passphrase = bad.passphrase ?? PASS;
    const run = bad.format === 'keypair' ? () => api.decryptPaymentKeys(bad.text, passphrase) : () => api.decryptMasterBackup(bad.text, passphrase);
    expect(await codeOf(run)).toBe(`error.stealthExport.${bad.error}`);
  });

  it('recovers a historic payment omitted from the payment archive from the master backup alone', async () => {
    const omitted = byId(V.files.archive.omitted[0] as string);
    const archive = await api.decryptPaymentKeys(V.files.archive.text, PASS);
    expect(archive.payments.map((p) => p.record.stealthAddress)).not.toContain(omitted.expected.stealthAddress);
    const master = await api.decryptMasterBackup(V.files.master.text, PASS);
    const key = deriveStealthSecret(announcementOf(omitted), master, { ignoreViewTag: true });
    expect(revealHex(key)).toBe(omitted.expected.privateKey);
    expect(addressOfSecret(key)).toBe(omitted.expected.stealthAddress);
  });
});

describe('K01 verified derivation', () => {
  it('refuses another scheme and an invalid chain before any derivation', () => {
    expect(code(() => verified('a1', { schemeId: 2n }))).toBe('error.stealthExport.unsupportedScheme');
    expect(code(() => verified('a1', { schemeId: 0x47500002n }))).toBe('error.stealthExport.unsupportedScheme');
    for (const chainId of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(code(() => api.buildVerifiedPayment({ chainId, announcement: announcementOf(byId('a1')), keys: SELLER, exportedAt: new Date(V.exportedAt) }))).toBe('error.stealthExport.invalidChain');
    }
  });

  it('refuses an announcement that pays someone else or whose address was swapped', () => {
    const other = SCHEME1.vectors.find((v) => v.id === 'scheme1-002');
    if (other === undefined) throw new Error('scheme1-002 missing');
    const keys = { spendingSecret: scalar(other.spendingPrivateKey), viewingSecret: scalar(other.viewingPrivateKey) };
    expect(code(() => api.buildVerifiedPayment({ chainId: V.chainId, announcement: announcementOf(byId('a1')), keys, exportedAt: new Date(V.exportedAt) }))).toBe('error.stealthExport.keyDoesNotMatch');
    expect(code(() => verified('a1', { stealthAddress: byId('a2').expected.stealthAddress }))).toBe('error.stealthExport.keyDoesNotMatch');
  });

  it('refuses malformed announcement fields', () => {
    const cases: Partial<StealthExportAnnouncement>[] = [
      { ephemeralPublicKey: `0x04${'11'.repeat(32)}` }, { ephemeralPublicKey: `0x02${'00'.repeat(32)}` }, { metadata: '0x' }, { metadata: '0x2' },
      { stealthAddress: '0x1234' }, { blockHash: '0x12' }, { blockNumber: -1n }, { blockNumber: 1n << 64n }, { logIndex: -1 }, { logIndex: 0.5 },
      { transactionHash: '0xzz' }, { stealthAddress: byId('a1').expected.stealthAddress.replace('D', 'd') },
    ];
    for (const over of cases) expect(code(() => verified('a1', over)), JSON.stringify(over, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).toBe('error.stealthExport.invalidAnnouncement');
  });

  it('refuses an invalid or out-of-range export time and drops sub-second precision', () => {
    for (const exportedAt of [new Date(Number.NaN), new Date('+010000-01-01T00:00:00Z'), new Date('-000001-01-01T00:00:00Z')]) {
      expect(code(() => api.buildVerifiedPayment({ chainId: V.chainId, announcement: announcementOf(byId('a1')), keys: SELLER, exportedAt }))).toBe('error.stealthExport.invalidTime');
    }
    expect(code(() => api.buildVerifiedPayment({ chainId: V.chainId, announcement: announcementOf(byId('a1')), keys: SELLER, exportedAt: '2026' as unknown as Date }))).toBe('error.stealthExport.invalidTime');
    const { record } = api.buildVerifiedPayment({ chainId: V.chainId, announcement: announcementOf(byId('a1')), keys: SELLER, exportedAt: new Date('2026-11-18T10:20:30.999Z') });
    expect(record.exportedAt).toBe('2026-11-18T10:20:30Z');
    const early = api.buildVerifiedPayment({ chainId: V.chainId, announcement: announcementOf(byId('a1')), keys: SELLER, exportedAt: new Date(-1500) });
    expect(early.record.exportedAt).toBe('1969-12-31T23:59:58Z');
  });

  it('normalizes hex case of the locator and omits an unavailable transaction hash', () => {
    const a = announcementOf(byId('a1'));
    const { record } = verified('a1', { blockHash: a.blockHash.toUpperCase().replace('0X', '0x'), transactionHash: `0x${'AB'.repeat(32)}`, ephemeralPublicKey: a.ephemeralPublicKey.toUpperCase().replace('0X', '0x') });
    expect(record.announcement.blockHash).toBe(a.blockHash);
    expect(record.announcement.transactionHash).toBe(`0x${'ab'.repeat(32)}`);
    expect(record.ephemeralPublicKey).toBe(a.ephemeralPublicKey);
    const { transactionHash, ...withoutTx } = a;
    expect(transactionHash).toBeDefined();
    const bare = api.buildVerifiedPayment({ chainId: V.chainId, announcement: withoutTx, keys: SELLER, exportedAt: new Date(V.exportedAt) });
    expect(Object.keys(bare.record.announcement)).toEqual(['blockHash', 'blockNumber', 'logIndex']);
  });

  it('independently recomputes the address from the derived key and wipes the key when it disagrees', () => {
    let seen: SecretScalar | undefined;
    independentAddress.mockImplementationOnce((secret) => { seen = secret; return '0x0000000000000000000000000000000000000001'; });
    expect(code(() => verified('a1'))).toBe('error.stealthExport.keyDoesNotMatch');
    expect(seen).toBeDefined();
    expect(Array.from(seen as Uint8Array).every((b) => b === 0)).toBe(true);
    independentAddress.mockImplementationOnce(() => { throw new Error('PRIVATE DIAGNOSTIC'); });
    expect(code(() => verified('a1'))).toBe('error.stealthExport.keyDoesNotMatch');
  });

  it('maps any derivation failure to a fixed diagnostic', () => {
    const bad = { spendingSecret: new Uint8Array(32) as SecretScalar, viewingSecret: SELLER.viewingSecret };
    expect(code(() => api.buildVerifiedPayment({ chainId: V.chainId, announcement: announcementOf(byId('a1')), keys: bad, exportedAt: new Date(V.exportedAt) }))).toBe('error.stealthExport.keyDoesNotMatch');
  });
});

describe('ghostpay-stealth-public-v1 parser', () => {
  const base = parse(V.files.public.text);
  const variant = (edit: (r: { [key: string]: Json }) => void): string => {
    const r = parse(V.files.public.text);
    edit(r);
    return pretty(r);
  };
  const otherPoint = `0x${bytesToHex(secp256k1.getPublicKey(hexToBytes('42'.repeat(32)), true))}`;

  it('bounds the input before parsing and accepts exactly the limit', () => {
    const atLimit = V.files.public.text + ' '.repeat(api.STEALTH_EXPORT_LIMITS.publicRecordBytes - V.files.public.text.length);
    expect(api.parsePublicRecord(atLimit).stealthAddress).toBe(base['stealthAddress']);
    expect(code(() => api.parsePublicRecord(`${atLimit} `))).toBe('error.stealthExport.tooLarge');
    expect(code(() => api.parsePublicRecord(42 as unknown as string))).toBe('error.stealthExport.invalidFile');
  });

  it('rejects any character outside printable ASCII and JSON whitespace', () => {
    for (const ch of ['\u00e9', '\u0000', '\u2028', '\ufeff', '\u000b', '\u007f']) {
      expect(code(() => api.parsePublicRecord(`${ch}${V.files.public.text}`))).toBe('error.stealthExport.invalidFile');
    }
    expect(code(() => api.parsePublicRecord(V.files.public.text.replace('"format"', '"form\u00e1t"')))).toBe('error.stealthExport.invalidFile');
  });

  it('rejects duplicate JSON keys, unknown and missing keys at every level', () => {
    expect(code(() => api.parsePublicRecord(V.files.public.text.replace('"version": 1,', '"version": 1,\n  "version": 1,')))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.parsePublicRecord(V.files.public.text.replace('"logIndex": 3,', '"logIndex": 3,\n    "logIndex": 3,')))).toBe('error.stealthExport.invalidFile');
    const paths: (readonly string[])[] = [[], ['publicKey'], ['announcement']];
    for (const path of paths) {
      const target = (r: { [key: string]: Json }): { [key: string]: Json } => path.reduce<{ [key: string]: Json }>((o, k) => o[k] as { [key: string]: Json }, r);
      expect(code(() => api.parsePublicRecord(variant((r) => { target(r)['privateKey'] = '0x00'; })))).toBe('error.stealthExport.invalidFile');
      for (const key of Object.keys(target(base))) {
        if (key === 'transactionHash') continue;
        expect(code(() => api.parsePublicRecord(variant((r) => { delete target(r)[key]; }))), `${path.join('.')}.${key}`).toBe('error.stealthExport.invalidFile');
      }
    }
    for (const text of ['[]', 'null', '"x"', '{', '']) expect(code(() => api.parsePublicRecord(text))).toBe('error.stealthExport.invalidFile');
  });

  it('distinguishes a later format version and an unsupported scheme', () => {
    expect(code(() => api.parsePublicRecord(variant((r) => { r['format'] = 'ghostpay-stealth-public-v2'; r['extra'] = 1; })))).toBe('error.stealthExport.unsupportedVersion');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['version'] = 2; })))).toBe('error.stealthExport.unsupportedVersion');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['version'] = '1'; })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['format'] = 'ghostpay-stealth-keypair-v1'; })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['format'] = 'ghostpay-stealth-public-vX'; })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['schemeId'] = 2; })))).toBe('error.stealthExport.unsupportedScheme');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['schemeId'] = '1'; })))).toBe('error.stealthExport.invalidFile');
  });

  it('enforces EIP-55 equality, curve points and public key to address consistency', () => {
    const address = base['stealthAddress'] as string;
    expect(code(() => api.parsePublicRecord(variant((r) => { r['stealthAddress'] = address.toLowerCase(); })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['stealthAddress'] = address.toUpperCase().replace('0X', '0x'); })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.parsePublicRecord(variant((r) => { (r['publicKey'] as { [k: string]: Json })['value'] = otherPoint; })))).toBe('error.stealthExport.keyDoesNotMatch');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['stealthAddress'] = byId('a2').expected.stealthAddress; })))).toBe('error.stealthExport.keyDoesNotMatch');
    const uncompressed = `0x${bytesToHex(secp256k1.Point.fromBytes(hexToBytes((base['publicKey'] as { value: string }).value.slice(2))).toBytes(false))}`;
    for (const value of [uncompressed, `0x02${'00'.repeat(32)}`, `0x05${'11'.repeat(32)}`, (base['publicKey'] as { value: string }).value.toUpperCase()]) {
      expect(code(() => api.parsePublicRecord(variant((r) => { (r['publicKey'] as { [k: string]: Json })['value'] = value; })))).toBe('error.stealthExport.invalidFile');
    }
    expect(code(() => api.parsePublicRecord(variant((r) => { (r['publicKey'] as { [k: string]: Json })['encoding'] = 'secp256k1-uncompressed'; })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.parsePublicRecord(variant((r) => { r['ephemeralPublicKey'] = `0x03${'00'.repeat(32)}`; })))).toBe('error.stealthExport.invalidFile');
  });

  it('validates integers, block numbers, view tags, hashes and timestamps exactly', () => {
    const bad: ((r: { [key: string]: Json }) => void)[] = [
      (r) => { r['chainId'] = 0; }, (r) => { r['chainId'] = '11155111'; },
      (r) => { r['viewTag'] = '0x2'; }, (r) => { r['viewTag'] = '0x2020'; }, (r) => { r['viewTag'] = '0xAB'; },
      (r) => { (r['announcement'] as { [k: string]: Json })['blockNumber'] = '06000001'; },
      (r) => { (r['announcement'] as { [k: string]: Json })['blockNumber'] = '18446744073709551616'; },
      (r) => { (r['announcement'] as { [k: string]: Json })['blockNumber'] = 6000001; },
      (r) => { (r['announcement'] as { [k: string]: Json })['logIndex'] = '3'; },
      (r) => { (r['announcement'] as { [k: string]: Json })['blockHash'] = `0x${'A1'.repeat(32)}`; },
      (r) => { (r['announcement'] as { [k: string]: Json })['transactionHash'] = `0x${'b1'.repeat(31)}`; },
      (r) => { r['exportedAt'] = '2026-11-18T00:00:00.000Z'; }, (r) => { r['exportedAt'] = '2026-11-18T00:00:00+00:00'; },
      (r) => { r['exportedAt'] = '2026-02-30T00:00:00Z'; }, (r) => { r['exportedAt'] = '2026-11-18T24:00:00Z'; }, (r) => { r['exportedAt'] = 1; },
    ];
    for (const edit of bad) expect(code(() => api.parsePublicRecord(variant(edit))), edit.toString()).toBe('error.stealthExport.invalidFile');
    expect(api.parsePublicRecord(variant((r) => { (r['announcement'] as { [k: string]: Json })['blockNumber'] = '18446744073709551615'; })).announcement.blockNumber).toBe('18446744073709551615');
    expect(api.parsePublicRecord(variant((r) => { (r['announcement'] as { [k: string]: Json })['blockNumber'] = '0'; })).announcement.blockNumber).toBe('0');
    expect(api.parsePublicRecord(variant((r) => { delete (r['announcement'] as { [k: string]: Json })['transactionHash']; })).announcement).not.toHaveProperty('transactionHash');
  });

  it('never contains secret bytes; serializing refuses an invalid record', () => {
    for (const v of V.announcements) {
      const { record } = verified(v.id);
      const text = api.serializePublicRecord(record);
      const hex = v.expected.privateKey.slice(2);
      for (const needle of [hex, hex.toUpperCase(), hex.slice(0, 16), hex.slice(-16)]) expect(text).not.toContain(needle);
    }
    const { record } = verified('a1');
    expect(code(() => api.serializePublicRecord({ ...record, stealthAddress: record.stealthAddress.toLowerCase() }))).toBe('error.stealthExport.invalidRecord');
  });
});

describe('ghostpay-stealth-keypair-v1 files', () => {
  it('round-trips each scope with fresh randomness and never exposes the keys in plaintext', async () => {
    const items = ['a1', 'a2', 'a3', 'a4'].map((id) => verified(id));
    const first = await api.encryptPaymentKeys(items, { scope: 'all-discovered', passphrase: PASS, N });
    const second = await api.encryptPaymentKeys(items, { scope: 'all-discovered', passphrase: PASS, N });
    const h1 = headerOf(first); const h2 = headerOf(second);
    expect((h1['kdf'] as { salt: string }).salt).not.toBe((h2['kdf'] as { salt: string }).salt);
    expect((h1['cipher'] as { iv: string }).iv).not.toBe((h2['cipher'] as { iv: string }).iv);
    expect(Object.keys(parse(first))).toEqual(['format', 'version', 'scope', 'chainId', 'count', 'payments', 'kdf', 'cipher', 'ciphertext']);
    expect(api.inspectPaymentKeys(first)).toMatchObject({ scope: 'all-discovered', chainId: V.chainId, count: 4, kdf: { name: 'scrypt', N, r: 8, p: 1, dkLen: 32 }, cipher: { name: 'AES-256-GCM', tagLength: 128 } });
    for (const v of V.announcements) for (const text of [first, V.files.single.text, V.files.archive.text]) expect(text).not.toContain(v.expected.privateKey.slice(2));
    const out = await api.decryptPaymentKeys(first, PASS);
    const sorted = [...V.announcements].sort((x, y) => (x.expected.stealthAddress.toLowerCase() < y.expected.stealthAddress.toLowerCase() ? -1 : 1));
    expect(out.payments.map((p) => revealHex(p.secret))).toEqual(sorted.map((v) => v.expected.privateKey));
    const one = await api.encryptPaymentKeys([verified('a3')], { scope: 'selected', passphrase: PASS, N });
    expect(api.inspectPaymentKeys(one)).toMatchObject({ scope: 'selected', count: 1 });
  });

  it('uses the production scrypt profile by default', async () => {
    const text = await api.encryptPaymentKeys([verified('a1')], { scope: 'single', passphrase: PASS });
    expect(api.inspectPaymentKeys(text).kdf).toMatchObject({ N: 1 << 17, r: 8, p: 1 });
    expect(api.STEALTH_EXPORT_SCRYPT).toEqual({ N: 1 << 17, r: 8, p: 1 });
  });

  it('fails closed on a wrong passphrase, with the same diagnostic as tampering', async () => {
    expect(await codeOf(() => api.decryptPaymentKeys(V.files.single.text, `${PASS}!`))).toBe('error.stealthExport.wrongPassphraseOrModified');
    expect(await codeOf(() => api.decryptPaymentKeys(V.files.single.text, 7 as unknown as string))).toBe('error.stealthExport.wrongPassphraseOrModified');
  });

  it('authenticates every header field: a flip of any field is refused', async () => {
    const file = parse(V.files.archive.text);
    const leaves: (string | number)[][] = [];
    const walk = (v: Json, path: (string | number)[]): void => {
      if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...path, Array.isArray(v) ? Number(k) : k]);
      else if (path[0] !== 'ciphertext') leaves.push(path);
    };
    walk(file, []);
    expect(leaves.length).toBeGreaterThan(40);
    for (const path of leaves) {
      const copy = parse(V.files.archive.text);
      const parent = path.slice(0, -1).reduce<Json>((o, k) => (o as Record<string, Json>)[k] as Json, copy) as Record<string, Json>;
      const key = path[path.length - 1] as string;
      const value = parent[key] as Json;
      parent[key] = typeof value === 'number' ? value + 1 : typeof value === 'string' && /^0x[0-9a-f]+$/.test(value) ? value.slice(0, -1) + (value.endsWith('0') ? '1' : '0') : typeof value === 'string' ? `${value}x` : 'x';
      await expect(api.decryptPaymentKeys(pretty(copy), PASS), path.join('.')).rejects.toBeInstanceOf(PortableVaultError);
    }
  });

  it('binds valid-looking header changes through the AAD', async () => {
    const edits: ((f: { [key: string]: Json }) => void)[] = [
      (f) => { (f['kdf'] as { salt: string }).salt = `0x${'01'.repeat(15)}00`; },
      (f) => { (f['cipher'] as { iv: string }).iv = `0x${'02'.repeat(11)}03`; },
      (f) => { (f['kdf'] as { p: number }).p = 2; },
      (f) => { (f['kdf'] as { r: number }).r = 4; },
      (f) => { (f['kdf'] as { N: number }).N = 1 << 15; },
      (f) => { f['scope'] = 'selected'; },
      (f) => { f['chainId'] = 1; (f['payments'] as { chainId: number }[]).forEach((p) => { p.chainId = 1; }); },
    ];
    const entry = (f: { [key: string]: Json }): { [key: string]: Json } => (f['payments'] as { [key: string]: Json }[])[0] as { [key: string]: Json };
    const loc = (f: { [key: string]: Json }): { [key: string]: Json } => entry(f)['announcement'] as { [key: string]: Json };
    edits.push(
      (f) => { loc(f)['blockHash'] = `0x${'a2'.repeat(32)}`; },
      (f) => { loc(f)['blockNumber'] = '6000009'; },
      (f) => { loc(f)['logIndex'] = 4; },
      (f) => { loc(f)['transactionHash'] = `0x${'b2'.repeat(32)}`; },
      (f) => { delete loc(f)['transactionHash']; },
      (f) => { entry(f)['viewTag'] = '0x21'; },
      (f) => { entry(f)['ephemeralPublicKey'] = byId('a2').announcement.ephemeralPublicKey; },
      (f) => { entry(f)['exportedAt'] = '2026-11-18T00:00:01Z'; },
      (f) => { entry(f)['stealthAddress'] = byId('a2').expected.stealthAddress; (entry(f)['publicKey'] as { value: string }).value = byId('a2').expected.publicKey; },
    );
    for (const edit of edits) {
      const copy = parse(V.files.single.text);
      edit(copy);
      expect(api.inspectPaymentKeys(pretty(copy)).count).toBe(1);
      expect(await codeOf(() => api.decryptPaymentKeys(pretty(copy), PASS)), edit.toString()).toBe('error.stealthExport.wrongPassphraseOrModified');
    }
  });

  it('refuses ciphertext truncation or extension before the KDF and any ciphertext flip after it', async () => {
    const f = parse(V.files.single.text);
    const ct = f['ciphertext'] as string;
    for (const bad of [ct.slice(0, -2), `${ct}00`, '0x', ct.toUpperCase().replace('0X', '0x'), ct.slice(2)]) {
      expect(await codeOf(() => api.decryptPaymentKeys(pretty({ ...f, ciphertext: bad }), PASS))).toBe('error.stealthExport.invalidFile');
    }
    expect(scrypt).not.toHaveBeenCalled();
    for (const at of [2, 40, ct.length - 2]) {
      const flipped = ct.slice(0, at) + (ct[at] === '0' ? '1' : '0') + ct.slice(at + 1);
      expect(await codeOf(() => api.decryptPaymentKeys(pretty({ ...f, ciphertext: flipped }), PASS))).toBe('error.stealthExport.wrongPassphraseOrModified');
    }
  });

  it('rejects oversize files, bad KDF and cipher parameters, malformed text and wrong chains before any KDF work', async () => {
    const f = parse(V.files.single.text);
    const kdf = f['kdf'] as { [key: string]: Json };
    const withKdf = (over: { [key: string]: Json }): string => pretty({ ...f, kdf: { ...kdf, ...over } });
    const withCipher = (over: { [key: string]: Json }): string => pretty({ ...f, cipher: { ...(f['cipher'] as { [key: string]: Json }), ...over } });
    const bad = [
      withKdf({ N: 1 << 13 }), withKdf({ N: 1 << 19 }), withKdf({ N: 3 << 14 }), withKdf({ N: '16384' }), withKdf({ r: 0 }), withKdf({ r: 9 }),
      withKdf({ p: 0 }), withKdf({ p: 3 }), withKdf({ dkLen: 16 }), withKdf({ salt: `0x${'01'.repeat(15)}` }), withKdf({ salt: `0x${'01'.repeat(65)}` }),
      withKdf({ name: 'pbkdf2' }), withKdf({ extra: 1 }), withCipher({ iv: `0x${'02'.repeat(11)}` }), withCipher({ iv: `0x${'02'.repeat(16)}` }),
      withCipher({ tagLength: 96 }), withCipher({ name: 'AES-128-GCM' }), pretty({ ...f, kdf: { name: 'scrypt' } }),
      `\u00a0${V.files.single.text}`, V.files.single.text.replace('"count": 1,', '"count": 1,\n  "count": 1,'),
      pretty({ ...f, extra: true }), pretty({ ...f, scope: 'everything' }), pretty({ ...f, count: 0 }), pretty({ ...f, count: 2 }),
      pretty({ ...f, payments: {} }), pretty({ ...f, chainId: 0 }),
    ];
    for (const text of bad) expect(await codeOf(() => api.decryptPaymentKeys(text, PASS)), text.slice(0, 400)).toBe('error.stealthExport.invalidFile');
    expect(await codeOf(() => api.decryptPaymentKeys(V.files.single.text + ' '.repeat(api.STEALTH_EXPORT_LIMITS.keypairFileBytes), PASS))).toBe('error.stealthExport.tooLarge');
    expect(await codeOf(() => api.decryptPaymentKeys(V.files.single.text, PASS, { expectedChainId: 1 }))).toBe('error.stealthExport.wrongChain');
    expect(await codeOf(() => api.decryptPaymentKeys(V.files.single.text, PASS, { expectedChainId: 0 }))).toBe('error.stealthExport.invalidChain');
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('rejects scope and count mismatches, unsorted entries, duplicates, mixed chains and another scheme in the header', () => {
    const f = parse(V.files.archive.text);
    const payments = f['payments'] as { [key: string]: Json }[];
    const [p0, p1, p2] = payments as [{ [key: string]: Json }, { [key: string]: Json }, { [key: string]: Json }];
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, scope: 'single' })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, count: 2 })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, payments: [p1, p0, p2] })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, payments: [p0, p0, p2] })))).toBe('error.stealthExport.duplicate');
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, payments: [p0, p1, { ...p2, chainId: 1 }] })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, payments: [p0, p1, { ...p2, schemeId: 2 }] })))).toBe('error.stealthExport.unsupportedScheme');
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, payments: [p0, p1, { ...p2, extra: 1 }] })))).toBe('error.stealthExport.invalidFile');
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, format: 'ghostpay-stealth-keypair-v2' })))).toBe('error.stealthExport.unsupportedVersion');
    expect(code(() => api.inspectPaymentKeys(pretty({ ...f, version: 3 })))).toBe('error.stealthExport.unsupportedVersion');
  });

  it('checks every decrypted scalar against its record and imports atomically, wiping every secret and the plaintext', async () => {
    const header = headerOf(V.files.archive.text);
    const keys = V.files.archive.announcements.map((id) => byId(id).expected.privateKey);
    const body = (list: readonly string[]): string => canonicalize({ privateKeys: list });
    const minted: Uint8Array[] = [];
    scalarFromBytes.mockImplementation((bytes) => { const s = realScalar(bytes); minted.push(s); return s; });
    const plaintexts: ArrayBuffer[] = [];
    const decrypt = globalThis.crypto.subtle.decrypt.bind(globalThis.crypto.subtle);
    const spy = vi.spyOn(globalThis.crypto.subtle, 'decrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['decrypt']>) => {
      const out = await decrypt(...args);
      plaintexts.push(out);
      return out;
    });
    try {
      const swapped = sealWith(KEYPAIR_DOMAIN, header, body([keys[0] as string, keys[2] as string, keys[1] as string]));
      expect(await codeOf(() => api.decryptPaymentKeys(swapped, PASS))).toBe('error.stealthExport.keyDoesNotMatch');
      expect(minted).toHaveLength(3);
      const n = `0x${CURVE_ORDER.toString(16)}`;
      for (const third of [`0x${'ff'.repeat(32)}`, n, `0x${'00'.repeat(32)}`]) {
        expect(await codeOf(() => api.decryptPaymentKeys(sealWith(KEYPAIR_DOMAIN, header, body([keys[0] as string, keys[1] as string, third])), PASS))).toBe('error.stealthExport.invalidFile');
      }
      const nonHex = body(keys).replace(/"0x[0-9a-f]/, '"0xg');
      expect(await codeOf(() => api.decryptPaymentKeys(sealWith(KEYPAIR_DOMAIN, header, nonHex), PASS))).toBe('error.stealthExport.invalidFile');
      const spaced = body(keys).replace('{"privateKeys":', '{"privateKeys" :').replace('","0x', '",0x');
      expect(await codeOf(() => api.decryptPaymentKeys(sealWith(KEYPAIR_DOMAIN, header, spaced), PASS))).toBe('error.stealthExport.invalidFile');
      expect(minted.length).toBeGreaterThan(3);
      for (const s of minted) expect(Array.from(s).every((b) => b === 0)).toBe(true);
      expect(plaintexts).toHaveLength(6);
      for (const p of plaintexts) expect(new Uint8Array(p).every((b) => b === 0)).toBe(true);
      const ok = await api.decryptPaymentKeys(V.files.archive.text, PASS);
      expect(new Uint8Array(plaintexts[plaintexts.length - 1] as ArrayBuffer).every((b) => b === 0)).toBe(true);
      expect(ok.payments.map((p) => revealHex(p.secret))).toEqual(keys);
    } finally {
      spy.mockRestore();
      scalarFromBytes.mockImplementation(realScalar);
    }
  });
});

describe('K05 bulk export rules', () => {
  it('collapses replays of one address to the earliest locator and ignores input order', async () => {
    const a1 = verified('a1');
    const later = verified('a1', { blockNumber: 6000005n, logIndex: 0, blockHash: `0x${'e5'.repeat(32)}` });
    const sameBlockLaterLog = verified('a1', { logIndex: 9 });
    const sameLocatorOtherHash = verified('a1', { blockHash: `0x${'ff'.repeat(32)}` });
    const sameLocatorLowerHash = verified('a1', { blockHash: `0x${'00'.repeat(32)}` });
    const inputs = [later, sameBlockLaterLog, sameLocatorOtherHash, a1, sameLocatorLowerHash, verified('a2')];
    const forward = api.inspectPaymentKeys(await api.encryptPaymentKeys(inputs, { scope: 'selected', passphrase: PASS, N }));
    const backward = api.inspectPaymentKeys(await api.encryptPaymentKeys([...inputs].reverse(), { scope: 'selected', passphrase: PASS, N }));
    expect(forward.count).toBe(2);
    expect(forward.payments).toEqual(backward.payments);
    const kept = forward.payments.find((p) => p.stealthAddress === a1.record.stealthAddress);
    expect(kept?.announcement).toEqual({ ...a1.record.announcement, blockHash: `0x${'00'.repeat(32)}` });
    const replayOnly = await api.encryptPaymentKeys([later, a1], { scope: 'single', passphrase: PASS, N });
    expect(api.inspectPaymentKeys(replayOnly).payments[0]?.announcement).toEqual(a1.record.announcement);
    const tie = verified('a1', { transactionHash: undefined as unknown as string });
    const tied = api.inspectPaymentKeys(await api.encryptPaymentKeys([a1, { ...tie, record: { ...tie.record, exportedAt: '2026-11-18T00:00:01Z' } }], { scope: 'single', passphrase: PASS, N }));
    expect(tied.payments[0]?.exportedAt).toBe(V.exportedAt);
  });

  it('refuses a conflict, mixed chains, scope mismatches and more than the maximum count', async () => {
    const a1 = verified('a1');
    const conflicting = { ...a1, record: { ...a1.record, ephemeralPublicKey: byId('a2').announcement.ephemeralPublicKey } };
    expect(await codeOf(() => api.encryptPaymentKeys([a1, conflicting], { scope: 'all-discovered', passphrase: PASS, N }))).toBe('error.stealthExport.conflict');
    const elsewhere = syntheticPayment({ chainId: 1 });
    expect(await codeOf(() => api.encryptPaymentKeys([a1, elsewhere], { scope: 'selected', passphrase: PASS, N }))).toBe('error.stealthExport.mixedChains');
    expect(await codeOf(() => api.encryptPaymentKeys([a1, verified('a2')], { scope: 'single', passphrase: PASS, N }))).toBe('error.stealthExport.scopeMismatch');
    expect(await codeOf(() => api.encryptPaymentKeys([], { scope: 'selected', passphrase: PASS, N }))).toBe('error.stealthExport.scopeMismatch');
    expect(await codeOf(() => api.encryptPaymentKeys([a1], { scope: 'everything' as 'single', passphrase: PASS, N }))).toBe('error.stealthExport.scopeMismatch');
    expect(await codeOf(() => api.encryptPaymentKeys('a1' as unknown as VerifiedStealthPayment[], { scope: 'selected', passphrase: PASS, N }))).toBe('error.stealthExport.scopeMismatch');
    const many = Array.from({ length: api.STEALTH_EXPORT_LIMITS.maxPayments + 1 }, () => syntheticPayment());
    expect(await codeOf(() => api.encryptPaymentKeys(many, { scope: 'all-discovered', passphrase: PASS, N }))).toBe('error.stealthExport.tooMany');
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('exports and imports the maximum archive within the file size limit', async () => {
    const max = Array.from({ length: api.STEALTH_EXPORT_LIMITS.maxPayments }, () => syntheticPayment({
      chainId: Number.MAX_SAFE_INTEGER, blockNumber: '18446744073709551615', logIndex: Number.MAX_SAFE_INTEGER, transactionHash: `0x${'ef'.repeat(32)}`,
    }));
    const text = await api.encryptPaymentKeys(max, { scope: 'all-discovered', passphrase: PASS, N });
    expect(text.length).toBeLessThanOrEqual(api.STEALTH_EXPORT_LIMITS.keypairFileBytes);
    const out = await api.decryptPaymentKeys(text, PASS, { expectedChainId: Number.MAX_SAFE_INTEGER });
    expect(out.payments).toHaveLength(max.length);
    const want = new Map(max.map((m) => [m.record.stealthAddress, revealHex(m.secret)]));
    for (const p of out.payments) expect(revealHex(p.secret)).toBe(want.get(p.record.stealthAddress));
  });

  it('refuses a secret that does not control its record, an invalid record, a weak passphrase and an invalid cost', async () => {
    const a1 = verified('a1');
    const a2 = verified('a2');
    expect(await codeOf(() => api.encryptPaymentKeys([{ record: a1.record, secret: a2.secret }], { scope: 'single', passphrase: PASS, N }))).toBe('error.stealthExport.keyDoesNotMatch');
    expect(await codeOf(() => api.encryptPaymentKeys([{ record: a1.record, secret: 'secret' as unknown as SecretScalar }], { scope: 'single', passphrase: PASS, N }))).toBe('error.stealthExport.keyDoesNotMatch');
    expect(await codeOf(() => api.encryptPaymentKeys([{ record: a1.record, secret: new Uint8Array(32) as SecretScalar }], { scope: 'single', passphrase: PASS, N }))).toBe('error.stealthExport.keyDoesNotMatch');
    expect(await codeOf(() => api.encryptPaymentKeys([{ ...a1, record: { ...a1.record, viewTag: '0xZZ' } }], { scope: 'single', passphrase: PASS, N }))).toBe('error.stealthExport.invalidRecord');
    expect(await codeOf(() => api.encryptPaymentKeys([a1], { scope: 'single', passphrase: 'short', N }))).toBe('error.keystore.passphraseShort');
    expect(await codeOf(() => api.encryptPaymentKeys([a1], { scope: 'single', passphrase: 'passwordpassword', N }))).toBe('error.keystore.passphraseWeak');
    expect(await codeOf(() => api.encryptPaymentKeys([a1], { scope: 'single', passphrase: undefined as unknown as string, N }))).toBe('error.keystore.passphraseShort');
    for (const bad of [1000, 1 << 19, 3 << 14, 1.5]) expect(await codeOf(() => api.encryptPaymentKeys([a1], { scope: 'single', passphrase: PASS, N: bad }))).toBe('error.stealthExport.invalidScryptCost');
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('checks every input key against its own record before deduplication, whatever the input order (CR-1)', async () => {
    const good = verified('a1');
    const other = verified('a2');
    const later = verified('a1', { blockNumber: 6000005n, logIndex: 0, blockHash: `0x${'e5'.repeat(32)}` });
    // Each `bad` names one of good's records (or a replay of it) with a key that does not control it; deduplication
    // would drop it beside `good`, so only a check of every input entry can see it.
    const bads: VerifiedStealthPayment[] = [
      { record: good.record, secret: other.secret },
      { record: good.record, secret: 'secret' as unknown as SecretScalar },
      { record: good.record, secret: new Uint8Array(32) as SecretScalar },
      { record: later.record, secret: other.secret },
    ];
    for (const bad of bads) {
      for (const items of [[good, bad], [bad, good], [good, other, bad], [bad, other, good]]) {
        const scope = items.length === 2 ? 'single' : 'selected';
        expect(await codeOf(() => api.encryptPaymentKeys(items, { scope, passphrase: PASS, N }))).toBe('error.stealthExport.keyDoesNotMatch');
      }
    }
    expect(scrypt).not.toHaveBeenCalled();
    const duplicate = verified('a1');
    expect(duplicate.secret).not.toBe(good.secret);
    const once = api.inspectPaymentKeys(await api.encryptPaymentKeys([good, duplicate, later], { scope: 'single', passphrase: PASS, N }));
    expect(once.count).toBe(1);
    expect(once.payments[0]).toEqual(good.record);
    const conflicting = { ...good, record: { ...good.record, ephemeralPublicKey: byId('a2').announcement.ephemeralPublicKey } };
    for (const items of [[good, conflicting], [conflicting, good]]) {
      expect(await codeOf(() => api.encryptPaymentKeys(items, { scope: 'all-discovered', passphrase: PASS, N }))).toBe('error.stealthExport.conflict');
    }
  });

  it('wipes the encryption plaintext after sealing', async () => {
    const seen: Uint8Array[] = [];
    const encrypt = globalThis.crypto.subtle.encrypt.bind(globalThis.crypto.subtle);
    const spy = vi.spyOn(globalThis.crypto.subtle, 'encrypt').mockImplementation((algorithm, key, data) => {
      seen.push(data as Uint8Array);
      return encrypt(algorithm, key, data);
    });
    try {
      await api.encryptPaymentKeys([verified('a1')], { scope: 'single', passphrase: PASS, N });
      await api.encryptMasterBackup(SELLER, { passphrase: PASS, exportedAt: new Date(V.exportedAt), N });
    } finally {
      spy.mockRestore();
    }
    expect(seen).toHaveLength(2);
    for (const data of seen) expect(data.every((b) => b === 0)).toBe(true);
  });

  it('refuses to start without Web Crypto, before any KDF work', async () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(await codeOf(() => api.encryptPaymentKeys([verified('a1')], { scope: 'single', passphrase: PASS, N }))).toBe('error.stealthExport.noWebCrypto');
    expect(await codeOf(() => api.decryptMasterBackup(V.files.master.text, PASS))).toBe('error.stealthExport.noWebCrypto');
    const item = verified('a1');
    vi.stubGlobal('crypto', undefined);
    expect(await codeOf(() => api.encryptPaymentKeys([item], { scope: 'single', passphrase: PASS, N }))).toBe('error.stealthExport.noWebCrypto');
    vi.stubGlobal('crypto', { subtle: real.subtle });
    expect(await codeOf(() => api.encryptMasterBackup(SELLER, { passphrase: PASS, exportedAt: new Date(V.exportedAt), N }))).toBe('error.stealthExport.noWebCrypto');
    expect(scrypt).not.toHaveBeenCalled();
  });
});

describe('ghostpay-stealth-master-v1 backups', () => {
  it('round-trips fresh master keys with the documented header and no signing key', async () => {
    const keys = generateKeySet();
    const text = await api.encryptMasterBackup(keys, { passphrase: PASS, exportedAt: new Date('2027-01-02T03:04:05.678Z'), N });
    const f = parse(text);
    expect(Object.keys(f)).toEqual(['format', 'version', 'schemeId', 'derivation', 'metaAddress', 'spendingPublicKey', 'viewingPublicKey', 'exportedAt', 'kdf', 'cipher', 'ciphertext']);
    const header = api.inspectMasterBackup(text);
    expect(header).toMatchObject({ format: 'ghostpay-stealth-master-v1', schemeId: 1, derivation: 'eip5564-scheme1-adr0001', exportedAt: '2027-01-02T03:04:05Z' });
    expect(header.metaAddress).toBe(encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(hexToBytes(header.spendingPublicKey.slice(2))), viewingPublicKey: parseCompressedPoint(hexToBytes(header.viewingPublicKey.slice(2))) }));
    for (const secret of [keys.spendingSecret, keys.viewingSecret]) expect(text).not.toContain(bytesToHex(unsafeRevealSecret(secret)));
    expect(text).not.toMatch(/signing/i);
    const out = await api.decryptMasterBackup(text, PASS);
    expect(revealHex(out.spendingSecret)).toBe(revealHex(keys.spendingSecret));
    expect(revealHex(out.viewingSecret)).toBe(revealHex(keys.viewingSecret));
  });

  it('refuses invalid master input secrets and times', async () => {
    const opts = { passphrase: PASS, exportedAt: new Date(V.exportedAt), N };
    expect(await codeOf(() => api.encryptMasterBackup({ ...SELLER, viewingSecret: SELLER.spendingSecret }, opts))).toBe('error.stealthExport.masterKeysDoNotMatch');
    expect(await codeOf(() => api.encryptMasterBackup({ ...SELLER, viewingSecret: new Uint8Array(32) as SecretScalar }, opts))).toBe('error.stealthExport.masterKeysDoNotMatch');
    expect(await codeOf(() => api.encryptMasterBackup({ ...SELLER, spendingSecret: 'x' as unknown as SecretScalar }, opts))).toBe('error.stealthExport.masterKeysDoNotMatch');
    expect(await codeOf(() => api.encryptMasterBackup(SELLER, { ...opts, exportedAt: new Date(Number.NaN) }))).toBe('error.stealthExport.invalidTime');
    expect(await codeOf(() => api.encryptMasterBackup(SELLER, { ...opts, N: 1 << 20 }))).toBe('error.stealthExport.invalidScryptCost');
    expect(await codeOf(() => api.encryptMasterBackup(SELLER, { ...opts, passphrase: 'ghostpayghostpay' }))).toBe('error.keystore.passphraseWeak');
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('rejects a signing-key field, header inconsistencies and bad parameters before the KDF', async () => {
    const f = parse(V.files.master.text);
    const bad = [
      pretty({ ...f, signingKey: `0x${'77'.repeat(32)}` }), pretty({ ...f, signingPublicKey: f['spendingPublicKey'] as string }),
      pretty({ ...f, metaAddress: `st:eth:0x${(f['viewingPublicKey'] as string).slice(2)}${(f['spendingPublicKey'] as string).slice(2)}` }),
      pretty({ ...f, viewingPublicKey: f['spendingPublicKey'] as string }), pretty({ ...f, derivation: 'eip5564-scheme1' }),
      pretty({ ...f, spendingPublicKey: (f['spendingPublicKey'] as string).toUpperCase() }), pretty({ ...f, exportedAt: '2026-11-18' }),
      pretty({ ...f, kdf: { ...(f['kdf'] as object), N: 1 << 20 } }), pretty({ ...f, ciphertext: (f['ciphertext'] as string).slice(0, -2) }),
      pretty({ ...f, metaAddress: (f['metaAddress'] as string).toUpperCase() }),
    ];
    for (const text of bad) expect(await codeOf(() => api.decryptMasterBackup(text, PASS)), text.slice(0, 300)).toBe('error.stealthExport.invalidFile');
    expect(await codeOf(() => api.decryptMasterBackup(pretty({ ...f, schemeId: 2 }), PASS))).toBe('error.stealthExport.unsupportedScheme');
    expect(await codeOf(() => api.decryptMasterBackup(pretty({ ...f, format: 'ghostpay-stealth-master-v2' }), PASS))).toBe('error.stealthExport.unsupportedVersion');
    expect(await codeOf(() => api.decryptMasterBackup(V.files.master.text + ' '.repeat(api.STEALTH_EXPORT_LIMITS.masterFileBytes), PASS))).toBe('error.stealthExport.tooLarge');
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('authenticates every master header field and fails closed on a wrong passphrase', async () => {
    const edits: ((f: { [key: string]: Json }) => void)[] = [
      (f) => { (f['kdf'] as { salt: string }).salt = `0x${'03'.repeat(15)}00`; },
      (f) => { (f['cipher'] as { iv: string }).iv = `0x${'04'.repeat(11)}05`; },
      (f) => { (f['kdf'] as { p: number }).p = 2; },
      (f) => { f['exportedAt'] = '2026-11-18T00:00:01Z'; },
      (f) => { const s = f['spendingPublicKey'] as string; f['spendingPublicKey'] = f['viewingPublicKey'] ?? null; f['viewingPublicKey'] = s; f['metaAddress'] = `st:eth:0x${(f['spendingPublicKey'] as string).slice(2)}${s.slice(2)}`; },
    ];
    for (const edit of edits) {
      const copy = parse(V.files.master.text);
      edit(copy);
      expect(api.inspectMasterBackup(pretty(copy)).derivation).toBe('eip5564-scheme1-adr0001');
      expect(await codeOf(() => api.decryptMasterBackup(pretty(copy), PASS)), edit.toString()).toBe('error.stealthExport.wrongPassphraseOrModified');
    }
    expect(await codeOf(() => api.decryptMasterBackup(V.files.master.text, 'quasar-tangelo-wombat-ferry-oboe-kil'))).toBe('error.stealthExport.wrongPassphraseOrModified');
  });

  it('rejects out-of-range body scalars and wipes every decrypted secret', async () => {
    const header = headerOf(V.files.master.text);
    const minted: Uint8Array[] = [];
    scalarFromBytes.mockImplementation((bytes) => { const s = realScalar(bytes); minted.push(s); return s; });
    try {
      for (const view of [`0x${'00'.repeat(32)}`, `0x${CURVE_ORDER.toString(16)}`]) {
        const text = sealWith(MASTER_DOMAIN, header, canonicalize({ spendingKey: V.seller.spendingPrivateKey, viewingKey: view }));
        expect(await codeOf(() => api.decryptMasterBackup(text, PASS))).toBe('error.stealthExport.invalidFile');
      }
      const swapped = sealWith(MASTER_DOMAIN, header, canonicalize({ spendingKey: V.seller.viewingPrivateKey, viewingKey: V.seller.spendingPrivateKey }));
      expect(await codeOf(() => api.decryptMasterBackup(swapped, PASS))).toBe('error.stealthExport.masterKeysDoNotMatch');
      expect(minted.length).toBeGreaterThanOrEqual(4);
      for (const s of minted) expect(Array.from(s).every((b) => b === 0)).toBe(true);
    } finally {
      scalarFromBytes.mockImplementation(realScalar);
    }
  });
});

describe('format separation, routing and diagnostics', () => {
  it('wipes the temporary KDF passphrase bytes after success and every failure', async () => {
    const passwordBuffers: Uint8Array[] = [];
    const { scryptAsync: realScrypt } = await vi.importActual<typeof import('@noble/hashes/scrypt.js')>('@noble/hashes/scrypt.js');
    const capture = (pass: Parameters<typeof realScrypt>[0]): void => {
      expect(pass).toBeInstanceOf(Uint8Array);
      passwordBuffers.push(pass as Uint8Array);
    };
    scrypt.mockImplementationOnce((pass, salt, options) => {
      capture(pass);
      return realScrypt(pass, salt, options);
    });
    const recovered = await api.decryptPaymentKeys(V.files.single.text, PASS);
    for (const payment of recovered.payments) payment.secret.fill(0);

    scrypt.mockImplementationOnce((pass) => {
      capture(pass);
      return Promise.reject(new Error('synthetic KDF failure'));
    });
    await expect(api.decryptMasterBackup(V.files.master.text, PASS)).rejects.toThrow('synthetic KDF failure');

    const key = new Uint8Array(32).fill(0x42);
    scrypt.mockImplementationOnce((pass) => {
      capture(pass);
      return Promise.resolve(key);
    });
    const importKey = vi.spyOn(globalThis.crypto.subtle, 'importKey').mockRejectedValueOnce(new Error('synthetic import failure'));
    try {
      await expect(api.decryptMasterBackup(V.files.master.text, PASS)).rejects.toThrow('synthetic import failure');
    } finally {
      importKey.mockRestore();
    }
    expect(passwordBuffers).toHaveLength(3);
    for (const bytes of passwordBuffers) expect(bytes.every((byte) => byte === 0)).toBe(true);
    expect(key.every((byte) => byte === 0)).toBe(true);
  });

  it('never opens one format as another, even with the right passphrase', async () => {
    const keystore = createKeystoreApi();
    const legacy = await keystore.encryptKeystore(
      { spendingKey: unsafeRevealSecret(SELLER.spendingSecret), viewingKey: unsafeRevealSecret(SELLER.viewingSecret), signingKey: hexToBytes('77'.repeat(32)) },
      { metaAddress: V.seller.metaAddress, signer: bytesToHex(secp256k1.getPublicKey(hexToBytes('77'.repeat(32)), true)) },
      PASS,
      { N },
    );
    scrypt.mockClear();
    for (const text of [V.files.master.text, V.files.public.text, legacy]) expect(await codeOf(() => api.decryptPaymentKeys(text, PASS))).toBe('error.stealthExport.invalidFile');
    for (const text of [V.files.single.text, V.files.archive.text, V.files.public.text, legacy]) expect(await codeOf(() => api.decryptMasterBackup(text, PASS))).toBe('error.stealthExport.invalidFile');
    for (const text of [V.files.single.text, V.files.master.text]) expect(code(() => api.parsePublicRecord(text))).toBe(text.length > api.STEALTH_EXPORT_LIMITS.publicRecordBytes ? 'error.stealthExport.tooLarge' : 'error.stealthExport.invalidFile');
    expect(scrypt).not.toHaveBeenCalled();
    for (const text of [V.files.single.text, V.files.master.text, V.files.public.text]) expect(() => keystore.validateKeystoreEnvelope(text)).toThrow(PortableVaultError);
    const back = await keystore.decryptKeystore(legacy, PASS);
    expect(bytesToHex(back.spendingKey)).toBe(V.seller.spendingPrivateKey.slice(2));
  });

  it('detects each format without throwing on anything else', () => {
    expect(api.detectStealthExportFormat(V.files.public.text)).toBe('public');
    expect(api.detectStealthExportFormat(V.files.single.text)).toBe('keypair');
    expect(api.detectStealthExportFormat(V.files.archive.text)).toBe('keypair');
    expect(api.detectStealthExportFormat(V.files.master.text)).toBe('master');
    for (const junk of ['', '{', 'null', '[]', '"ghostpay-stealth-public-v1"', '{"format":1}', '{"format":"ghostpay-stealth-public-v2"}', '\u00e9', 'x'.repeat(api.STEALTH_EXPORT_LIMITS.keypairFileBytes + 1), '{"v":1}', '[[[[[[[[[[[[1]]]]]]]]]]]]']) {
      expect(api.detectStealthExportFormat(junk)).toBeUndefined();
    }
    expect(api.detectStealthExportFormat(undefined)).toBeUndefined();
    expect(api.detectStealthExportFormat(7)).toBeUndefined();
  });

  it('recognizes another version of each export family under the detection bounds, without throwing (CR-3)', () => {
    const claim = (format: Json, extra: { [key: string]: Json } = {}): string => pretty({ format, version: 2, ...extra });
    for (const family of ['public', 'keypair', 'master']) {
      for (const version of ['2', '10', '0', '01', '18446744073709551616']) {
        const text = claim(`ghostpay-stealth-${family}-v${version}`);
        expect(api.isUnsupportedStealthExportVersion(text), text).toBe(true);
        expect(api.detectStealthExportFormat(text)).toBeUndefined();
      }
    }
    expect(api.isUnsupportedStealthExportVersion('{"format":"ghostpay-stealth-keypair-v2"}')).toBe(true);
    // The supported identifiers route to their parsers, which report a later `version` of v1 themselves.
    for (const text of [V.files.public.text, V.files.single.text, V.files.archive.text, V.files.master.text]) {
      expect(api.isUnsupportedStealthExportVersion(text)).toBe(false);
      expect(api.isUnsupportedStealthExportVersion(pretty({ ...parse(text), version: 2 }))).toBe(false);
    }
    expect(code(() => api.parsePublicRecord(pretty({ ...parse(V.files.public.text), version: 2 })))).toBe('error.stealthExport.unsupportedVersion');
    const limit = api.STEALTH_EXPORT_LIMITS.keypairFileBytes;
    const padded = claim('ghostpay-stealth-keypair-v2', { pad: '' });
    for (const junk of [
      '', '{', 'null', '[]', '7', '"ghostpay-stealth-keypair-v2"', '["ghostpay-stealth-keypair-v2"]', '{"format":2}', '{"v":2}',
      claim('ghostpay-stealth-other-v2'), claim('ghostpay-stealth-keypair-v'), claim('ghostpay-stealth-keypair-v2x'),
      claim('ghostpay-stealth-keypair-v2 '), claim(' ghostpay-stealth-keypair-v2'), claim('GHOSTPAY-STEALTH-KEYPAIR-V2'),
      claim('ghostpay-stealth-keypair-v-2'), claim('ghostpay-stealth-keypair-v2\n'), claim('ghostpay-stealth-keypair-2'),
      claim('ghostpay-stealth-keypair-v1'), claim('ghostpay-keystore-v2'), claim(['ghostpay-stealth-keypair-v2']),
      claim('ghostpay-stealth-keypair-v2', { note: '\u00e9' }),
      '{"format":"ghostpay-stealth-keypair-v2","format":"ghostpay-stealth-keypair-v2"}',
      '{"format":"ghostpay-stealth-keypair-v2","version":-2}',
      '{"format":"ghostpay-stealth-keypair-v2"} {}',
      padded.replace('"pad": ""', `"pad": "${'x'.repeat(limit - padded.length + 1)}"`),
      '[[[[[[[[[[[[1]]]]]]]]]]]]',
    ]) {
      expect(api.isUnsupportedStealthExportVersion(junk), junk.slice(0, 80)).toBe(false);
    }
    const atLimit = padded.replace('"pad": ""', `"pad": "${'x'.repeat(limit - padded.length)}"`);
    expect(atLimit.length).toBe(limit);
    expect(api.isUnsupportedStealthExportVersion(atLimit)).toBe(true);
    for (const value of [undefined, null, 7, {}, ['{"format":"ghostpay-stealth-keypair-v2"}']]) {
      expect(api.isUnsupportedStealthExportVersion(value)).toBe(false);
    }
  });

  it('refuses a raw key that does not control the record and an invalid record', () => {
    const a1 = verified('a1');
    const a2 = verified('a2');
    expect(code(() => api.formatRawPrivateKey(a1.record, a2.secret))).toBe('error.stealthExport.keyDoesNotMatch');
    expect(code(() => api.formatRawPrivateKey({ ...a1.record, chainId: 0 }, a1.secret))).toBe('error.stealthExport.invalidRecord');
  });

  it('keeps diagnostics free of keys, passphrases and file contents', async () => {
    const secretHex = byId('a1').expected.privateKey.slice(2);
    const failures: unknown[] = [];
    const capture = async (run: () => unknown): Promise<void> => { try { await run(); } catch (error) { failures.push(error); } };
    await capture(() => api.decryptPaymentKeys(V.files.single.text, 'PRIVATE PASSPHRASE 123'));
    await capture(() => api.decryptPaymentKeys(V.invalid.find((x) => x.id === 'keypair-bad-002')?.text ?? '', PASS));
    await capture(() => api.parsePublicRecord(`PRIVATE ${secretHex}`));
    await capture(() => api.formatRawPrivateKey(verified('a2').record, verified('a1').secret));
    await capture(() => api.encryptPaymentKeys([verified('a1')], { scope: 'single', passphrase: 'PRIVATE', N }));
    expect(failures).toHaveLength(5);
    for (const error of failures) {
      const shown = `${String(error)} ${JSON.stringify(error)} ${(error as Error).stack ?? ''}`;
      for (const needle of [secretHex, 'PRIVATE', PASS]) expect(shown).not.toContain(needle);
    }
  });

  it('localizes through the injected error constructor and display function', () => {
    class Localized extends Error {
      public constructor(public readonly descriptor: { key: string }) { super(`localized:${descriptor.key}`); }
    }
    const display = vi.fn((m: { key: string }) => m.key.toUpperCase());
    const local = createStealthExportApi(Localized, display);
    expect(() => local.parsePublicRecord('{')).toThrow('localized:error.stealthExport.invalidFile');
    expect(local.STEALTH_EXPORT_FILENAMES).toEqual({
      public: 'ghostpay-stealth-public.json', keypair: 'ghostpay-stealth-keypair.json', keypairs: 'ghostpay-stealth-keypairs.json',
      master: 'ghostpay-stealth-master.json', privateKey: 'ghostpay-stealth-private-key.txt',
    });
    expect([local.STEALTH_KEYPAIR_DOMAIN, local.STEALTH_MASTER_DOMAIN]).toEqual([KEYPAIR_DOMAIN, MASTER_DOMAIN]);
  });
});
