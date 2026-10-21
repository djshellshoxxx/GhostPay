import { describe, expect, it } from 'vitest';
import { createClient } from './client.js';
import { SdkAbortedError, SdkConfigError, SdkInvoiceError } from './errors.js';
import type { SdkEvent } from './events.js';
import { NOW, SIGNER, SIGNING_KEY, input, testRng } from './fixtures.testutil.js';

describe('createClient', () => {
  it('performs NO network calls on construction or on local invoice operations', async () => {
    const orig = (globalThis as { fetch?: unknown }).fetch;
    let fetched = 0;
    (globalThis as { fetch?: unknown }).fetch = () => {
      fetched++;
      return Promise.reject(new Error('network must not be used'));
    };
    try {
      const client = createClient({ baseUrl: 'https://m.example.test' });
      const inv = client.invoices.build(input(), testRng());
      const link = await client.invoices.toLink(client.invoices.sign(inv, SIGNING_KEY), { baseUrl: 'https://pay.example.test/' });
      await client.invoices.parseLink(link);
      await client.invoices.verify(link);
      expect(fetched).toBe(0);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = orig;
    }
  });
  it('emits local events without secrets', async () => {
    const events: SdkEvent[] = [];
    const client = createClient({ now: () => NOW * 1000, onEvent: (e) => void events.push(e) });
    const inv = client.invoices.build(input(), testRng());
    const signed = client.invoices.sign(inv, SIGNING_KEY);
    const link = await client.invoices.toLink(signed, { encrypt: true, rng: testRng() });
    const v = await client.invoices.verify(link, { pinnedSigners: [SIGNER] });
    expect(v.parsed && v.verdict.trust).toBe('trusted-seller');
    expect(events.map((e) => e.type)).toEqual(['invoice.built', 'invoice.signed', 'invoice.linked', 'invoice.verified']);
    const dump = JSON.stringify(events);
    expect(dump).not.toContain('Consulting');
    expect(dump).not.toContain('Ref #42');
    expect(dump).not.toContain('gpi=v1');
    expect(dump).not.toContain(inv.nonce);
    expect(events.every((e) => e.at === NOW * 1000)).toBe(true);
  });
  it('rejections are emitted by code only; verify never throws on garbage', async () => {
    const events: SdkEvent[] = [];
    const client = createClient();
    const off = client.on((e) => void events.push(e));
    expect(() => client.invoices.build(input({ chainId: 0 }))).toThrow(SdkInvoiceError);
    await expect(client.invoices.parseLink('#gpi=v1.@@@')).rejects.toBeInstanceOf(SdkInvoiceError);
    await expect(client.invoices.toLink({ invoice: client.invoices.build(input(), testRng()), signature: '0'.repeat(128) })).rejects.toBeInstanceOf(SdkInvoiceError);
    expect((await client.invoices.verify('https://x.test/nothing')).parsed).toBe(false);
    expect((await client.invoices.verify('#gpi=v1.@@@')).parsed).toBe(false);
    expect((await client.invoices.verify(5 as unknown as string)).parsed).toBe(false);
    expect(events.filter((e) => e.type === 'invoice.rejected')).toHaveLength(6);
    off();
    const before = events.length;
    client.invoices.build(input(), testRng());
    expect(events).toHaveLength(before);
  });
  it('verify uses the client clock by default and honours nowSeconds override', async () => {
    const client = createClient({ now: () => (NOW + 7200) * 1000 });
    const link = await client.invoices.toLink(client.invoices.sign(client.invoices.build(input(), testRng()), SIGNING_KEY));
    const late = await client.invoices.verify(link);
    expect(late.parsed && late.verdict.blockers).toEqual(['invoice-expired']);
    const early = await client.invoices.verify(link, { nowSeconds: NOW });
    expect(early.parsed && early.verdict.ok).toBe(true);
  });
  it('listener errors do not break calls', () => {
    const client = createClient({
      onEvent: () => {
        throw new Error('bad listener');
      },
    });
    client.invoices.build(input(), testRng());
    expect(client.listenerErrors()).toBe(1);
  });
  it('merchant calls go through the injected fetch only', async () => {
    const urls: string[] = [];
    const client = createClient({
      baseUrl: 'https://m.example.test/',
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve('{"status":"ok","version":"1"}') });
      },
    });
    await client.merchant.health();
    expect(urls).toEqual(['https://m.example.test/v1/health']);
  });
  it('bad baseUrl fails at construction; missing baseUrl fails at call', async () => {
    expect(() => createClient({ baseUrl: 'http://remote.example.test' })).toThrow(SdkConfigError);
    await expect(createClient().merchant.health()).rejects.toBeInstanceOf(SdkConfigError);
    const ac = new AbortController();
    ac.abort();
    const c = createClient({ baseUrl: 'https://m.example.test', fetch: () => Promise.reject(new Error('x')) });
    await expect(c.merchant.health({ signal: ac.signal })).rejects.toBeInstanceOf(SdkAbortedError);
  });
});
