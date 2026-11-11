import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { encodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { buildErc20Metadata } from '@ghostpay/core-crypto';
import { ghostPayRouterAbi, manifestDigest, validateManifest, type Hex } from '@ghostpay/chain-adapters';
import { paymentCommands, verifyObservation } from './commands/payment.js';
import { parseArgs } from './args.js';
import { Ctx } from './ctx.js';
import { makeIo, stdoutJson } from './fixtures.testutil.js';
import { BLOCK, observation, PAYER, paymentWorld, PIN, RECIPIENT, TX, VERIFY_ARGS, word, pad } from './payment-fixtures.testutil.js';
import type { TestIo } from './fixtures.testutil.js';
import { G } from './fixtures.testutil.js';
import { rpcSession, verifiedContext } from './payment-context.js';
import { CHAINS } from '@ghostpay/chain-adapters';

async function execute(name: string, io: TestIo, args: readonly string[]): Promise<number> {
  const c = paymentCommands.find((command) => command.path.join(' ') === name)!;
  return c.handler(new Ctx(io, true), parseArgs(args, c.opts));
}

describe('payment command trust boundary', () => {
  it('reads independently named primary and secondary endpoint variables without printing their names or values', async () => {
    const { io } = paymentWorld();
    io.env['PRIVATE_PRIMARY_NAME'] = io.files.get('rpc.txt');
    io.env['PRIVATE_SECONDARY_NAME'] = io.files.get('secondary.txt');
    const args = [...VERIFY_ARGS.filter(v => v !== '--rpc-file' && v !== 'rpc.txt'),
      '--rpc-env', 'PRIVATE_PRIMARY_NAME', '--secondary-rpc-env', 'PRIVATE_SECONDARY_NAME'];
    expect(await execute('payment verify', io, args)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ providers: 2, paymentVerified: true });
    expect(io.out.join('') + io.err.join('')).not.toContain('PRIVATE_');
  });

  it.each([
    [['--rpc-env', 'RPC_SECRET_NAME'], 'RPC_SOURCE_AMBIGUOUS'],
    [['--secondary-rpc-file', 'secondary.txt', '--secondary-rpc-env', 'SECONDARY_SECRET_NAME'], 'RPC_SOURCE_AMBIGUOUS'],
  ] as const)('rejects ambiguous endpoint sources %s before issuing requests', async (extra, code) => {
    const { io, calls } = paymentWorld();
    await expect(execute('payment verify', io, [...VERIFY_ARGS, ...extra])).rejects.toMatchObject({ code });
    expect(calls).toHaveLength(0);
  });

  it.each([['https://PRIVATE_SECRET@rpc.test', 'BAD_ENV_NAME'], ['PRIVATE_UNSET_NAME', 'ENV_UNSET'], ['', 'BAD_ENV_NAME']] as const)('rejects invalid named endpoint source without echoing the source %s', async (name, code) => {
    const { io, calls } = paymentWorld();
    const args = [...VERIFY_ARGS.filter(v => v !== '--rpc-file' && v !== 'rpc.txt'), '--rpc-env', name];
    let error: unknown;
    try { await execute('payment verify', io, args); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain('PRIVATE_');
    expect(calls).toHaveLength(0);
  });

  it('enforces one total request budget across both providers and never retries exhaustion', async () => {
    const { io, calls } = paymentWorld();
    const command = paymentCommands.find(c => c.path.join(' ') === 'payment verify')!;
    const session = await rpcSession(new Ctx(io, true), parseArgs([...VERIFY_ARGS, '--secondary-rpc-file', 'secondary.txt'], command.opts), CHAINS[0]!);
    for (let i = 0; i < 254; i++) await (i % 2 === 0 ? session.client : session.secondary!).blockNumber();
    expect(calls).toHaveLength(256);
    await expect(session.secondary!.blockNumber()).rejects.toMatchObject({ code: 'RPC_FAILURE' });
    await expect(session.client.blockNumber()).rejects.toMatchObject({ code: 'RPC_FAILURE' });
    expect(calls).toHaveLength(256);
  });

  it('passes bounded transport limits and stops all requests when the shared deadline expires', async () => {
    const { io, calls } = paymentWorld();
    const send = io.rpcTransport.send.bind(io.rpcTransport);
    const limits: { timeoutMs: number; maxBytes: number }[] = [];
    io.rpcTransport.send = async (url, body, init) => { limits.push(init); return send(url, body, init); };
    const command = paymentCommands.find(c => c.path.join(' ') === 'payment verify')!;
    const session = await rpcSession(new Ctx(io, true), parseArgs(VERIFY_ARGS, command.opts), CHAINS[0]!);
    expect(limits[0]).toEqual({ timeoutMs: 5000, maxBytes: 1024 * 1024 });
    io.now += 59;
    await session.client.blockNumber();
    expect(limits[1]).toEqual({ timeoutMs: 1000, maxBytes: 1024 * 1024 });
    io.now++;
    await expect(session.client.blockNumber()).rejects.toMatchObject({ code: 'RPC_FAILURE' });
    expect(calls).toHaveLength(2);
  });

  it('fails closed if an injected transport returns more than its remaining cumulative byte allowance', async () => {
    const { io } = paymentWorld();
    const command = paymentCommands.find(c => c.path.join(' ') === 'payment verify')!;
    const session = await rpcSession(new Ctx(io, true), parseArgs(VERIFY_ARGS, command.opts), CHAINS[0]!);
    io.rpcTransport.send = (_url, body) => {
      const request = JSON.parse(body) as { id: number };
      return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 'x'.repeat(1024 * 1024 - 128) }));
    };
    for (let i = 0; i < 16; i++) await session.client.request('fixture_readOnlyBlob', []);
    await expect(session.client.request('fixture_readOnlyBlob', [])).rejects.toMatchObject({ code: 'RPC_FAILURE' });
    expect(session.stats.transportFailures).toBe(1);
  });

  it('rejects missing endpoint sources, oversized manifests and excessive release keys before RPC', async () => {
    const { io, calls } = paymentWorld();
    await expect(execute('payment verify', io, VERIFY_ARGS.filter(v => v !== '--rpc-file' && v !== 'rpc.txt'))).rejects.toMatchObject({ code: 'RPC_SOURCE_MISSING' });
    await expect(execute('payment verify', io, [...VERIFY_ARGS, ...Array.from({ length: 17 }, () => ['--release-key', G]).flat()])).rejects.toMatchObject({ code: 'BAD_RELEASE_KEY' });
    io.files.set('manifest.json', `${' '.repeat(16_384)}${io.files.get('manifest.json')!}`);
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
    expect(calls).toHaveLength(0);
  });
  it('rejects an implausible head that appears only during the final read', async () => {
    const { io } = paymentWorld();
    const send = io.rpcTransport.send.bind(io.rpcTransport);
    let headReads = 0;
    io.rpcTransport.send = async (url, body, init) => {
      const request = JSON.parse(body) as { method: string; id: number };
      if (request.method === 'eth_blockNumber' && ++headReads > 1) return JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x2540be401' });
      return send(url, body, init);
    };
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: 'RPC_FAILURE', exitCode: 4 });
    expect(io.out).toHaveLength(0);
  });

  it('rechecks the secondary canonical block before promoting a corroborated payment', async () => {
    const { io, state } = paymentWorld();
    const send = io.rpcTransport.send.bind(io.rpcTransport);
    let primaryHeads = 0;
    io.rpcTransport.send = async (url, body, init) => {
      const request = JSON.parse(body) as { method: string };
      if (request.method === 'eth_blockNumber' && !url.includes('secondary') && ++primaryHeads > 1) state.secondaryBlockHash = `0x${'ee'.repeat(32)}`;
      return send(url, body, init);
    };
    expect(await execute('payment verify', io, [...VERIFY_ARGS, '--secondary-rpc-file', 'secondary.txt'])).toBe(1);
    expect(stdoutJson(io)).toMatchObject({ status: 'reorganization-detected', paymentVerified: false });
  });

  it('binds the actual captured provider configuration without exposing private endpoints', async () => {
    const { io } = paymentWorld();
    const command = paymentCommands.find(c => c.path.join(' ') === 'payment verify')!;
    const args = parseArgs([...VERIFY_ARGS, '--secondary-rpc-file', 'secondary.txt'], command.opts);
    const first = await rpcSession(new Ctx(io, true), args, CHAINS[0]!);
    const same = await rpcSession(new Ctx(io, true), args, CHAINS[0]!);
    io.files.set('secondary.txt', 'https://replacement.example.test/PRIVATE_API_TOKEN');
    const changed = await rpcSession(new Ctx(io, true), args, CHAINS[0]!);
    expect(first.providerFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(same.providerFingerprint).toBe(first.providerFingerprint);
    expect(changed.providerFingerprint).not.toBe(first.providerFingerprint);
    expect(first.providerFingerprint).not.toContain('PRIVATE_API_TOKEN');
  });
  it('inspects a valid announcement without promoting its declared amount to a payment', async () => {
    const io = makeIo({ 'claim.json': JSON.stringify(observation()) });
    const command = paymentCommands.find((c) => c.path.join(' ') === 'payment inspect');
    expect(command).toBeDefined();
    const code = await command!.handler(new Ctx(io, true), parseArgs(['--in', 'claim.json'], command!.opts));
    expect(code).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, status: 'announced', paymentVerified: false, chainId: 11155111 });
  });

  it('verifies a final native transfer only with operator-pinned deployment and fresh canonical RPC evidence', async () => {
    const { io, calls } = paymentWorld();
    const command = paymentCommands.find((c) => c.path.join(' ') === 'payment verify');
    expect(command).toBeDefined();
    expect(await command!.handler(new Ctx(io, true), parseArgs(VERIFY_ARGS, command!.opts))).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, status: 'verified', paymentVerified: true, final: true,
      verificationScope: 'operator-pinned-testnet', providers: 1 });
    expect(calls.some((c) => c.method === 'eth_getTransactionReceipt')).toBe(true);
    expect(io.out.join('')).not.toContain('PRIVATE_API_TOKEN');
  });

  it.each([
    ['pending-finality', '0x65', '0x1'],
    ['failed', '0xc8', '0x0'],
    ['observed', '0xc8', '0x1'],
    ['unknown', '0xc8', null],
    ['reorganization-detected', '0xc8', '0x1'],
  ] as const)('keeps %s separate from verified payment', async (status, head, receiptStatus) => {
    const { io, state } = paymentWorld();
    state.head = head;
    if (receiptStatus === null) state.receipt = null;
    else state.receipt = { ...(state.receipt as Record<string, unknown>), status: receiptStatus };
    if (status === 'observed') state.tx = null;
    if (status === 'reorganization-detected') state.blockHash = `0x${'ef'.repeat(32)}`;
    expect(await execute('payment status', io, VERIFY_ARGS)).toBe(1);
    expect(stdoutJson(io)).toMatchObject({ status, paymentVerified: false });
  });

  it('fails closed when a provider returns an observation ahead of its own current head', async () => {
    const { io, state } = paymentWorld();
    state.head = '0x63';
    expect(await execute('payment verify', io, VERIFY_ARGS)).toBe(1);
    expect(stdoutJson(io)).toMatchObject({ status: 'unknown', paymentVerified: false, final: false });
  });

  it('rejects ambiguous nonboolean removed metadata before using a provider', async () => {
    const { io, calls } = paymentWorld();
    const value = observation();
    (value['log'] as Record<string, unknown>)['removed'] = 'false';
    io.files.set('claim.json', JSON.stringify(value));
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(calls).toHaveLength(0);
  });

  it('shares fresh verification context with reconciliation without printing or writing a payment result', async () => {
    const { io } = paymentWorld();
    const command = paymentCommands.find((c) => c.path.join(' ') === 'payment verify')!;
    const result = await verifyObservation(new Ctx(io, true), parseArgs(VERIFY_ARGS, command.opts), JSON.stringify(observation()));
    expect(result.output.paymentVerified).toBe(true);
    expect(result.observation.claim.announcement.blockHash).toBe(BLOCK);
    expect(result.canonicalTip).toMatchObject({ number: 200n });
    expect(await result.client.getBlock(100n)).toMatchObject({ hash: BLOCK });
    expect(io.out).toHaveLength(0);
    expect(io.files.size).toBe(4);
  });

  it.each([
    ['empty payload', null, 'INVALID_INPUT'],
    ['future version', { ...observation(), version: 2 }, 'UNSUPPORTED_VERSION'],
    ['unknown family', { ...observation(), family: 'bitcoin' }, 'UNSUPPORTED_OPERATION'],
    ['nonnumeric chain', { ...observation(), chainId: '11155111' }, 'INVALID_INPUT'],
    ['unknown chain', { ...observation(), chainId: 999999 }, 'UNSUPPORTED_CHAIN'],
    ['unexpected root field', { ...observation(), verified: true }, 'INVALID_INPUT'],
    ['wrong recipient', { ...observation(), expected: { recipient: PAYER, asset: 'native', amount: '100' } }, 'RECIPIENT_MISMATCH'],
    ['wrong asset', { ...observation(), expected: { recipient: RECIPIENT, asset: PAYER, amount: '100' } }, 'ASSET_MISMATCH'],
    ['wrong amount', { ...observation(), expected: { recipient: RECIPIENT, asset: 'native', amount: '101' } }, 'AMOUNT_MISMATCH'],
    ['zero amount', { ...observation(), expected: { recipient: RECIPIENT, asset: 'native', amount: '0' } }, 'INVALID_INPUT'],
    ['amount leading zero', { ...observation(), expected: { recipient: RECIPIENT, asset: 'native', amount: '0100' } }, 'INVALID_INPUT'],
    ['amount overflow', { ...observation(), expected: { recipient: RECIPIENT, asset: 'native', amount: (1n << 256n).toString() } }, 'INVALID_INPUT'],
    ['malformed recipient', { ...observation(), expected: { recipient: 'not-an-address', asset: 'native', amount: '100' } }, 'INVALID_INPUT'],
    ['disabled mainnet', { ...observation(), chainId: 1 }, 'CHAIN_DISABLED'],
  ])('rejects %s before contacting a provider', async (_label, value, code) => {
    const { io, calls } = paymentWorld();
    io.files.set('claim.json', JSON.stringify(value));
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['blockNumber', '0x00', 'RPC_FAILURE'], ['blockNumber', '0x2540be401', 'INVALID_INPUT'],
    ['transactionHash', 'invalid', 'INVALID_INPUT'], ['removed', true, 'INVALID_LOG'],
    ['blockHash', '0x12', 'INVALID_LOG'], ['address', PAYER, 'INVALID_LOG'],
    ['topics', [], 'INVALID_LOG'], ['data', '0x00', 'INVALID_LOG'],
  ])('rejects malformed %s in imported observations', async (field, value, code) => {
    const { io, calls } = paymentWorld();
    const v = observation();
    (v['log'] as Record<string, unknown>)[field] = value;
    io.files.set('claim.json', JSON.stringify(v));
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code });
    expect(calls).toHaveLength(0);
  });

  it('requires external expected payment facts and rejects duplicate JSON fields', async () => {
    const { io, calls } = paymentWorld();
    const value = observation();
    delete value['expected'];
    io.files.set('claim.json', JSON.stringify(value));
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: 'EXPECTED_PAYMENT_REQUIRED' });
    io.files.set('claim.json', JSON.stringify(observation()).replace('"version":1', '"version":1,"version":2'));
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(calls).toHaveLength(0);
  });

  it('never treats a syntactically valid but unsupported metadata layout as proof of amount', async () => {
    const { io } = paymentWorld();
    const value = observation();
    (value['log'] as Record<string, unknown>)['data'] = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${G}`, '0x07']);
    io.files.set('claim.json', JSON.stringify(value));
    expect(await execute('payment inspect', io, ['--in', 'claim.json'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ declaredAmount: null, declaredAsset: null, paymentVerified: false });
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: 'ASSET_MISMATCH' });
  });

  it.each([
    ['missing online consent', VERIFY_ARGS.filter((v) => v !== '--online'), 'ONLINE_REQUIRED', 2],
    ['no trust pin', VERIFY_ARGS.filter((v) => v !== '--manifest-digest' && v !== PIN), 'MANIFEST_TRUST_REQUIRED', 6],
    ['wrong trust pin', VERIFY_ARGS.map((v) => v === PIN ? `0x${'ee'.repeat(32)}` : v), 'MANIFEST_PIN_MISMATCH', 6],
    ['malformed trust pin', VERIFY_ARGS.map((v) => v === PIN ? 'secret-data' : v), 'BAD_MANIFEST_DIGEST', 2],
    ['malformed release key', [...VERIFY_ARGS, '--release-key', 'secret-data'], 'BAD_RELEASE_KEY', 2],
    ['unsigned release key', [...VERIFY_ARGS, '--release-key', G], 'MANIFEST_SIGNATURE_INVALID', 6],
    ['duplicate provider', [...VERIFY_ARGS, '--secondary-rpc-file', 'rpc.txt'], 'DUPLICATE_PROVIDER', 6],
  ] as const)('refuses %s', async (_label, args, code, exitCode) => {
    const { io, calls } = paymentWorld();
    await expect(execute('payment verify', io, args)).rejects.toMatchObject({ code, exitCode });
    expect(calls).toHaveLength(0);
  });

  it.each(['http://remote.test', 'wss://rpc.test', 'https://user:SECRET@rpc.test', 'https://rpc.test/#SECRET', 'invalid', 'x'.repeat(4097)])('refuses unsafe endpoint syntax without printing it', async (url) => {
    const { io, calls } = paymentWorld();
    io.files.set('rpc.txt', url);
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: 'RPC_URL_REJECTED', exitCode: 6 });
    expect(calls).toHaveLength(0);
    expect(io.out.join('')).not.toContain('SECRET');
  });

  it('verifies through two independently configured providers and rejects disagreement', async () => {
    const { io, state } = paymentWorld();
    const args = [...VERIFY_ARGS, '--secondary-rpc-file', 'secondary.txt'];
    expect(await execute('payment verify', io, args)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ paymentVerified: true, providers: 2 });
    io.out.length = 0;
    state.secondaryBlockHash = `0x${'ee'.repeat(32)}`;
    expect(await execute('payment verify', io, args)).toBe(1);
    expect(stdoutJson(io)).toMatchObject({ paymentVerified: false, final: false });
  });

  it('rejects provider chain switches, unreachable providers and changed contract bytecode', async () => {
    for (const kind of ['chain', 'offline', 'code'] as const) {
      const { io, state } = paymentWorld();
      if (kind === 'chain') state.chainId = '0x1';
      if (kind === 'offline') state.fail = true;
      if (kind === 'code') state.code = '0x6000';
      await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: kind === 'chain' ? 'CHAIN_MISMATCH' : kind === 'offline' ? 'RPC_FAILURE' : 'DEPLOYMENT_UNVERIFIED' });
      expect(io.out.join('') + io.err.join('')).not.toContain('PRIVATE_API_TOKEN');
    }
  });

  it('requires a transport and writes structured reports atomically through the existing I/O boundary', async () => {
    const world = paymentWorld();
    const io = makeIo(Object.fromEntries(world.io.files));
    await expect(execute('payment verify', io, VERIFY_ARGS)).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE', exitCode: 4 });
    expect(await execute('payment verify', world.io, [...VERIFY_ARGS, '--out', 'report.json'])).toBe(0);
    expect(JSON.parse(world.io.files.get('report.json')!)).toMatchObject({ paymentVerified: true, checkedAt: world.io.now });
    await expect(execute('payment verify', world.io, [...VERIFY_ARGS, '--out', 'report.json'])).rejects.toMatchObject({ code: 'WRITE_FAILED', exitCode: 3 });
  });

  it('keeps one shared RPC session and refuses cross-chain reuse', async () => {
    const { io, calls } = paymentWorld();
    const command = paymentCommands.find((c) => c.path.join(' ') === 'payment verify')!;
    const args = parseArgs(VERIFY_ARGS, command.opts);
    const context = await verifiedContext(new Ctx(io, true), args, { ...(await import('@ghostpay/chain-adapters')).CHAINS[0]! });
    const before = calls.filter((c) => c.method === 'eth_getCode').length;
    const result = await verifyObservation(new Ctx(io, true), args, JSON.stringify(observation()), context);
    expect(result.output.paymentVerified).toBe(true);
    expect(calls.filter((c) => c.method === 'eth_getCode')).toHaveLength(before);
    await expect(verifyObservation(new Ctx(io, true), args, JSON.stringify({ ...observation(), chainId: 84532 }), context)).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
  });

  it('rechecks canonicality immediately before returning a successful result', async () => {
    const { io, state } = paymentWorld();
    state.reorgAfter = 2;
    expect(await execute('payment verify', io, VERIFY_ARGS)).toBe(1);
    expect(stdoutJson(io)).toMatchObject({ status: 'reorganization-detected', paymentVerified: false, final: false });
  });

  it('verifies an exact allowlisted ERC20 transfer and refuses a changed transfer amount', async () => {
    const { io, state } = paymentWorld();
    const token: Hex = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';
    const ercMetadata: Hex = `0x${Buffer.from(buildErc20Metadata(7, token, 100n)).toString('hex')}`;
    const value = observation();
    value['expected'] = { recipient: RECIPIENT, asset: token, amount: '100' };
    const log = { ...(value['log'] as Record<string, unknown>), data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${G}`, ercMetadata]) };
    value['log'] = log;
    io.files.set('claim.json', JSON.stringify(value));
    const transfer = { address: token, blockHash: BLOCK, blockNumber: '0x64', transactionHash: TX, logIndex: '0x3', data: word(100n),
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', pad(PAYER), pad(RECIPIENT)] };
    state.receipt = { ...(state.receipt as object), logs: [transfer, log] };
    state.tx = { ...(state.tx as object), value: '0x0', input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payERC20',
      args: [token, RECIPIENT, 100n, 100n, 1_900_000_000n, `0x${G}`, ercMetadata] }) };
    expect(await execute('payment verify', io, VERIFY_ARGS)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ status: 'verified', evidence: ['router-caller', 'block-hash', 'receipt', 'transfer-log'] });
    io.out.length = 0;
    transfer.data = word(99n);
    expect(await execute('payment verify', io, VERIFY_ARGS)).toBe(1);
    expect(stdoutJson(io)).toMatchObject({ status: 'observed', paymentVerified: false });
  });

  it('accepts an authenticated manifest signature from an explicitly supplied release public key', async () => {
    const { io } = paymentWorld();
    const manifest = JSON.parse(io.files.get('manifest.json')!) as Record<string, unknown>;
    const key = new Uint8Array(32); key[31] = 1;
    const digest = manifestDigest(validateManifest(manifest, 11155111));
    manifest['signature'] = `0x${Buffer.from(secp256k1.sign(Buffer.from(digest.slice(2), 'hex'), key, { prehash: false, lowS: true })).toString('hex')}`;
    key.fill(0);
    io.files.set('manifest.json', JSON.stringify(manifest));
    const args = [...VERIFY_ARGS.filter((v) => v !== '--manifest-digest' && v !== PIN), '--release-key', G];
    expect(await execute('payment verify', io, args)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ paymentVerified: true });
  });
});
