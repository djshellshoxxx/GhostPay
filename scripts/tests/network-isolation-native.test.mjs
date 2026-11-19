import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const requireFromRoot = createRequire(join(root, 'package.json'));
const ts = await import(pathToFileURL(requireFromRoot.resolve('typescript')).href);
const marker = 'synthetic-review-request-identifier';

/** Compile current leaf sources, not potentially stale workspace dist outputs. This is not a typecheck. */
async function compile(output, directory, sources, hashes, aliases = {}) {
  const target = join(output, directory);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'package.json'), '{"type":"module"}\n');
  for (const [name, sourcePath] of Object.entries(sources)) {
    const source = await readFile(join(root, sourcePath), 'utf8');
    hashes[sourcePath] = createHash('sha256').update(source).digest('hex');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace(/from (['"])(@[^'"]+)\1/g, (_all, _quote, specifier) => {
      const resolved = aliases[specifier] ?? requireFromRoot.resolve(specifier);
      return `from ${JSON.stringify(pathToFileURL(resolved).href)}`;
    });
    await writeFile(join(target, `${name}.js`), compiled);
  }
  return import(pathToFileURL(join(target, `${Object.keys(sources)[0]}.js`)).href);
}

function assertPublic(error) {
  assert.ok(error instanceof Error);
  assert.ok(!String(error).includes(marker), 'private transport details must not become public errors');
  assert.equal(error.cause, undefined, 'foreign causes must not survive error redaction');
}

async function rejection(promise) {
  try { await promise; } catch (error) { return error; }
  assert.fail('Expected rejection, operation succeeded');
}

function origin(server) {
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}

async function close(server) {
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve, reject) => {
    server.close((error) => { if (error) reject(error); else resolve(); });
  });
}

