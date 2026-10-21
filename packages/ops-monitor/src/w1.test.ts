import { describe, expect, it } from 'vitest';
import { A, CODE, FakeRpc, addrWord, healthy, manifest, numWord } from './fixtures.testutil.js';
import { w1Probe } from './w1.js';
import { selector } from './util.js';
import type { MonitorContext, ReleaseConfig } from './types.js';

const ctx = (rpcs: FakeRpc[], extra: Partial<MonitorContext> = {}, policy = false): MonitorContext => ({
  rpcs,
  manifests: [manifest({ policy })],
  now: 0,
  ...extra,
});
const fake = (over = {}, policy = false): FakeRpc => new FakeRpc({ handler: healthy(over, policy) });

describe('W1', () => {
  it('matching chain yields one info', async () => {
    const f = await w1Probe.run(ctx([fake()]));
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('info');
  });

  it('checks policy contracts when present', async () => {
    expect((await w1Probe.run(ctx([fake({}, true)], {}, true)))[0]?.severity).toBe('info');
    const f = await w1Probe.run(ctx([fake({ codes: { [A.pFactory]: '0x00' } }, true)], {}, true));
    expect(f.map((x) => x.subject)).toEqual([A.pFactory]);
    const g = await w1Probe.run(ctx([fake({ calls: { [`${A.pFactory}${selector('FEE_RECIPIENT()')}`]: addrWord(A.evil) } }, true)], {}, true));
    expect(g[0]?.severity).toBe('page');
  });

  it('drifted code is a page', async () => {
    const f = await w1Probe.run(ctx([fake({ codes: { [A.router]: '0x6000' } })]));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'page', subject: A.router });
  });

  it('missing code is a page', async () => {
    const f = await w1Probe.run(ctx([fake({ codes: { [A.sweep]: '0x' } })]));
    expect(f[0]).toMatchObject({ severity: 'page', subject: A.sweep });
  });

  it('drifted getters are pages', async () => {
    const o = {
      calls: {
        [`${A.router}${selector('FEE_RECIPIENT()')}`]: addrWord(A.evil),
        [`${A.router}${selector('FEE_BPS()')}`]: numWord(30n),
        [`${A.router}${selector('ANNOUNCER()')}`]: '0x1234',
      },
    };
    const f = await w1Probe.run(ctx([fake(o)]));
    expect(f).toHaveLength(3);
    expect(f.every((x) => x.severity === 'page')).toBe(true);
    const fee = f.find((x) => x.detail.startsWith('FEE_RECIPIENT'));
    expect(fee?.detail).toContain(A.evil);
  });

  it('malformed address word (dirty high bytes) is a page', async () => {
    const dirty = `0x${'1'.repeat(24)}${'4'.repeat(40)}`;
    const f = await w1Probe.run(ctx([fake({ calls: { [`${A.router}${selector('FEE_RECIPIENT()')}`]: dirty } })]));
    expect(f[0]?.severity).toBe('page');
  });

  it('unreachable provider yields warns only', async () => {
    const down = new FakeRpc({
      handler: () => {
        throw new Error('https://secret.example/key');
      },
    });
    const f = await w1Probe.run(ctx([down]));
    expect(f).toHaveLength(5);
    expect(f.every((x) => x.severity === 'warn')).toBe(true);
    expect(JSON.stringify(f)).not.toContain('secret');
  });

  it('malformed code or call result is a warn', async () => {
    const bad = new FakeRpc({ handler: () => 42 });
    const f = await w1Probe.run(ctx([bad]));
    expect(f.every((x) => x.severity === 'warn')).toBe(true);
  });

  it('lying single provider (valid-looking wrong code) is caught against the manifest', async () => {
    const liar = fake({ codes: { [A.router]: CODE.sweep } });
    const f = await w1Probe.run(ctx([liar]));
    expect(f[0]?.severity).toBe('page');
  });

  it('no client for the chain warns', async () => {
    const f = await w1Probe.run(ctx([new FakeRpc({ chainId: 10, handler: healthy() })]));
    expect(f).toEqual([expect.objectContaining({ severity: 'warn', subject: A.router })]);
  });

  describe('mirror copies', () => {
    const copy = '{"chainId":1}\n';
    const rel = (body: (url: string) => string | null): ReleaseConfig => ({
      mirrors: ['https://m1.example', 'https://m2.example'],
      sha256sums: '',
      files: [],
      manifestCopies: { 1: copy, 2: 'unused' },
      fetch: (url) => {
        const b = body(url);
        if (b === 'throw') return Promise.reject(new Error('net'));
        if (b === null) return Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
        const u = new TextEncoder().encode(b);
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(u.buffer.slice(0)) });
      },
    });
    const run = (r: ReleaseConfig): ReturnType<typeof w1Probe.run> => w1Probe.run(ctx([fake()], { release: r }));

    it('matching, drifted, missing and throwing mirrors', async () => {
      const f = await run(
        rel((u) => (u.startsWith('https://m1') ? copy : u.includes('m2') ? 'tampered' : null)),
      );
      const m = f.filter((x) => x.subject.startsWith('https://'));
      expect(m.map((x) => x.severity)).toEqual(['info', 'page']);
      const g = await run(rel(() => null));
      expect(g.filter((x) => x.subject.startsWith('https://')).every((x) => x.severity === 'warn')).toBe(true);
      const h = await run(rel(() => 'throw'));
      expect(h.filter((x) => x.subject.startsWith('https://')).every((x) => x.severity === 'warn')).toBe(true);
    });

    it('url is built without double slashes', async () => {
      const urls: string[] = [];
      await run({ ...rel(() => copy), mirrors: ['https://m1.example/'], fetch: (u) => {
        urls.push(u);
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(copy).buffer) });
      } });
      expect(urls).toEqual(['https://m1.example/deployments/1.json']);
    });

    it('skips mirror check without release copies', async () => {
      const f = await w1Probe.run(ctx([fake()], { release: { mirrors: ['https://m'], sha256sums: '', files: [] } }));
      expect(f).toHaveLength(1);
    });
  });
});
