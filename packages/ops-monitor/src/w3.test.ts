import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchBytes, sha256Hex } from './fetcher.js';
import type { ReleaseConfig } from './types.js';
import { parseSha256Sums, w3Probe } from './w3.js';

const INDEX = '<html>ok</html>';
const JS = 'console.log(1)';
const sums = `${sha256Hex(INDEX)}  index.html\n${sha256Hex(JS)} *./app.js\nnot a line\n`;

let good: Server;
let evil: Server;
let goodUrl: string;
let evilUrl: string;

function serve(files: Record<string, string>): Promise<Server> {
  const s = createServer((req, res) => {
    const body = files[req.url ?? ''];
    if (req.url === '/redirect.js') {
      res.writeHead(302, { location: '/index.html' }).end();
    } else if (body === undefined) {
      res.writeHead(404).end('nope');
    } else {
      res.writeHead(200).end(body);
    }
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}
const url = (s: Server): string => `http://127.0.0.1:${String((s.address() as AddressInfo).port)}`;

beforeAll(async () => {
  good = await serve({ '/index.html': INDEX, '/app.js': JS, '/big.js': 'x'.repeat(100) });
  evil = await serve({ '/index.html': INDEX, '/app.js': `${JS};steal()` });
  goodUrl = url(good);
  evilUrl = url(evil);
});
afterAll(() => {
  good.close();
  evil.close();
});

const run = (rel: ReleaseConfig | undefined): ReturnType<typeof w3Probe.run> =>
  w3Probe.run({ rpcs: [], manifests: [], now: 0, ...(rel === undefined ? {} : { release: rel }) });

describe('W3', () => {
  it('parses SHA256SUMS', () => {
    const m = parseSha256Sums(sums);
    expect([...m.keys()]).toEqual(['index.html', 'app.js']);
  });

  it('untampered mirror is info (real http, default fetch)', async () => {
    const f = await run({ mirrors: [goodUrl], sha256sums: sums, files: ['index.html', 'app.js'] });
    expect(f).toEqual([expect.objectContaining({ severity: 'info', subject: goodUrl })]);
  });

  it('tampered file is a page naming the file and both hashes', async () => {
    const f = await run({ mirrors: [goodUrl, evilUrl], sha256sums: sums, files: ['index.html', 'app.js'] });
    expect(f).toHaveLength(2);
    expect(f[1]).toMatchObject({ severity: 'page', subject: evilUrl });
    expect(f[1]?.detail).toContain('app.js');
    expect(f[1]?.detail).toContain(sha256Hex(JS));
  });

  it('404, unlisted file, redirect and dead mirror are warns', async () => {
    const dead = createServer();
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', () => r()));
    const deadUrl = url(dead);
    await new Promise<void>((r) => dead.close(() => r()));
    const f = await run({
      mirrors: [goodUrl, deadUrl],
      sha256sums: `${sums}${sha256Hex('x')}  missing.js\n${sha256Hex('x')}  redirect.js\n`,
      files: ['missing.js', 'unlisted.js', 'redirect.js'],
    });
    expect(f.every((x) => x.severity === 'warn')).toBe(true);
    expect(f).toHaveLength(6);
  });

  it('oversize response is a warn; injected fetch is used', async () => {
    const f = await run({
      mirrors: [goodUrl],
      sha256sums: `${sha256Hex('x'.repeat(100))}  big.js\n`,
      files: ['big.js'],
      maxBytes: 10,
    });
    expect(f[0]).toMatchObject({ severity: 'warn' });
    const g = await run({
      mirrors: ['https://x.example'],
      sha256sums: `${sha256Hex('hello')}  a\n`,
      files: ['a'],
      fetch: () => Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new TextEncoder().encode('hello').buffer) }),
    });
    expect(g[0]?.severity).toBe('info');
  });


  it('enforces the byte cap while streaming default release fetches', async () => {
    const parts = ['abcd', 'efgh', 'ijklm', 'unused'].map((part) => new TextEncoder().encode(part));
    let produced = 0;
    const fullBuffer = vi.fn(() => Promise.resolve(new TextEncoder().encode('abcdefghijklmunused').buffer));
    const response = {
      ok: true, status: 200, headers: new Headers(), arrayBuffer: fullBuffer,
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (produced === parts.length) controller.close();
          else controller.enqueue(parts[produced++]);
        },
      }),
    } as unknown as Response;
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    try {
      await expect(fetchBytes({ mirrors: [], sha256sums: '', files: [], maxBytes: 6 }, 'https://mirror.example', 'asset.js'))
        .rejects.toMatchObject({ code: 'FETCH_FAILED' });
      expect(fullBuffer).not.toHaveBeenCalled();
      expect(produced).toBeLessThan(parts.length);
    } finally {
      mock.mockRestore();
    }
  });

  it('missing release config warns', async () => {
    expect((await run(undefined))[0]).toMatchObject({ severity: 'warn', subject: 'monitor' });
  });
});
