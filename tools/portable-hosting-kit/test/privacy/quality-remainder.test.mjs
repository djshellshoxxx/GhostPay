// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeProjectName } from '../../src/profiles/container.mjs';
import { generateNginx } from '../../src/profiles/nginx.mjs';
import { parseHeadersFile } from '../../src/serve/headers.mjs';
import { KIT_DEFAULT_HEADERS_FILE } from '../../src/policy.mjs';

test('compose labels retain edge trimming, fallback and trim-before-truncation semantics', () => {
  /** @type {Array<[string, string]>} */
  const cases = [
    ['', 'hk-site'], ['__---', 'hk-site'], ['__A B__', 'hk-a-b'],
    ['A__B--C', 'hk-a__b--c'], ['Ä!Z', 'hk-z'],
    [`__${'a'.repeat(39)}-${'b'.repeat(5)}__`, `hk-${'a'.repeat(39)}-`],
  ];
  for (const [label, expected] of cases) assert.equal(composeProjectName(label), expected);
});

test('nginx absent transport hints agree while malformed non-null hints refuse', () => {
  /** @type {import('../../src/types.mjs').HostConfig} */
  const host = { schemaVersion: 1, transport: 'clearnet', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8088 }, mirrorLabel: 'quality', onionLocation: null };
  const policy = /** @type {import('../../src/types.mjs').HeaderPolicy} */ ({ source: 'kit-default', rules: parseHeadersFile(KIT_DEFAULT_HEADERS_FILE) });
  /** @param {import('../../src/types.mjs').HostConfig} hostConfig */
  const render = (hostConfig) => generateNginx({ files: ['index.html'], entrypoint: 'index.html', hostConfig, policy, wwwRoot: '/srv/www' });
  const omitted = { ...host };
  delete /** @type {Partial<import('../../src/types.mjs').HostConfig>} */ (omitted).onionLocation;
  assert.deepEqual(render(omitted), render(host));
  for (const bad of ['', 0, false]) assert.throws(() => render({ ...host, onionLocation: /** @type {any} */ (bad) }), { code: 'E_CONFIG' });
});
