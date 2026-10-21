import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { manifestDigest, validateManifest } from '@ghostpay/chain-adapters';
import { afterEach, describe, expect, it } from 'vitest';
import { BROAD, applyConnectSrc, connectSrc, parseOrigins } from '../scripts/csp.mjs';
import { emitEmbedSri } from '../scripts/embed-sri.mjs';
import { parseReleaseKeys, validateDeployments } from '../scripts/validate-deployments.mjs';
import { fakeManifestJson } from './test/fakeManifest';

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'gp-build-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('validate-deployments (build step for the bundled manifests)', () => {
  it('accepts an empty directory, a README and a valid <chainId>.json', async () => {
    const d = tmp();
    expect(await validateDeployments(d)).toEqual([]);
    expect(await validateDeployments(join(d, 'missing'))).toEqual([]);
    writeFileSync(join(d, 'README.md'), 'x');
    writeFileSync(join(d, '84532.json'), fakeManifestJson(84532));
    expect(await validateDeployments(d)).toEqual([]);
  });
  it('fails the build for a wrong file name, a chain mismatch, bad JSON or an invalid manifest', async () => {
    const d = tmp();
    writeFileSync(join(d, 'base.json'), fakeManifestJson(84532));
    writeFileSync(join(d, '1.json'), fakeManifestJson(84532));
    writeFileSync(join(d, '2.json'), '{ nope');
    writeFileSync(join(d, '3.json'), JSON.stringify({ ...(JSON.parse(fakeManifestJson(3)) as object), feeBps: 100 }));
    writeFileSync(join(d, 'notes.txt'), 'x');
    const problems = await validateDeployments(d);
    expect(problems).toHaveLength(5);
    expect(problems.join('\n')).toMatch(/base\.json: only <chainId>\.json/);
    expect(problems.join('\n')).toMatch(/notes\.txt/);
  });
  it('with release keys, an unsigned or wrongly signed manifest fails the build', async () => {
    const sk = secp256k1.utils.randomSecretKey();
    const pub = hex(secp256k1.getPublicKey(sk, true));
    const d = tmp();
    writeFileSync(join(d, '84532.json'), fakeManifestJson(84532));
    expect((await validateDeployments(d, [pub])).join()).toMatch(/signature is missing or invalid/);
    const base = JSON.parse(fakeManifestJson(84532)) as Record<string, unknown>;
    const digest = Uint8Array.from((manifestDigest(validateManifest(base, 84532)).slice(2).match(/../g) ?? []).map((h) => parseInt(h, 16)));
    writeFileSync(join(d, '84532.json'), JSON.stringify({ ...base, signature: `0x${hex(secp256k1.sign(digest, sk, { prehash: false, lowS: true }))}` }));
    expect(await validateDeployments(d, [pub])).toEqual([]);
  });
  it('parses release keys strictly', () => {
    expect(parseReleaseKeys(undefined)).toEqual([]);
    expect(parseReleaseKeys('')).toEqual([]);
    const k = `02${'ab'.repeat(32)}`;
    expect(parseReleaseKeys(` ${k.toUpperCase()} , ${k}`)).toEqual([k, k]);
    expect(() => parseReleaseKeys('04' + 'ab'.repeat(64))).toThrow(/compressed/);
    expect(() => parseReleaseKeys('0xabc')).toThrow(/compressed/);
  });
});

describe('connect-src tightening (S3-11)', () => {
  const page = `connect-src 'self' https: wss:; worker-src 'self'`;
  it('leaves the broad default alone when no origins are configured', () => {
    expect(applyConnectSrc(page, [])).toBe(page);
    expect(connectSrc([])).toBe(BROAD);
  });
  it('replaces https: wss: with exactly the configured origins', () => {
    const o = parseOrigins('https://rpc.example.org, wss://ws.example.org:8546/ ,https://rpc.example.org');
    expect(o).toEqual(['https://rpc.example.org', 'wss://ws.example.org:8546']);
    expect(applyConnectSrc(page, o)).toBe(`connect-src 'self' https://rpc.example.org wss://ws.example.org:8546; worker-src 'self'`);
  });
  it('rejects anything that is not a bare https/wss origin', () => {
    for (const bad of ['http://a.test', 'https://a.test/path', 'https://u:p@a.test', 'https://a.test/?q=1', 'ftp://a.test', 'nope', 'https://a.test/#x']) {
      expect(() => parseOrigins(bad)).toThrow(/GHOSTPAY_CONNECT_ORIGINS/);
    }
  });
});

describe('embed SDK SRI (S3-10)', () => {
  it('writes a content-addressed copy, the SHA-384 SRI value and an immutable header rule', () => {
    const d = tmp();
    const body = 'console.log("embed v1");\n';
    writeFileSync(join(d, 'ghostpay-embed-v1.js'), body);
    writeFileSync(join(d, '_headers'), '/*\n  X: y\n');
    const r = emitEmbedSri(d);
    const sha256 = createHash('sha256').update(body).digest('hex');
    expect(r.file).toBe(`ghostpay-embed-v1.${sha256.slice(0, 12)}.js`);
    expect(r.integrity).toBe(`sha384-${createHash('sha384').update(body).digest('base64')}`);
    expect(readFileSync(join(d, r.file), 'utf8')).toBe(body);
    expect(JSON.parse(readFileSync(join(d, 'embed-sri.json'), 'utf8'))).toEqual(r);
    const headers = readFileSync(join(d, '_headers'), 'utf8');
    expect(headers).toContain(`/${r.file}\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n  Cache-Control: public, max-age=31536000, immutable`);
    // different bytes, different name
    writeFileSync(join(d, 'ghostpay-embed-v1.js'), `${body}//`);
    expect(emitEmbedSri(d).file).not.toBe(r.file);
  });
  it('works without a _headers file and fails when the SDK is missing', () => {
    const d = tmp();
    expect(() => emitEmbedSri(d)).toThrow(/missing/);
    mkdirSync(join(d, 'x'));
    writeFileSync(join(d, 'ghostpay-embed-v1.js'), 'a');
    expect(emitEmbedSri(d).integrity).toMatch(/^sha384-/);
    expect(existsSync(join(d, '_headers'))).toBe(false);
  });
});
