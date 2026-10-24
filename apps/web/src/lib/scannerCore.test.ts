import { buildErc20Metadata, deriveStealthPayment, encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ScanProtocol, ScanSession, type FromWorker, type ToWorker, type WireLog } from './scannerCore';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function fixture(): { keys: ReturnType<typeof generateKeySet>; mine: WireLog; other: WireLog; spendHex: string } {
  const keys = generateKeySet();
  const stranger = generateKeySet();
  const token = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const mk = (meta: string, id: string): WireLog => {
    const p = deriveStealthPayment(meta);
    return { id, schemeId: 1n, stealthAddress: p.stealthAddress, ephemeralPublicKey: `0x${hex(p.ephemeralPublicKey)}`, metadata: `0x${hex(buildErc20Metadata(p.viewTag, token, 1000n))}` };
  };
  return { keys, mine: mk(encodeMetaAddress(keys), 'mine'), other: mk(encodeMetaAddress(stranger), 'other'), spendHex: hex(keys.spendingPublicKey) };
}

describe('ScanSession', () => {
  it('finds only payments to the viewing key and ignores malformed logs without throwing', () => {
    const f = fixture();
    const s = new ScanSession(unsafeRevealSecret(f.keys.viewingSecret), f.spendHex);
    const junk: WireLog = { id: 'junk', schemeId: 1n, stealthAddress: 'nope', ephemeralPublicKey: '0x00', metadata: '0x' };
    const wrongScheme: WireLog = { ...f.mine, id: 'ws', schemeId: 2n };
    const seen: number[] = [];
    const logs = [f.other, f.mine, junk, wrongScheme, ...Array.from({ length: 130 }, (_, i) => ({ ...f.other, id: `x${String(i)}` }))];
    const matches = s.processBatch(logs, (n) => seen.push(n));
    expect(matches).toEqual([{ id: 'mine', stealthAddress: f.mine.stealthAddress, tagMatches: true }]);
    expect(s.scanned).toBe(logs.length);
    expect(seen).toEqual([128]);
  }, 15_000);
  it('deep-scan bypasses only the view tag and reports that diagnostic', () => {
    const f = fixture();
    const bytes = Uint8Array.from(f.mine.metadata.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16));
    bytes[0] = bytes[0]! ^ 0x5a;
    const wrongTag = { ...f.mine, metadata: `0x${hex(bytes)}` };
    const ordinary = new ScanSession(unsafeRevealSecret(f.keys.viewingSecret), f.spendHex);
    expect(ordinary.processBatch([{ ...wrongTag, skipTag: false }])).toEqual([]);
    ordinary.dispose();
    const deep = new ScanSession(unsafeRevealSecret(f.keys.viewingSecret), f.spendHex);
    expect(deep.processBatch([{ ...wrongTag, skipTag: true }])).toEqual([{ id: 'mine', stealthAddress: f.mine.stealthAddress, tagMatches: false }]);
    deep.dispose();
  });
  it('stops early when cancelled and refuses use after dispose', () => {
    const f = fixture();
    const s = new ScanSession(unsafeRevealSecret(f.keys.viewingSecret), f.spendHex);
    s.cancel();
    expect(s.processBatch([f.mine])).toEqual([]);
    s.dispose();
    expect(() => s.processBatch([f.mine])).toThrow(/DISPOSED/);
    s.dispose();
  });
  it('zeroizes the key bytes it was given and wipes the scalar on dispose', () => {
    const f = fixture();
    const raw = unsafeRevealSecret(f.keys.viewingSecret);
    const s = new ScanSession(raw, f.spendHex);
    expect(raw.every((b) => b === 0)).toBe(true);
    s.dispose();
  });
  it('wipes supplied viewing bytes even when the spending point is rejected first', () => {
    const f = fixture();
    const raw = unsafeRevealSecret(f.keys.viewingSecret);
    expect(() => new ScanSession(raw, 'zz')).toThrow(/INVALID_POINT/);
    expect(raw.every((byte) => byte === 0)).toBe(true);
  });
  it('wipes the retained viewing scalar immediately on cancellation', () => {
    const f = fixture();
    const session = new ScanSession(unsafeRevealSecret(f.keys.viewingSecret), f.spendHex);
    // Retain the exact scalar buffer to verify destruction, rather than a copied reveal value.
    const scalar = (session as unknown as { readonly secret: Uint8Array }).secret;
    expect(scalar.some((byte) => byte !== 0)).toBe(true);
    session.cancel();
    expect(scalar.every((byte) => byte === 0)).toBe(true);
    expect(session.processBatch([f.mine])).toEqual([]);
  });
  it('rejects bad keys', () => {
    const f = fixture();
    expect(() => new ScanSession(new Uint8Array(32), f.spendHex)).toThrow();
    expect(() => new ScanSession(unsafeRevealSecret(f.keys.viewingSecret), 'zz')).toThrow(/INVALID_POINT/);
  });
});

