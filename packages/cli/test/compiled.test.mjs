import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { signerPublicKeyHex } from '@ghostpay/invoice-schema';

const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const G2 = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
let dir;
let key;
let secret;
let signer;
const fixture = (name) => join(dir, name);
const put = (name, data) => writeFile(fixture(name), typeof data === 'string' || data instanceof Uint8Array ? data : JSON.stringify(data), { mode: 0o600 });
function cli(args, { input, env = {}, code = 0 } = {}) {
  const result = spawnSync(process.execPath, [bin, ...args, '--json'], { cwd: dir, encoding: 'utf8', input, env: { ...process.env, ...env }, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, code, `${args[0]} ${args[1] ?? ''}: ${result.stderr}`);
  assert.equal(result.signal, null);
  for (const value of [key, secret]) if (value) assert.equal(`${result.stdout}${result.stderr}`.includes(value), false);
  const text = result.stdout || result.stderr;
  assert.equal(text.trim().split('\n').length, 1, 'one machine-readable object');
  const parsed = JSON.parse(text);
  if (code === 0) assert.equal(parsed.ok, true);
  return parsed;
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'GhostPay compiled CLI '));
  key = randomBytes(32).toString('hex'); secret = randomBytes(32).toString('hex'); signer = signerPublicKeyHex(Buffer.from(key, 'hex'));
  await put('signing key.txt', key); await put('webhook secret.txt', secret);
  const now = Math.floor(Date.now() / 1000);
  await put('invoice spec.json', { chainId: 31337, metaAddress: `st:eth:0x${G}${G2}`, fiat: { currency: 'USD', minorUnits: '100' }, token: 'native', amountPolicy: { mode: 'fiat_quote' }, quote: { source: 'offline:fixture', timestamp: now, expiresAt: now + 600, maxSlippageBps: 50 }, expiresAt: now + 3600, lineItems: [{ description: 'Café 雪', quantity: '1', unitMinorUnits: '100' }], tax: { rateBps: 0, minorUnits: '0' }, feePolicy: 'payer_pays', signer });
});
after(async () => { await rm(dir, { recursive: true, force: true }); key = undefined; secret = undefined; });

test('compiled doctor and create → sign → verify → links → verify from a directory with spaces', async () => {
  assert.equal(cli(['doctor']).checks.find(c => c.name === 'node').ok, true);
  cli(['invoice', 'create', '--in', 'invoice spec.json', '--out', 'unsigned invoice.json']);
  cli(['invoice', 'sign', '--in', 'unsigned invoice.json', '--key-file', 'signing key.txt', '--out', 'signed invoice.json'], { env: { GHOSTPAY_SIGNING_KEY: 'invalid ignored environment value' } });
  assert.equal(cli(['invoice', 'verify', '--in', 'signed invoice.json', '--pin', signer]).trust, 'trusted-seller');
  for (const encrypt of [false, true]) {
    const linked = cli(['invoice', 'link', '--in', 'signed invoice.json', '--base', 'https://pay.example.test', ...(encrypt ? ['--encrypt'] : [])]);
    const verified = cli(['invoice', 'verify', '--in', '-', '--pin', signer], { input: linked.link });
    assert.equal(verified.signatureValid, true); assert.equal(verified.encrypted, encrypt);
  }
  assert.equal((await stat(fixture('signed invoice.json'))).mode & 0o077, 0);
  assert.equal(cli(['invoice', 'sign', '--in', 'unsigned invoice.json', '--key-file', 'signing key.txt', '--out', 'signed invoice.json'], { code: 3 }).error.code, 'WRITE_FAILED');
  cli(['invoice', 'sign', '--in', 'unsigned invoice.json', '--key-file', 'signing key.txt', '--out', 'signed invoice.json', '--force']);
});

test('compiled webhook authenticates Unicode bytes but reports stateless replay checking', async () => {
  const body = '{"text":"雪 café 💳"}\n'; await put('body.json', body);
  const signed = cli(['webhook', 'sign', '--body-file', 'body.json', '--secret-env', 'TEST_WEBHOOK_SECRET'], { env: { TEST_WEBHOOK_SECRET: secret } });
  await put('signature.txt', signed.header);
  const verify = ['webhook', 'verify', '--body-file', '-', '--header-file', 'signature.txt', '--secret-file', 'webhook secret.txt'];
  assert.equal(cli(verify, { input: body }).replayChecked, false);
  assert.equal(cli(verify, { input: body }).replayChecked, false);
  assert.equal(cli(verify, { input: body + ' ', code: 1 }).reason, 'bad-signature');
  assert.equal(cli(verify, { input: Buffer.from([0xc3]), code: 3 }).error.code, 'READ_FAILED');
});

