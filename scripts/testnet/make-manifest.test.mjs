// node --test scripts/testnet/make-manifest.test.mjs   (needs `npm run build:libs`; no network, no anvil)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema, validateAll } from './make-manifest.mjs';

const schema = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../deployments/schema.json'), 'utf8'));
const a = (n) => `0x${n.toString(16).padStart(40, '0')}`;
const h = (n) => `0x${n.toString(16).padStart(64, '0')}`;
const good = () => ({
  chainId: 84532, announcer: a(1), router: a(2), sweepRelayer: a(3), feeRecipient: a(4), feeBps: 25,
  deployTx: { router: h(1), sweepRelayer: h(2) }, solcVersion: '0.8.28+commit.7893614a', commit: 'ab'.repeat(20),
  bytecodeHashes: { router: h(3), sweepRelayer: h(4) }, date: '2026-01-01T00:00:00Z',
});

test('valid manifest passes schema and the chain-adapters validator', async () => {
  assert.deepEqual(validateAgainstSchema(good(), schema), []);
  await validateAll(good());
});
test('unknown key, missing field, bad address and bad date are reported', () => {
  const m = { ...good(), extra: 1, router: '0x12' };
  delete m.feeRecipient;
  m.date = 'nope';
  const errs = validateAgainstSchema(m, schema).join('\n');
  assert.match(errs, /extra: unknown key/);
  assert.match(errs, /feeRecipient: missing/);
  assert.match(errs, /router: pattern mismatch/);
  assert.match(errs, /date: bad date-time/);
});
test('policyFactory requires the other policy fields (dependentRequired)', () => {
  const errs = validateAgainstSchema({ ...good(), policyFactory: a(9) }, schema).join('\n');
  assert.match(errs, /policyImplementation: required when policyFactory present/);
});
test('feeBps outside 0..10000 and non-25 feeBps are rejected', async () => {
  assert.match(validateAgainstSchema({ ...good(), feeBps: 10001 }, schema).join(), /above maximum/);
  await assert.rejects(() => validateAll({ ...good(), feeBps: 30 }));
});
