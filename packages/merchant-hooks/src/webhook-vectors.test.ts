import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MemoryNonceStore, signWebhook, verifyWebhook } from './webhooks.js';
const fixture = JSON.parse(readFileSync(new URL('../test-vectors/webhooks.json', import.meta.url), 'utf8')) as {
  vectors: Array<{ name: string; secretHex: string; body: string; bodyHex: string; now: number; nonce: string; header: string }>;
};
describe('independent exact-byte HMAC vectors shared with PHP', () => {
  for (const v of fixture.vectors) it(v.name, () => {
    const secret = Uint8Array.from(Buffer.from(v.secretHex, 'hex'));
    expect(Buffer.from(v.body, 'utf8').toString('hex')).toBe(v.bodyHex);
    expect(signWebhook(secret, v.body, { now: v.now, nonce: v.nonce })).toBe(v.header);
    const nonces = new MemoryNonceStore();
    expect(verifyWebhook(secret, v.body + ' ', v.header, { now: v.now, nonces }).ok).toBe(false);
    expect(verifyWebhook(secret, v.body, v.header, { now: v.now, nonces }).ok).toBe(true);
    expect(verifyWebhook(secret, v.body, v.header, { now: v.now, nonces })).toEqual({ ok: false, reason: 'replay' });
    expect(verifyWebhook(secret, v.body, v.header, { now: v.now + 301, nonces: new MemoryNonceStore() })).toEqual({ ok: false, reason: 'stale' });
  });
});