test('compiled subscription, immutable batch confirmation, export and simulator journeys', async () => {
  const schedule = cli(['sub', 'schedule', '--anchor', '2028-01-31T00:00:00Z', '--cadence', 'monthly:1', '--count', '3']);
  assert.equal(schedule.periods[1].startIso, '2028-02-29T00:00:00Z');
  const csv = 'destination,amount,label\n0x1111111111111111111111111111111111111111,1.25,Café\n'; await put('payouts.csv', csv);
  const opts = ['--csv', 'payouts.csv', '--chain-id', '31337', '--asset', 'native', '--decimals', '2', '--min', '0.01', '--per-recipient-max', '10', '--max-recipients', '10', '--max-total', '50', '--allow-lowercase'];
  const preview = cli(['batch', 'preview', ...opts]);
  cli(['batch', 'confirm', ...opts, '--hash', preview.previewHash]);
  await put('payouts.csv', csv.replace('1.25', '1.26'));
  assert.equal(cli(['batch', 'confirm', ...opts, '--hash', preview.previewHash], { code: 1 }).reason, 'confirmation-mismatch');
  await put('ledger.json', [{ id: 'offline-test', customer: 'Café 雪', currency: 'USD', createdAt: 1_800_000_000, dueAt: 1_800_000_600, taxRateBps: 0, lineItems: [{ description: 'Café 雪', quantity: '1', unitMinor: '100' }] }]);
  cli(['export', '--in', 'ledger.json', '--out', 'accounting.csv']);
  assert.match(await readFile(fixture('accounting.csv'), 'utf8'), /Café 雪/);
  assert.deepEqual(cli(['sandbox', 'chain', 'demo', '--seed', 'companion']), cli(['sandbox', 'chain', 'demo', '--seed', 'companion']));
});

test('compiled errors stay machine-readable and secret sources are explicit', async () => {
  assert.equal(cli(['invoice', 'verify', '--in', 'missing'], { code: 3 }).error.code, 'READ_FAILED');
  await put('malformed.json', '{');
  assert.equal(cli(['invoice', 'verify', '--in', 'malformed.json'], { code: 1 }).ok, false);
  assert.equal(cli(['invoice', 'sign', '--in', 'unsigned invoice.json', '--key-env', 'MISSING_GHOSTPAY_KEY'], { code: 3 }).error.code, 'ENV_UNSET');
  assert.equal(cli(['invoice', 'sign', '--in', 'unsigned invoice.json', '--key-env', 'TEST_KEY', '--key-file', 'signing key.txt'], { env: { TEST_KEY: key }, code: 2 }).error.code, 'SECRET_SOURCE_AMBIGUOUS');
  cli(['invoice', 'sign', '--in', 'unsigned invoice.json', '--key-stdin'], { input: key });
  cli(['invoice', 'sign', '--in', 'unsigned invoice.json', '--key-env', 'TEST_KEY'], { env: { TEST_KEY: key } });
});

test('compiled executable handles a closed stdout pipe without an uncaught stack', async () => {
  const child = spawn(process.execPath, [bin, 'doctor', '--json'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.destroy(); let stderr = ''; child.stderr.setEncoding('utf8'); child.stderr.on('data', text => { stderr += text; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 3); assert.equal(stderr, '');
});

test('SIGTERM before output publication preserves the existing file and private staging', async () => {
  const wrapper = fixture('interrupt-wrapper.mjs');
  await writeFile(wrapper, `import fs from 'node:fs/promises'; import { syncBuiltinESMExports } from 'node:module';\nfs.rename = async () => { process.stderr.write('BEFORE_RENAME\\n'); await new Promise(() => setInterval(() => {}, 1000)); };\nsyncBuiltinESMExports(); process.argv = [process.execPath, ${JSON.stringify(bin)}, ...process.argv.slice(2)]; await import(${JSON.stringify(new URL('../dist/bin.js', import.meta.url).href)});\n`, { mode: 0o600 });
  await put('interrupt.csv', 'previous complete output');
  const child = spawn(process.execPath, [wrapper, 'export', '--in', 'ledger.json', '--out', 'interrupt.csv', '--force', '--json'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code, signal) => resolve({ code, signal })); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('publication boundary not reached')); }, 10_000);
    child.stderr.setEncoding('utf8'); child.stderr.on('data', text => { if (text.includes('BEFORE_RENAME')) { clearTimeout(timer); resolve(); } });
  });
  child.kill('SIGTERM'); assert.equal((await closed).signal, 'SIGTERM');
  assert.equal(await readFile(fixture('interrupt.csv'), 'utf8'), 'previous complete output');
  for (const name of await readdir(dir)) if (name.startsWith('.ghostpay-write-')) assert.equal((await stat(fixture(name))).mode & 0o077, 0);
});
