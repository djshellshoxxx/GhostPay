// node --test scripts/testnet/make-manifest.test.mjs   (needs `npm run build:libs`; loopback fixtures only, no anvil)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getAddress, keccak256 } from 'viem';
import { CANONICAL_ANNOUNCER, loadDeployment, verifyObjectManifestSignature } from '@ghostpay/chain-adapters';
import { loopbackRpc, prepareDevnetManifest } from '../../apps/web/e2e/devnet/prepare-devnet-manifest.mjs';
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
test('legacy --copy-web fails with safe offline-signing guidance', () => {
  const script = resolve(dirname(fileURLToPath(import.meta.url)), 'make-manifest.mjs');
  const result = spawnSync(process.execPath, [script, '--copy-web'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /sign deployments\/<chainId>\.json offline/);
  assert.match(result.stderr, /apps\/web\/deployments\/<chainId>\.json/);
});
test('feeBps outside 0..10000 and non-25 feeBps are rejected', async () => {
  assert.match(validateAgainstSchema({ ...good(), feeBps: 10001 }, schema).join(), /above maximum/);
  await assert.rejects(() => validateAll({ ...good(), feeBps: 30 }));
});

// Exercise the actual devnet preparation/signing boundary through HTTP. The fake endpoint only answers the
// explicit reads needed by the helper and the ordinary chain-adapters verifier; no provider is contacted.
async function devnetFixture(t, overrides = {}) {
  const work = mkdtempSync(resolve(tmpdir(), 'ghostpay-manifest-test-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const announcer = overrides.announcer ?? CANONICAL_ANNOUNCER;
  const transactions = [
    { contractName: 'GhostPayRouter', transactionType: 'CREATE', contractAddress: a(2), hash: h(1) },
    { contractName: 'GhostPaySweepRelayer', transactionType: 'CREATE', contractAddress: a(3), hash: h(2) },
  ];
  if (overrides.legacyBroadcast) {
    transactions.unshift({ contractName: 'ERC5564Announcer', transactionType: 'CREATE', contractAddress: announcer, hash: h(0) });
  }
  const broadcastPath = resolve(work, 'run-latest.json');
  writeFileSync(broadcastPath, JSON.stringify({ chain: overrides.legacyBroadcast ? 31337 : 84532, transactions }));
  const artifactsDir = resolve(work, 'artifacts');
  mkdirSync(resolve(artifactsDir, 'GhostPayRouter.sol'), { recursive: true });
  writeFileSync(resolve(artifactsDir, 'GhostPayRouter.sol/GhostPayRouter.json'), JSON.stringify({
    metadata: { compiler: { version: '0.8.28+commit.7893614a' } },
  }));
  const word = (value) => `0x${value.toString(16).padStart(64, '0')}`;
  const getters = new Map([
    ['FEE_RECIPIENT()', word(BigInt(a(4)))],
    ['ANNOUNCER()', word(BigInt(announcer))],
    ['FEE_BPS()', word(25)],
  ].map(([signature, value]) => [keccak256(new TextEncoder().encode(signature)).slice(0, 10), value]));
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { id, method, params } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    calls.push({ method, params });
    let result;
    try {
      switch (method) {
        case 'eth_chainId': result = overrides.chainId ?? '0x14a34'; break;
        case 'web3_clientVersion': result = overrides.clientVersion ?? 'anvil/v1.8.5'; break;
        case 'anvil_nodeInfo': result = { environment: { chainId: overrides.nodeChainId ?? 84532 } }; break;
        case 'eth_call':
          assert.equal(params[0].to.toLowerCase(), a(2));
          result = getters.get(params[0].data);
          assert.notEqual(result, undefined, 'unexpected router getter');
          break;
        case 'eth_getCode':
          assert.ok([a(2), a(3), announcer.toLowerCase()].includes(params[0].toLowerCase()), 'unexpected code address');
          result = overrides.emptyAnnouncer && params[0].toLowerCase() === announcer.toLowerCase() ? '0x' : '0x60006000f3';
          break;
        case 'eth_getTransactionReceipt':
          assert.equal(params[0], h(1));
          result = { status: overrides.receiptStatus ?? '0x1', blockNumber: '0x1' };
          break;
        case 'eth_getBlockByNumber': result = { timestamp: '0x6955b900' }; break;
        default: throw new Error(`unexpected fixture RPC ${method}`);
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    } catch (error) {
      res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: error.message } }));
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  t.after(() => new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept())));
  const options = {
    rpcUrl: `http://127.0.0.1:${server.address().port}`,
    broadcastPath, artifactsDir, outDir: resolve(work, 'deployments'), statePath: resolve(work, 'devnet.json'),
  };
  return { options, calls };
}

