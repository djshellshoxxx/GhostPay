// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DENY_RULES, contentTypeFor, extensionOf } from '../../src/policy.mjs';

/** @param {string} p */
function firstDeny(p) {
  const lower = p.toLowerCase();
  return DENY_RULES.find((r) => r.test(lower, lower.split('/')))?.rule ?? null;
}

test('content types come from the allowlist and carry utf-8 for text', () => {
  assert.equal(contentTypeFor('index.html'), 'text/html; charset=utf-8');
  assert.equal(contentTypeFor('assets/app.MJS'), 'text/javascript; charset=utf-8');
  assert.equal(contentTypeFor('img/logo.png'), 'image/png');
  assert.equal(contentTypeFor('LICENSE'), 'text/plain; charset=utf-8');
  assert.equal(contentTypeFor('run.php'), null);
  assert.equal(contentTypeFor('.hidden'), null);
  assert.equal(extensionOf('a/b.tar.gz'), 'gz');
  assert.equal(extensionOf('a/.env'), '');
});

test('deny rules name secrets and runtime state precisely', () => {
  assert.equal(firstDeny('onion/hs_ed25519_secret_key'), 'tor-onion-identity');
  assert.equal(firstDeny('i2p-keys/eepPriv.dat'), 'i2p-destination-keys');
  assert.equal(firstDeny('keys/server.pem'), 'private-key-file');
  assert.equal(firstDeny('.env'), 'credentials-or-env');
  assert.equal(firstDeny('config/secrets.json'), 'credentials-or-env');
  assert.equal(firstDeny('data/subscribers.sqlite'), 'database-or-backup');
  assert.equal(firstDeny('notes/draft.html.bak'), 'database-or-backup');
  assert.equal(firstDeny('.DS_Store'), 'runtime-state');
  assert.equal(firstDeny('cgi/contact.php'), 'server-side-code');
  assert.equal(firstDeny('wallet/UTC--2026-01-01T00-00-00Z--abcd'), 'wallet-or-seed');
});

test('hashed code chunks with sensitive-sounding names are not rejected by name', () => {
  for (const p of ['assets/secret-box-3f9a.js', 'assets/mnemonic-77aa.js', 'assets/tokens-12ab.js', 'assets/keystore-1a2b.js']) {
    assert.equal(firstDeny(p), null, p);
  }
});
