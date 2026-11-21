import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { REDIRECT_HEADER, startHttpRedirectFixture } from '../../apps/web/e2e/httpRedirectFixture.mjs';

test('real loopback redirects preserve ordinary upstream bytes and distinguish marked hash reads', async () => {
  const seen = [];
  const payload = Buffer.from([0, 1, 127, 128, 255]);
  const upstream = createServer((req, res) => {
    seen.push({ path: req.url, marker: req.headers[REDIRECT_HEADER], method: req.method });
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-authored-fixture': 'same-bytes' });
    res.end(payload);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  const fixture = await startHttpRedirectFixture(`http://127.0.0.1:${address.port}`);
  try {
    const plain = await fetch(`${fixture.origin}/assets/entry.js?normal=1`);
    assert.deepEqual(Buffer.from(await plain.arrayBuffer()), payload);
    assert.equal(plain.headers.get('x-authored-fixture'), 'same-bytes');
    fixture.setRedirect(302, 'https://isolation-sink.invalid/entry.js');
    const redirect = await fetch(`${fixture.origin}/assets/entry.js`, { headers: { [REDIRECT_HEADER]: '1' }, redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), 'https://isolation-sink.invalid/entry.js');
    assert.equal(redirect.headers.get('cache-control'), 'no-store');
    fixture.setRedirect(307, '/same-origin-target.js');
    const sameOrigin = await fetch(`${fixture.origin}/assets/entry.js`, { headers: { [REDIRECT_HEADER]: '1' }, redirect: 'manual' });
    assert.equal(sameOrigin.status, 307);
    assert.equal(sameOrigin.headers.get('location'), '/same-origin-target.js');
    assert.deepEqual(fixture.responses, [
      { status: 302, location: 'https://isolation-sink.invalid/entry.js', path: '/assets/entry.js' },
      { status: 307, location: '/same-origin-target.js', path: '/assets/entry.js' },
    ]);
    assert.deepEqual(seen, [{ path: '/assets/entry.js?normal=1', marker: undefined, method: 'GET' }]);
    assert.equal((await fetch(fixture.origin, { method: 'POST' })).status, 405);
    assert.equal(seen.length, 1);
  } finally {
    await fixture.close();
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    upstream.closeAllConnections();
  }
});

test('the fixture refuses non-loopback upstream origins', async () => {
  await assert.rejects(startHttpRedirectFixture('https://fixture.invalid/'), /loopback HTTP origin/);
  await assert.rejects(startHttpRedirectFixture('http://localhost:4173/path'), /loopback HTTP origin/);
});
