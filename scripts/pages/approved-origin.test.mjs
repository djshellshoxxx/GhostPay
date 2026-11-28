import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseApprovedOrigin } from './approved-origin.mjs';

test('approved origin uses the browser serialization, retaining non-default ports', () => {
  assert.equal(parseApprovedOrigin('HTTPS://OWNER.GITHUB.IO:443'), 'https://owner.github.io');
  assert.equal(parseApprovedOrigin('https://pay.example:0443'), 'https://pay.example');
  assert.equal(parseApprovedOrigin('https://pay.example:8443'), 'https://pay.example:8443');
  assert.equal(parseApprovedOrigin('http://localhost:4694', true), 'http://localhost:4694');
});

test('refuses credentials, paths, fragments, queries, malformed ports, and non-fixture HTTP', () => {
  for (const value of ['', 'https://example.org/', 'https://example.org/GhostPay',
    'https://example.org?', 'https://example.org#', 'https://foo@example.org', 'https://example.org:65536',
    'https://example.org\n', 'http://localhost:4694', 'http://127.0.0.1:4694', 'https://host.example.']) {
    assert.throws(() => parseApprovedOrigin(value), undefined, JSON.stringify(value));
  }
  assert.throws(() => parseApprovedOrigin('http://localhost.example', true));
  assert.throws(() => parseApprovedOrigin('http://127.0.0.1.example', true));
  for (let port = 1; port < 65536; port += 199) {
    const value = `https://pay.example:${port}`;
    assert.equal(parseApprovedOrigin(value), new URL(value + '/GhostPay/').origin);
    assert.throws(() => parseApprovedOrigin(value + '/GhostPay/'));
  }
});
