import { describe, expect, it } from 'vitest';
import { PluginError } from './errors.js';
import { manifest } from './fixtures.testutil.js';
import { MAX_NETWORK_HOSTS, validateManifest } from './manifest.js';

function path(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof PluginError) return `${e.code}:${e.path ?? ''}`;
    throw e;
  }
  return undefined;
}

describe('validateManifest', () => {
  it('accepts and canonicalizes a manifest', () => {
    const m = validateManifest(
      manifest({
        capabilities: ['privacy:relay', 'hook:onInvoiceCreate', 'privacy:delay'],
        permissions: { network: ['z.example.org', 'api.example.com'], storage: true, downgrade: false },
      }),
    );
    expect(m.capabilities).toEqual(['hook:onInvoiceCreate', 'privacy:delay', 'privacy:relay']);
    expect(m.permissions.network).toEqual(['api.example.com', 'z.example.org']);
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.permissions.network)).toBe(true);
  });

  it('rejects bad ids, names and versions', () => {
    for (const id of [
      'Example.delay',
      'single',
      'a..b',
      'org.example.',
      '1org.example',
      'org.' + 'a'.repeat(33),
    ]) {
      expect(path(() => validateManifest(manifest({ id })))).toBe('MANIFEST:id');
    }
    for (const version of ['1.0', '01.0.0', '1.0.0+build', 'v1.0.0', '1.0.0-']) {
      expect(path(() => validateManifest(manifest({ version })))).toBe('MANIFEST:version');
    }
    for (const name of ['', ' lead', 'evil‮exe', 'a\u0000b', 'x'.repeat(65), 'zero​width']) {
      expect(path(() => validateManifest(manifest({ name })))).toBe('MANIFEST:name');
    }
    expect(path(() => validateManifest(manifest({ apiVersion: 2 as 1 })))).toBe('MANIFEST:apiVersion');
  });

  it('rejects unknown, duplicate and empty capabilities', () => {
    expect(path(() => validateManifest(manifest({ capabilities: ['hook:onPayment' as never] })))).toBe(
      'MANIFEST:capabilities[0]',
    );
    expect(path(() => validateManifest(manifest({ capabilities: ['privacy:delay', 'privacy:delay'] })))).toBe(
      'MANIFEST:capabilities[1]',
    );
    expect(path(() => validateManifest(manifest({ capabilities: [] })))).toBe('MANIFEST:capabilities');
  });

  it('rejects wildcard, IP, port, uppercase, duplicate and too many hosts', () => {
    for (const host of [
      '*.example.com',
      '127.0.0.1',
      'example.com:8443',
      'Example.com',
      'localhost',
      'https://a.com',
    ]) {
      expect(
        path(() =>
          validateManifest(manifest({ permissions: { network: [host], storage: false, downgrade: false } })),
        ),
      ).toBe('MANIFEST:permissions.network[0]');
    }
    expect(
      path(() =>
        validateManifest(
          manifest({
            permissions: { network: ['a.example.com', 'a.example.com'], storage: false, downgrade: false },
          }),
        ),
      ),
    ).toBe('MANIFEST:permissions.network[1]');
    const many = Array.from({ length: MAX_NETWORK_HOSTS + 1 }, (_, i) => `h${i}.example.com`);
    expect(
      path(() =>
        validateManifest(manifest({ permissions: { network: many, storage: false, downgrade: false } })),
      ),
    ).toBe('MANIFEST:permissions.network');
  });

  it('rejects code-carrying or unknown keys, accessors, symbols and non-plain objects', () => {
    expect(path(() => validateManifest({ ...manifest(), entry: 'https://cdn.example.com/p.js' }))).toBe(
      'MANIFEST:entry',
    );
    expect(
      path(() =>
        validateManifest({
          ...manifest(),
          permissions: { network: [], storage: false, downgrade: false, eval: true },
        }),
      ),
    ).toBe('MANIFEST:permissions.eval');
    const g = { ...manifest() } as Record<string, unknown>;
    delete g.id;
    Object.defineProperty(g, 'id', { get: () => 'org.example.delay', enumerable: true });
    expect(path(() => validateManifest(g))).toBe('MANIFEST:id');
    expect(path(() => validateManifest({ ...manifest(), [Symbol('x')]: 1 }))).toBe('MANIFEST:');
    class M {}
    expect(path(() => validateManifest(Object.assign(new M(), manifest())))).toBe('MANIFEST:');
    const { version: _v, ...missing } = manifest();
    void _v;
    expect(path(() => validateManifest(missing))).toBe('MANIFEST:version');
    expect(
      path(() =>
        validateManifest(manifest({ permissions: { network: [], storage: 1 as never, downgrade: false } })),
      ),
    ).toBe('MANIFEST:permissions.storage');
    const sparse = ['privacy:delay'] as unknown[];
    sparse.length = 2;
    expect(path(() => validateManifest(manifest({ capabilities: sparse as never })))).toBe(
      'MANIFEST:capabilities[1]',
    );
  });
});
