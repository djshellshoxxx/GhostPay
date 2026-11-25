/**
 * Browser compatibility and "no unintended network request" guarantees.
 *
 * Static: the shipped sources use no Node-only API, no network or storage API, and no dynamic code.
 * Runtime: with every network API replaced by a recording stub and `Buffer` removed (as in a
 * browser), the whole public surface runs with zero network calls. The real-Chromium run is
 * `scripts/browser-smoke.mjs` (see README).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mh from './index.js';
import { seededRng, SEED } from './testutil.testutil.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const sources = readdirSync(here)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'))
  .map((f) => ({ name: f, text: readFileSync(join(here, f), 'utf8') }));

const FORBIDDEN_IDENTIFIERS = new Set([
  // Node only
  'Buffer', 'process', 'require', '__dirname', '__filename', 'module', 'global',
  // network and messaging
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'Image', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'postMessage', 'RTCPeerConnection',
  // ambient state and DOM
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'location', 'cookieStore', 'console',
  // dynamic code and non-crypto randomness
  'eval', 'Function', 'setTimeout', 'setInterval',
]);

function offenders(text: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true);
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && FORBIDDEN_IDENTIFIERS.has(n.text)) {
      // `process`/`module`/... as a property name or declaration name is harmless; reading the global is not.
      const parent = n.parent;
      const isPropertyName = (ts.isPropertyAccessExpression(parent) && parent.name === n) || (ts.isPropertyAssignment(parent) && parent.name === n) || (ts.isPropertySignature(parent) && parent.name === n);
      if (!isPropertyName) found.push(`${fileName}: identifier ${n.text}`);
    }
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      const spec = n.moduleSpecifier;
      if (spec !== undefined && ts.isStringLiteral(spec) && (spec.text.startsWith('node:') || ['fs', 'path', 'crypto', 'os', 'child_process', 'http', 'https', 'net', 'url', 'util'].includes(spec.text))) found.push(`${fileName}: import ${spec.text}`);
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) found.push(`${fileName}: dynamic import()`);
    if (ts.isPropertyAccessExpression(n) && n.expression.getText(sf) === 'Math' && n.name.text === 'random') found.push(`${fileName}: Math.random`);
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'innerHTML') found.push(`${fileName}: innerHTML`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe('static: shipped sources are browser-safe and network-free', () => {
  it('finds at least the known modules', () => {
    expect(sources.map((s) => s.name)).toEqual(expect.arrayContaining(['guard.ts', 'web.ts', 'scan.ts', 'release.ts', 'direct.ts', 'validate.ts', 'errors.ts']));
  });
  it('uses no Node-only, network, storage, DOM or dynamic-code API', () => {
    const all = sources.flatMap((s) => offenders(s.text, s.name));
    expect(all).toEqual([]);
  });
  it('the scanner itself detects each forbidden construct (the check is not vacuous)', () => {
    // Source text for the scanner's self-test: parsed by the TypeScript compiler, never executed.
    const bad = "import fs from 'node:fs'; const a = fetch('x'); const b = Buffer.from('a'); const c = Math.random(); const d = import('x'); new WebSocket('x'); eval('1'); el.innerHTML = 'x'; localStorage.x; ";
    expect(offenders(bad, 'x.ts').length).toBeGreaterThanOrEqual(8);
    expect(offenders('const o = { process: 1 }; o.process; type T = { fetch: number };', 'x.ts')).toEqual([]);
  });
  it('package metadata: ESM, side-effect free, one entry point, only the reviewed runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(pkg.type).toBe('module');
    expect(pkg.sideEffects).toBe(false);
    expect(Object.keys(pkg.exports as object)).toEqual(['.']);
    expect(pkg.files).toEqual(['dist']);
    expect(Object.keys(pkg.dependencies as object).sort()).toEqual(['@ghostpay/core-crypto', '@noble/hashes', 'viem']);
    expect(pkg.scripts).not.toHaveProperty('postinstall');
    expect(pkg.scripts).not.toHaveProperty('preinstall');
  });
});

describe('runtime: a browser-like environment with every network API stubbed', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Calls every documented function once with valid input. */
  function exercise(): void {
    const rng = seededRng(1);
    const eph = mh.deriveInvoiceKeys(SEED, 0).keys.spendingPublicKey;
    mh.deriveChainKeys(SEED, 31337);
    mh.roundGross(123456789n, { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 100 });
    mh.addAmountNoise(1000n, { chainId: 31337, maxBps: 10 }, rng);
    mh.bucketGasLimit(21_000n, { chainId: 31337 });
    mh.assertOnlyAllowedTxFields({ from: '0x', to: '0x', data: '0x' });
    mh.encodeViewTagByte(7, mh.parseTagMode('mask:3'), rng);
    mh.classifyMetadata(57, true);
    mh.planRelease([{ id: 'a', deadlineSec: 1e9 }], { chainId: 31337, nowMs: 0, windowSec: 5 }, rng);
    mh.padBody({ a: 'é' }, undefined, rng);
    mh.stripPad({ a: 1, pad: '00' });
    new mh.RelayerPinning(['https://a.example', 'https://b.example'], rng).assign('x');
    mh.assertNoUserAddressFilter({ topics: ['0x01'] }, ['0x1111111111111111111111111111111111111111']);
    mh.alignedScanRange({ chainId: 31337, wantedFrom: 5, head: 50 }, rng);
    mh.validateRpcRoles(31337, { scan: 'https://a.example', query: 'https://b.example' });
    mh.padPrivatePart({ memo: 'x' }, (v) => JSON.stringify(v));
    mh.coarsenExpiry(5, { chainId: 31337 });
    mh.buildDirectPayment({
      chainId: 31337,
      announcer: mh.CANONICAL_ANNOUNCER,
      routerAddress: '0x2222222222222222222222222222222222222222',
      stealthAddress: '0x1111111111111111111111111111111111111111',
      asset: { kind: 'native' },
      amount: 1n,
      ephemeralPublicKey: eph,
      metadata: new Uint8Array([1]),
    });
    mh.findUnsafeAnchors('<a href="/" target="_blank">x</a>');
    mh.buildCsp(['https://a.example']);
    mh.verifySri(new Uint8Array(3), mh.sriDigest(new Uint8Array(3)));
    mh.planChange({ network: 'regtest', inputTotalSats: 10_000n, amountSats: 1000n, feeSats: 100n, changeAddress: 'bcrt1qchange' });
    mh.orderOutputs('regtest', [{ amountSats: 1n, scriptPubKey: 'aa' }], 'bip69');
    mh.stripPsbtFingerprints('regtest', { global: [], inputs: [], outputs: [] });
    mh.parseHardeningJson(JSON.stringify(mh.hardenedSettings()));
  }

  it('makes no network or messaging call and works without Buffer', () => {
    const calls: string[] = [];
    const spy = (name: string) => (): never => {
      calls.push(name);
      throw new Error(`unexpected ${name}`);
    };
    class Spy {
      public constructor() {
        calls.push('constructor');
        throw new Error('unexpected network constructor');
      }
    }
    vi.stubGlobal('fetch', spy('fetch'));
    vi.stubGlobal('XMLHttpRequest', Spy);
    vi.stubGlobal('WebSocket', Spy);
    vi.stubGlobal('EventSource', Spy);
    vi.stubGlobal('Image', Spy);
    vi.stubGlobal('Worker', Spy);
    vi.stubGlobal('BroadcastChannel', Spy);
    vi.stubGlobal('navigator', { sendBeacon: spy('sendBeacon') });
    vi.stubGlobal('Buffer', undefined);
    expect(typeof Buffer).toBe('undefined');
    expect(exercise).not.toThrow();
    expect(calls).toEqual([]);
  });

  it('does not touch global state: no new globals, no change to existing ones', () => {
    const before = Object.getOwnPropertyNames(globalThis).sort();
    const cryptoBefore = globalThis.crypto;
    exercise();
    expect(Object.getOwnPropertyNames(globalThis).sort()).toEqual(before);
    expect(globalThis.crypto).toBe(cryptoBefore);
  });

  it('without a CSPRNG, randomised helpers fail typed and deterministic ones still work', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => mh.randomBelow(10n)).toThrow(mh.MetadataHardeningError);
    expect(() => mh.padBody({ a: 1 })).toThrow(mh.MetadataHardeningError);
    expect(() => mh.shuffle([1, 2, 3])).toThrow(mh.MetadataHardeningError);
    expect(() => mh.shuffle([1])).not.toThrow(); // nothing to randomise
    expect(mh.randomBelow(10n, seededRng(3))).toBeLessThan(10n);
    expect(mh.parseEndpoint('https://a.example/')).toBe('https://a.example');
    expect(mh.roundGross(12345n, { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 100 }).amount).toBe(12400n);
  });

  it('never asks the CSPRNG for more than the 65 536 bytes Web Crypto allows per call', () => {
    let largest = 0;
    let counter = 1;
    const strict: mh.RandomSource = {
      getRandomValues<T extends ArrayBufferView | null>(a: T): T {
        if (a === null) return a;
        largest = Math.max(largest, a.byteLength);
        if (a.byteLength > 65_536) throw new Error('QuotaExceededError');
        const view = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        for (let i = 0; i < view.length; i++) view[i] = (counter = (counter * 1103515245 + 12345) >>> 0) >>> 24;
        return a;
      },
    };
    mh.padBody({ a: 1 }, [4096], strict);
    mh.randomBelow(1n << 256n, strict);
    mh.shuffle(Array.from({ length: 1000 }, (_, i) => i), strict);
    expect(largest).toBeLessThanOrEqual(4096);
  });
});

