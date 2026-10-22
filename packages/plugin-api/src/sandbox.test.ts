import { describe, expect, it } from 'vitest';
import { PluginError } from './errors.js';
import { FakeNetwork, MemoryStorage } from './fixtures.testutil.js';
import {
  MAX_REQUEST_BODY,
  MAX_RESPONSE_BODY,
  MAX_STORAGE_KEYS,
  MAX_STORAGE_VALUE,
  createContext,
} from './sandbox.js';

const ID = 'org.example.delay';
const clock = () => 1_767_225_600_000;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof PluginError) return `${e.code}:${e.path ?? ''}`;
    throw e;
  }
  return 'ok';
}

describe('deny by default', () => {
  it('exposes no network or storage without a grant, or without a host port', () => {
    const net = new FakeNetwork();
    const store = new MemoryStorage();
    const none = createContext(ID, { network: [], storage: false }, { network: net, storage: store }, clock);
    expect(none.context.network).toBeUndefined();
    expect(none.context.storage).toBeUndefined();
    expect(Object.isFrozen(none.context)).toBe(true);
    const noPort = createContext(ID, { network: ['api.example.com'], storage: true }, {}, clock);
    expect(noPort.context.network).toBeUndefined();
    expect(noPort.context.storage).toBeUndefined();
    expect(none.context.now()).toBe(1_767_225_600_000);
  });
});

describe('network', () => {
  const make = () => {
    const net = new FakeNetwork();
    const h = createContext(ID, { network: ['api.example.com'], storage: false }, { network: net }, clock);
    return { net, h, fetch: h.context.network!.fetch };
  };

  it('allows https to an exact allowlisted host', async () => {
    const { net, fetch } = make();
    await expect(fetch('https://api.example.com/v1/rates?x=1')).resolves.toEqual({
      status: 200,
      body: '{"ok":true}',
    });
    await fetch('https://api.example.com/p', { method: 'POST', body: '{}' });
    expect(net.calls).toEqual([
      { url: 'https://api.example.com/v1/rates?x=1', method: 'GET' },
      { url: 'https://api.example.com/p', method: 'POST', body: '{}' },
    ]);
  });

  it('blocks everything else', async () => {
    const { net, fetch } = make();
    for (const url of [
      'http://api.example.com/',
      'https://evil.example.com/',
      'https://api.example.com.evil.com/',
      'https://sub.api.example.com/',
      'https://api.example.com:8443/',
      'https://user:pw@api.example.com/',
      'https://user@api.example.com/',
      'not a url',
      'https://' + 'a'.repeat(2050),
      42 as never,
    ]) {
      expect(await code(fetch(url))).toBe('PERMISSION:network.url');
    }
    expect(await code(fetch('https://api.example.com/', { method: 'DELETE' as never }))).toBe(
      'PERMISSION:network.method',
    );
    expect(await code(fetch('https://api.example.com/', { body: 'x' }))).toBe('LIMIT:network.body');
    expect(
      await code(
        fetch('https://api.example.com/', { method: 'POST', body: 'x'.repeat(MAX_REQUEST_BODY + 1) }),
      ),
    ).toBe('LIMIT:network.body');
    expect(net.calls).toEqual([]);
  });

  it('bounds the response and stops after revoke', async () => {
    const { net, h, fetch } = make();
    net.responseBody = 'x'.repeat(MAX_RESPONSE_BODY + 1);
    expect(await code(fetch('https://api.example.com/'))).toBe('LIMIT:network.response');
    net.responseBody = 'ok';
    const pending = fetch('https://api.example.com/');
    h.revoke();
    expect(await code(pending)).toBe('PERMISSION:revoked');
    expect(await code(fetch('https://api.example.com/'))).toBe('PERMISSION:revoked');
    expect(() => h.context.now()).toThrow(PluginError);
  });
});

describe('storage', () => {
  const make = () => {
    const store = new MemoryStorage();
    const h = createContext(ID, { network: [], storage: true }, { storage: store }, clock);
    return { store, h, s: h.context.storage! };
  };

  it('namespaces keys per plugin and keeps an index', async () => {
    const { store, s } = make();
    await s.set('prefs', 'v1');
    await s.set('prefs', 'v2');
    expect(await s.get('prefs')).toBe('v2');
    expect(store.data.get(`plugin/${ID}/prefs`)).toBe('v2');
    expect(store.data.get(`plugin/${ID}/~index`)).toBe('["prefs"]');
    await s.delete('prefs');
    await s.delete('never-set');
    expect(store.data.get(`plugin/${ID}/~index`)).toBe('[]');
    expect(await s.get('prefs')).toBeUndefined();
  });

  it('rejects bad keys (incl. traversal and the index key), big values and over-quota', async () => {
    const { s } = make();
    for (const k of ['../other/x', '~index', 'UP', '', 'a/b', 'x'.repeat(65)]) {
      expect(await code(s.set(k, 'v'))).toBe('PERMISSION:storage.key');
    }
    expect(await code(s.get('../x'))).toBe('PERMISSION:storage.key');
    expect(await code(s.set('k', 'x'.repeat(MAX_STORAGE_VALUE + 1)))).toBe('LIMIT:storage.value');
    for (let i = 0; i < MAX_STORAGE_KEYS; i++) await s.set(`k${i}`, 'v');
    expect(await code(s.set('one-more', 'v'))).toBe('LIMIT:storage.keys');
    await s.set('k0', 'overwrite-ok');
  });

  it('fails closed on a corrupted index', async () => {
    const { store, s } = make();
    store.data.set(`plugin/${ID}/~index`, '{not json');
    expect(await code(s.set('a', 'v'))).toBe('LIMIT:storage.index');
    store.data.set(`plugin/${ID}/~index`, '["../x"]');
    expect(await code(s.delete('a'))).toBe('LIMIT:storage.index');
  });

  it('stops after revoke', async () => {
    const { h, s } = make();
    h.revoke();
    expect(await code(s.get('a'))).toBe('PERMISSION:revoked');
    expect(await code(s.set('a', 'v'))).toBe('PERMISSION:revoked');
    expect(await code(s.delete('a'))).toBe('PERMISSION:revoked');
  });
});

describe('storage concurrency', () => {
  it('concurrent sets from one plugin keep a complete index and respect the quota', async () => {
    const store = new MemoryStorage();
    const s = createContext(ID, { network: [], storage: true }, { storage: store }, clock).context.storage!;
    const results = await Promise.allSettled(
      Array.from({ length: MAX_STORAGE_KEYS + 5 }, (_, i) => s.set(`c${i}`, 'v')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_STORAGE_KEYS);
    expect(JSON.parse(store.data.get(`plugin/${ID}/~index`)!)).toHaveLength(MAX_STORAGE_KEYS);
  });
});
