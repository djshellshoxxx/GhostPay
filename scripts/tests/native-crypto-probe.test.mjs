import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual serialized browser callback, not a mirror of its implementation.
const source = readFileSync(new URL('../../apps/web/e2e/stealthExportFixtures.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('stealthExportFixtures.ts', source, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'installCryptoProbe');
assert.ok(declaration);
let callback;
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'addInitScript') {
    assert.equal(callback, undefined);
    callback = node.arguments[0];
  }
  ts.forEachChild(node, visit);
}
visit(declaration);
assert.ok(callback && ts.isArrowFunction(callback));
const executable = ts.transpileModule(`(${callback.getText(parsed)})();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function install(scheduler) {
  const timers = [], events = new Map(), markers = [], cryptoCalls = [];
  const timerHandle = {};
  const ciphertext = new ArrayBuffer(3), plaintext = new ArrayBuffer(4);
  const nativeTimeout = function (...args) { timers.push({ receiver: this, args }); return timerHandle; };
  const sandbox = {
    scheduler, setTimeout: nativeTimeout,
    console: { debug: (message) => markers.push(message) },
    addEventListener: (name, callback) => events.set(name, callback),
    crypto: { subtle: {
      encrypt: async (...args) => { cryptoCalls.push(['encrypt', ...args]); return ciphertext; },
      decrypt: async (...args) => { cryptoCalls.push(['decrypt', ...args]); return plaintext; },
    } },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(executable, sandbox);
  return { sandbox, timers, events, markers, timerHandle, nativeTimeout, ciphertext, plaintext, cryptoCalls };
}

test('scheduler instrumentation preserves its receiver and exact promise without replacing timers', async () => {
  const promise = Promise.resolve('unchanged');
  const scheduler = { yield() { assert.equal(this, scheduler); return promise; } };
  const f = install(scheduler);
  f.sandbox.__gpProbe.announceYield = true;
  assert.equal(scheduler.yield(), promise);
  assert.equal(await promise, 'unchanged');
  assert.equal(f.sandbox.__gpProbe.yields, 1);
  assert.deepEqual(f.markers, ['gp-probe:kdf-yield']);
  assert.equal(f.sandbox.__gpProbe.announceYield, false);
  assert.equal(f.sandbox.setTimeout, f.nativeTimeout);
});

test('timer fallback forwards the exact receiver, callback, arguments and return handle without a scheduler shim', () => {
  const f = install(undefined);
  const receiver = {}, callback = () => {};
  const result = f.sandbox.setTimeout.call(receiver, callback, 0, 'ordinary argument');
  assert.equal(result, f.timerHandle);
  assert.equal(f.timers[0].receiver, receiver);
  assert.deepEqual(f.timers[0].args, [callback, 0, 'ordinary argument']);
  assert.equal(f.sandbox.__gpProbe.yields, 1);
  assert.equal(f.sandbox.scheduler, undefined);
});

test('fallback observes only explicit zero-delay host scheduling and retains click snapshots', () => {
  const f = install(undefined);
  f.sandbox.setTimeout(() => {}, 10);
  f.sandbox.setTimeout(() => {});
  assert.equal(f.sandbox.__gpProbe.yields, 0);
  f.sandbox.setTimeout(() => {}, 0);
  f.events.get('click')();
  assert.equal(f.sandbox.__gpProbe.yields, 1);
  assert.deepEqual([...f.sandbox.__gpProbe.yieldsAtClick], [1]);
  assert.equal(f.timers.length, 3);
});

test('both real AES result identities and invocation arguments remain unchanged', async () => {
  const f = install(undefined);
  const algorithm = { name: 'AES-GCM' }, key = {}, input = new Uint8Array([1, 2]);
  assert.equal(await f.sandbox.crypto.subtle.encrypt(algorithm, key, input), f.ciphertext);
  assert.equal(await f.sandbox.crypto.subtle.decrypt(algorithm, key, input), f.plaintext);
  assert.deepEqual(f.cryptoCalls, [['encrypt', algorithm, key, input], ['decrypt', algorithm, key, input]]);
  assert.equal(f.sandbox.__gpProbe.encrypts, 1);
  assert.equal(f.sandbox.__gpProbe.decrypts, 1);
});

test('an authored AES hold releases the original result only after the explicit release', async () => {
  const f = install(undefined);
  let held;
  const reachedHold = new Promise((resolve) => { held = resolve; });
  const record = f.sandbox.console.debug;
  f.sandbox.console.debug = (marker) => { record(marker); if (marker === 'gp-probe:encrypt-held') held(); };
  f.sandbox.__gpProbe.hold = 'encrypt';
  let settled = false;
  const pending = f.sandbox.crypto.subtle.encrypt('test').then((value) => { settled = true; return value; });
  await reachedHold;
  assert.equal(settled, false);
  assert.equal(f.sandbox.__gpProbe.encrypts, 1);
  assert.deepEqual(f.markers, ['gp-probe:encrypt-held']);
  assert.equal(typeof f.sandbox.__gpProbe.release, 'function');
  f.sandbox.__gpProbe.release();
  assert.equal(await pending, f.ciphertext);
  assert.equal(settled, true);
});

test('scheduler rejection remains the original rejection', async () => {
  const failure = new Error('ordinary scheduler rejection');
  const scheduler = { yield: () => Promise.reject(failure) };
  install(scheduler);
  await assert.rejects(scheduler.yield(), (error) => error === failure);
});
