import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { compareToLoaded, exportSellerPairing, parsePublicMetaQr, parseSellerPairing, PublicSellerError } from './seller.js';

const SPEND = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const VIEW = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
const SIGNER = '025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc';
const META = `st:eth:0x${SPEND}${VIEW}`;
const SOURCE = { metaAddress: META, signerPublicKey: SIGNER };
const ALLOWED = [97, 84532, 11155111];
const base = { format: 'ghostpay-seller-public', v: 1, ...SOURCE, chainIds: [84532] };

/** Independent checksum constructor prevents a bad checksum from masking a schema regression. */
function checked(over: Record<string, unknown> = {}): string {
  const value = { ...base, ...over };
  const body = JSON.stringify(['ghostpay-seller-public', 1, value.metaAddress, value.signerPublicKey, value.chainIds]);
  return JSON.stringify({ ...value, check: bytesToHex(sha256(utf8ToBytes(body))).slice(0, 8) });
}

describe('shared public seller codec', () => {
  it('round-trips the existing GUI format with a caller-owned supported chain policy', () => {
    const text = exportSellerPairing(SOURCE, [11155111, 84532, 97, 97], ALLOWED);
    expect(parseSellerPairing(text, ALLOWED)).toEqual({ ...SOURCE, chainIds: [97, 84532, 11155111] });
    expect(parseSellerPairing(checked(), ALLOWED)).toEqual({ ...SOURCE, chainIds: [84532] });
    expect(parseSellerPairing(exportSellerPairing(SOURCE, [], ALLOWED), ALLOWED).chainIds).toEqual([]);
    expect(compareToLoaded(parseSellerPairing(checked(), ALLOWED), SOURCE)).toBe('same');
    expect(compareToLoaded(parseSellerPairing(checked(), ALLOWED), undefined)).toBe('none');
    expect(compareToLoaded(parseSellerPairing(checked(), ALLOWED), { ...SOURCE, signerPublicKey: SPEND })).toBe('different');
    expect(compareToLoaded(parseSellerPairing(checked(), ALLOWED), { ...SOURCE, metaAddress: `st:eth:0x${VIEW}${SPEND}` })).toBe('different');
  });

  it.each(['not json', '[]', 'null', '1', '{}', '{"v":1,"v":1}', ' '.repeat(2049), 'é'.repeat(1100)])('refuses malformed/oversized seller documents', (text) => {
    expect(() => parseSellerPairing(text, ALLOWED)).toThrow(PublicSellerError);
  });

  it.each([
    { v: 2 }, { format: 'ghostpay-keystore' }, { extra: true }, { secret: 'private' },
    { chainIds: '84532' }, { chainIds: [1] }, { chainIds: [1.5] }, { chainIds: ['84532'] },
    { chainIds: [84532, 84532] }, { chainIds: [11155111, 84532] }, { chainIds: new Array<number>(17).fill(84532) },
    { metaAddress: 1 }, { metaAddress: 'bad' }, { metaAddress: `st:eth:0x${'0'.repeat(132)}` },
    { metaAddress: `st:eth:0x${SPEND.toUpperCase()}${VIEW.toUpperCase()}` },
    { signerPublicKey: 1 }, { signerPublicKey: 'invalid' }, { signerPublicKey: `02${'f'.repeat(64)}` },
    { signerPublicKey: SPEND }, { signerPublicKey: VIEW },
  ])('rejects unsafe public fields despite a matching checksum', (over) => {
    expect(() => parseSellerPairing(checked(over), ALLOWED)).toThrow(PublicSellerError);
  });

  it('refuses changed checksums and never silently broadens the allowlist', () => {
    expect(() => parseSellerPairing(checked().replace(/"check":"[0-9a-f]+"/, '"check":"00000000"'), ALLOWED)).toThrow(PublicSellerError);
    expect(() => parseSellerPairing(checked(), [])).toThrow(PublicSellerError);
    expect(() => exportSellerPairing(SOURCE, [Number.NaN], ALLOWED)).toThrow(PublicSellerError);
    expect(() => exportSellerPairing(SOURCE, [Number.MAX_SAFE_INTEGER + 1], ALLOWED)).toThrow(PublicSellerError);
  });
});

describe('strict public meta-address QR codec', () => {
  it('accepts the raw meta-address and existing versioned public envelope', () => {
    expect(parsePublicMetaQr(META)).toBe(META);
    expect(parsePublicMetaQr(JSON.stringify({ format: 'ghostpay-public-meta', v: 1, metaAddress: META }))).toBe(META);
  });

  it.each([
    'https://example.test/', 'x'.repeat(1025), 'é'.repeat(600), '{', '{}', '{"v":1,"v":1}',
    JSON.stringify({ format: 'private', v: 1, metaAddress: META }),
    JSON.stringify({ format: 'ghostpay-public-meta', v: 2, metaAddress: META }),
    JSON.stringify({ format: 'ghostpay-public-meta', v: 1, metaAddress: 1 }),
    JSON.stringify({ format: 'ghostpay-public-meta', v: 1, metaAddress: META, secret: 'x' }),
    `st:eth:0x${'f'.repeat(132)}`,
  ])('refuses unsupported or secret-bearing meta input', (text) => {
    expect(() => parsePublicMetaQr(text)).toThrow();
  });
});
