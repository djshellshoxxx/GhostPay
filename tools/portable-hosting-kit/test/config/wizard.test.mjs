// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { runWizard } from '../../src/wizard.mjs';
import { KitError } from '../../src/errors.mjs';

/** @param {string[]} answers */
function input(answers) {
  return Readable.from([answers.map((a) => `${a}\n`).join('')]);
}

test('interactive: re-asks on invalid answers and returns a validated config', async () => {
  let shown = '';
  const c = await runWizard({
    input: input(['tor', 'onion', '', '/bad', '/mirror/', '0.0.0.0', '9090', 'my mirror']),
    out: (s) => { shown += s; },
    interactive: true,
    defaults: {},
  });
  assert.equal(c.transport, 'onion');
  assert.equal(c.publicOrigin, null);
  assert.equal(c.basePath, '/mirror/');
  assert.deepEqual(c.listen, { kind: 'tcp', host: '127.0.0.1', port: 9090 });
  assert.equal(c.mirrorLabel, 'my mirror');
  assert.match(shown, /not accepted: transport must be one of/);
  assert.match(shown, /not accepted: basePath must start and end/);
  assert.match(shown, /not accepted: listen\.port must be an integer/);
  assert.match(shown, /do not enter keys or tokens/);
});

test('interactive: clearnet asks for Onion-Location and accepts unix sockets', async () => {
  const c = await runWizard({
    input: input(['clearnet', 'https://example.org', '/', 'unix:/run/site/web.sock', '', '']),
    out: () => {},
    interactive: true,
    defaults: {},
  });
  assert.deepEqual(c.listen, { kind: 'unix', path: '/run/site/web.sock' });
  assert.equal(c.mirrorLabel, 'clearnet-mirror');
  assert.equal(c.onionLocation, null);
});

test('interactive: running out of input is a usage error, not a half config', async () => {
  await assert.rejects(runWizard({ input: input(['i2p']), out: () => {}, interactive: true, defaults: {} }), (e) => e instanceof KitError && e.code === 'E_USAGE');
});

test('non-interactive uses flags and still validates', async () => {
  const c = await runWizard({ input: input([]), out: () => {}, interactive: false, defaults: { transport: 'i2p', port: '8082', label: 'eep' } });
  assert.equal(c.transport, 'i2p');
  await assert.rejects(runWizard({ input: input([]), out: () => {}, interactive: false, defaults: { transport: 'clearnet', publicOrigin: 'http://example.org' } }), (e) => e instanceof KitError && e.code === 'E_CONFIG');
});