describe('runtime: values created in another realm (iframe, vm) behave like local ones', () => {
  const foreign = <T>(code: string): T => vm.runInNewContext(code) as T;
  it('arrays, objects and byte arrays from another realm are accepted', () => {
    expect(mh.buildConnectSources(foreign<string[]>('["https://a.example"]'))).toEqual(['https://a.example']);
    expect(mh.stripPad(foreign<Record<string, unknown>>('({a: 1, pad: "00"})'))).toEqual({ a: 1 });
    expect(mh.padBody(foreign<Record<string, unknown>>('({a: 1})'), undefined, seededRng(1))).toMatch(/^\{"a":1,"pad":"[0-9a-f]+"\}$/);
    expect(mh.assertNoUserAddressFilter(foreign('({topics: ["0x01"]})'), foreign('["0x1111111111111111111111111111111111111111"]'))).toBeUndefined();
    expect(mh.sriDigest(foreign<Uint8Array>('new Uint8Array([1,2,3])'))).toBe(mh.sriDigest(new Uint8Array([1, 2, 3])));
    expect(mh.normalizeHardening(foreign('({enabled: {"MH-WAL-1": true}})')).enabled['MH-WAL-1']).toBe(true);
  });
  it('lookalikes are still rejected', () => {
    expect(() => mh.sriDigest({ length: 3, [Symbol.toStringTag]: 'Uint8Array' } as never)).toThrow(mh.MetadataHardeningError);
    expect(() => mh.stripPad(new Map() as never)).toThrow(mh.MetadataHardeningError);
  });
});