function assertNoFixtureOutput(options) {
  assert.equal(existsSync(options.outDir), false, 'a refused fixture must not write a signed manifest');
  assert.equal(existsSync(options.statePath), false, 'a refused fixture must not write browser state');
}

test('devnet manifest accepts the canonical 84532 Deploy router/sweep broadcast and verifies its signature', async (t) => {
  const { options, calls } = await devnetFixture(t);
  const result = await prepareDevnetManifest(options);
  assert.equal(result.manifest.announcer, getAddress(CANONICAL_ANNOUNCER));
  assert.equal(result.manifest.router, a(2));
  assert.equal(result.manifest.sweepRelayer, a(3));
  const signed = loadDeployment(readFileSync(resolve(options.outDir, '84532.json'), 'utf8'), 84532);
  assert.equal(verifyObjectManifestSignature(signed, [result.publicKey]).status, 'valid');
  assert.equal(JSON.parse(readFileSync(options.statePath, 'utf8')).announcer, getAddress(CANONICAL_ANNOUNCER));
  assert.ok(calls.some(({ method, params }) => method === 'eth_getCode' && params[0].toLowerCase() === CANONICAL_ANNOUNCER.toLowerCase()), 'ordinary readback must check code at the canonical announcer');
});

test('devnet manifest refuses the original 31337 token broadcast before contract reads or output', async (t) => {
  const { options, calls } = await devnetFixture(t, { legacyBroadcast: true, announcer: a(1) });
  await assert.rejects(prepareDevnetManifest(options), /Deploy \(84532\) broadcast/);
  assert.equal(calls.some(({ method }) => method === 'eth_call'), false);
  assertNoFixtureOutput(options);
});

for (const [name, overrides, message] of [
  ['noncanonical router announcer', { announcer: a(1) }, /router ANNOUNCER is not the canonical announcer/],
  ['missing canonical announcer code', { emptyAnnouncer: true }, /announcer has no code/],
  ['failed router deployment receipt', { receiptStatus: '0x0' }, /router deployment receipt missing/],
]) {
  test(`devnet manifest refuses ${name} before output`, async (t) => {
    const { options } = await devnetFixture(t, overrides);
    await assert.rejects(prepareDevnetManifest(options), message);
    assertNoFixtureOutput(options);
  });
}

for (const [name, overrides, message] of [
  ['wrong eth_chainId', { chainId: '0x7a69' }, /eth_chainId is 31337, expected 84532/],
  ['non-Anvil client', { clientVersion: 'Geth/v1' }, /web3_clientVersion is not anvil/],
  ['inconsistent Anvil chain', { nodeChainId: 31337 }, /anvil_nodeInfo did not confirm the chain/],
]) {
  test(`devnet manifest refuses ${name} before contract reads or output`, async (t) => {
    const { options, calls } = await devnetFixture(t, overrides);
    await assert.rejects(prepareDevnetManifest(options), message);
    assert.equal(calls.some(({ method }) => method === 'eth_call'), false);
    assertNoFixtureOutput(options);
  });
}

test('devnet RPC transport refuses remote, TLS and credentialed URLs before connecting', () => {
  for (const url of ['https://127.0.0.1:8546', 'http://example.com', 'http://127.0.0.2:8546', 'http://user@localhost:8546']) {
    assert.throws(() => loopbackRpc(url), /refusing non-loopback RPC/);
  }
});