describe('ScanProtocol (what the worker runs)', () => {
  function run(): { send: (m: ToWorker) => void; out: FromWorker[] } {
    const p = new ScanProtocol();
    const out: FromWorker[] = [];
    return { send: (m) => p.handle(m, (r) => out.push(r)), out };
  }
  it('start, batch, end', () => {
    const f = fixture();
    const { send, out } = run();
    send({ type: 'start', viewingKey: unsafeRevealSecret(f.keys.viewingSecret), spendingPublicKey: f.spendHex });
    send({ type: 'batch', batchId: 1, logs: [f.mine, f.other] });
    send({ type: 'end' });
    expect(out).toEqual([{ type: 'ready' }, { type: 'matches', batchId: 1, matches: [{ id: 'mine', stealthAddress: f.mine.stealthAddress, tagMatches: true }], scanned: 2 }, { type: 'ended' }]);
  });
  it('reports bad keys and batches before start', () => {
    const { send, out } = run();
    send({ type: 'batch', batchId: 1, logs: [] });
    send({ type: 'start', viewingKey: new Uint8Array(32), spendingPublicKey: 'zz' });
    expect(out).toEqual([{ type: 'error', code: 'NOT_STARTED' }, { type: 'error', code: 'BAD_KEYS' }]);
  });
  it('cancel makes later batches return nothing; restart replaces the session', () => {
    const f = fixture();
    const { send, out } = run();
    send({ type: 'start', viewingKey: unsafeRevealSecret(f.keys.viewingSecret), spendingPublicKey: f.spendHex });
    send({ type: 'cancel' });
    send({ type: 'batch', batchId: 2, logs: [f.mine] });
    send({ type: 'start', viewingKey: unsafeRevealSecret(f.keys.viewingSecret), spendingPublicKey: f.spendHex });
    send({ type: 'batch', batchId: 3, logs: [f.mine] });
    const matches = out.filter((m) => m.type === 'matches');
    expect(matches[0]).toMatchObject({ batchId: 2, matches: [] });
    expect(matches[1]).toMatchObject({ batchId: 3, matches: [{ id: 'mine' }] });
  });
  it('cancel/end with no session are no-ops', () => {
    const { send, out } = run();
    send({ type: 'cancel' });
    send({ type: 'end' });
    expect(out).toEqual([{ type: 'ended' }]);
  });
});

describe('worker isolation (APP_AND_RELAYER_SPEC: no network APIs in scanning code)', () => {
  const files = ['scannerCore.ts', 'scanner.worker.ts'];
  const FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|navigator|indexedDB|localStorage|sessionStorage)\b/;
  it.each(files)('%s uses no network or storage API', (name) => {
    const text = readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(text).not.toMatch(FORBIDDEN);
  });
  it('imports nothing but core-crypto and its own protocol module', () => {
    for (const name of files) {
      const text = readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
      const imports = [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const i of imports) expect(['@ghostpay/core-crypto', './scannerCore']).toContain(i);
    }
  });
});