test('browser transport boundaries against controlled native HTTP endpoints', { timeout: 30_000 }, async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'ghostpay-network-isolation-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const sourceHashes = {};

  // Export the same three production symbols used by fetchTransport, without loading the whole workspace graph.
  await compile(output, 'chain-adapters', {
    rpc: 'packages/chain-adapters/src/rpc.ts', errors: 'packages/chain-adapters/src/errors.ts',
  }, sourceHashes);
  const chainExports = join(output, 'chain-adapters', 'index.js');
  await writeFile(chainExports, "export { ChainAdapterError } from './errors.js';\nexport { RpcHttpError, validateRpcUrl } from './rpc.js';\n");
  const solana = await compile(output, 'solana-stealth', {
    rpc: 'packages/solana-stealth/src/rpc.ts', errors: 'packages/solana-stealth/src/errors.ts',
  }, sourceHashes);
  const tron = await compile(output, 'tron-adapter', {
    rpc: 'packages/tron-adapter/src/rpc.ts', errors: 'packages/tron-adapter/src/errors.ts',
  }, sourceHashes);
  const net = await compile(output, 'net-transport', {
    fetchTransport: 'packages/net-transport/src/fetchTransport.ts', errors: 'packages/net-transport/src/errors.ts',
  }, sourceHashes, { '@ghostpay/chain-adapters': chainExports });
  const release = await compile(output, 'release', { release: 'apps/web/src/lib/release.ts' }, sourceHashes);
  t.diagnostic(`Source SHA-256: ${JSON.stringify(sourceHashes)}`);

  let scenario = 'redirect';
  const selectedRequests = [];
  const sinkRequests = [];
  const sink = createServer((request, response) => {
    sinkRequests.push(request.url);
    request.resume();
    response.end('forbidden destination');
  });
  const selected = createServer((request, response) => {
    selectedRequests.push(request.url);
    request.resume();
    if (scenario === 'redirect') {
      response.writeHead(307, { location: `${origin(sink)}/forbidden` });
      response.end();
    } else if (scenario === 'refused') {
      response.writeHead(429);
      response.end(marker);
    } else if (scenario === 'stalled') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.flushHeaders();
    } else if (scenario === 'invalid') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(marker);
    } else {
      response.end('abc');
    }
  });
  t.after(async () => { await close(selected); await close(sink); });
  await listen(sink);
  await listen(selected);

  // Allow CI scheduling room while retaining an independently checked finite bound for stalled native bodies.
  const operations = {
    solana: (timeoutMs = 5_000) => solana.createHttpRpc({ url: `${origin(selected)}/rpc`, timeoutMs }).request('getSlot', []),
    tron: (timeoutMs = 5_000) => tron.createHttpRpc({ baseUrl: `${origin(selected)}/prefix`, timeoutMs }).post('/wallet/getnowblock', {}),
    netTransport: (timeoutMs = 5_000) => net.createFetchTransport({ allowInsecureLocalhost: true }).send(
      `${origin(selected)}/rpc`, '{"method":"eth_getBalance","params":["synthetic-address"]}', { timeoutMs, maxBytes: 1024 },
    ),
    release: () => release.computeReleaseHash('/entry.js', fetch, `${origin(selected)}/`),
  };

  for (const [name, run] of Object.entries(operations)) {
    await t.test(`${name}: native HTTP redirect never reaches the second server`, async () => {
      scenario = 'redirect';
      const before = selectedRequests.length;
      const error = await rejection(run());
      assertPublic(error);
      assert.equal(selectedRequests.length - before, 1);
      assert.deepEqual(sinkRequests, []);
    });
    await t.test(`${name}: HTTP refusal does not echo response data or retry`, async () => {
      scenario = 'refused';
      const before = selectedRequests.length;
      const error = await rejection(run());
      assertPublic(error);
      assert.equal(selectedRequests.length - before, 1);
      assert.deepEqual(sinkRequests, []);
    });
  }

  for (const name of ['solana', 'tron', 'netTransport']) {
    await t.test(`${name}: a real stalled response body settles its deadline`, { timeout: 8_000 }, async () => {
      scenario = 'stalled';
      const before = selectedRequests.length;
      const started = performance.now();
      const error = await rejection(operations[name](2_000));
      assertPublic(error);
      assert.ok(performance.now() - started < 5_000, 'deadline must settle without the server ending its response');
      assert.equal(selectedRequests.length - before, 1);
      assert.deepEqual(sinkRequests, []);
    });
  }

  for (const name of ['solana', 'tron']) {
    await t.test(`${name}: malformed native RPC data produces a fixed error`, async () => {
      scenario = 'invalid';
      const error = await rejection(operations[name]());
      assertPublic(error);
      assert.equal(error.code, 'INVALID_RESPONSE');
      assert.deepEqual(sinkRequests, []);
    });
  }

  for (const [name, api, className] of [
    ['solana-stealth', solana, 'SolanaStealthError'], ['tron-adapter', tron, 'TronAdapterError'],
  ]) {
    const { [className]: ErrorClass } = await import(pathToFileURL(join(output, name, 'errors.js')).href);
    for (const where of ['fetch', 'stream']) {
      await t.test(`${name}: injected ${where} cannot reuse an exported error with private details`, async () => {
        const before = selectedRequests.length;
        const forged = Object.assign(new ErrorClass('TRANSPORT_FAILURE'), { message: marker, cause: { request: marker } });
        const fetchImpl = where === 'fetch'
          ? () => Promise.reject(forged)
          : () => Promise.resolve(new Response(new ReadableStream({ start(controller) { controller.error(forged); } })));
        const rpc = api.createHttpRpc(name === 'solana-stealth'
          ? { url: origin(selected), fetch: fetchImpl }
          : { baseUrl: origin(selected), fetch: fetchImpl });
        const error = await rejection(name === 'solana-stealth'
          ? rpc.request('getSlot', [])
          : rpc.post('/wallet/getnowblock', {}));
        assert.notEqual(error, forged);
        assertPublic(error);
        assert.equal(error.code, 'TRANSPORT_FAILURE');
        assert.equal(selectedRequests.length, before, 'injected failure must not fall back to native fetch');
        assert.deepEqual(sinkRequests, []);
      });
    }
  }

  await t.test('release: throwing reader cleanup cannot replace a successful hash with private error text', async () => {
    const response = new Response('abc');
    const reader = response.body.getReader();
    const nativeRelease = reader.releaseLock.bind(reader);
    reader.releaseLock = () => { nativeRelease(); throw new Error(marker); };
    response.body.getReader = () => reader;
    const result = await release.computeReleaseHash('/entry.js', () => Promise.resolve(response), `${origin(selected)}/`);
    assert.equal(result.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
