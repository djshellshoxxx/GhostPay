import { describe, expect, it } from 'vitest';
import { encodeAnnouncementMemo, encodeMetaAddress as solanaMeta, secretScalarFromBytes as solanaSecret, stealthKeysFromSecrets } from '@ghostpay/chain-solana';
import { encodeSilentPaymentAddress } from '@ghostpay/btc-silent-payments';
import { chainCommands, diagnosticsRpcCommands } from './commands/chain.js';
import { Ctx } from './ctx.js';
import { parseArgs } from './args.js';
import { G, G2, makeIo, stdoutJson, type TestIo } from './fixtures.testutil.js';
import { paymentWorld, PIN } from './payment-fixtures.testutil.js';

const GENESIS = { height: 0, hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
  headerHex: '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c' };
const BLOCK_ONE = '010000006fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000982051fd1e4ba744bbbe680e1fee14677ba1a3c3540bf7b1cdb606e857233e0e61bc6649ffff001d01e36299';

async function execute(path: string, io: TestIo, argv: readonly string[] = []): Promise<number> {
  const command = [...chainCommands, ...diagnosticsRpcCommands].find((c) => c.path.join(' ') === path)!;
  return command.handler(new Ctx(io, true), parseArgs(argv, command.opts));
}

function solanaKeys() {
  const spending = new Uint8Array(32); spending[0] = 1;
  const viewing = new Uint8Array(32); viewing[0] = 2;
  return stealthKeysFromSecrets(solanaSecret(spending), solanaSecret(viewing));
}

describe('chain and operator inspection', () => {
  it.each([
    ['evm', 'bad', [], 'INVALID_INPUT'], ['bitcoin', 'x'.repeat(2049), [], 'INVALID_INPUT'],
    ['future-chain', 'public', [], 'UNSUPPORTED_FAMILY'], ['evm', `st:eth:0x${G}${G2}`, ['--network', 'testnet'], 'BAD_NETWORK'],
    ['bitcoin', 'public', ['--network', 'regtest'], 'BAD_NETWORK'],
  ])('rejects unsupported or invalid %s recipient input', async (family, value, extra, code) => {
    const io = makeIo({ 'address.txt': value });
    await expect(execute('chain recipient inspect', io, ['--family', family, '--in', 'address.txt', ...extra])).rejects.toMatchObject({ code });
    expect(io.out).toHaveLength(0);
  });

  it('rejects mismatched Bitcoin recipient networks and malformed Solana announcements', async () => {
    const io = makeIo({ 'address.txt': encodeSilentPaymentAddress('testnet', Buffer.from(G, 'hex'), Buffer.from(G2, 'hex')), 'memo.txt': 'gpst1:invalid' });
    await expect(execute('chain recipient inspect', io, ['--family', 'bitcoin', '--network', 'mainnet', '--in', 'address.txt'])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(execute('chain solana announcement inspect', io, ['--in', 'memo.txt'])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it.each(['disagree', 'behind', 'implausible-secondary', 'agree'] as const)('reports %s secondary RPC independently from provider trust', async (which) => {
    const { io, state } = paymentWorld();
    if (which === 'disagree') state.secondaryBlockHash = `0x${'ef'.repeat(32)}`;
    const send = io.rpcTransport.send.bind(io.rpcTransport);
    io.rpcTransport.send = async (url, body, init) => {
      const request = JSON.parse(body) as { id: number; method: string };
      if (url.includes('secondary') && request.method === 'eth_blockNumber' && ['behind', 'implausible-secondary'].includes(which))
        return JSON.stringify({ jsonrpc: '2.0', id: request.id, result: which === 'behind' ? '0x63' : '0x2540be401' });
      return send(url, body, init);
    };
    expect(await execute('diagnostics rpc', io, ['--chain', '11155111', '--online', '--rpc-file', 'rpc.txt', '--secondary-rpc-file', 'secondary.txt', '--out', 'health.json'])).toBe(which === 'agree' ? 0 : 1);
    expect(stdoutJson(io)).toMatchObject({ providers: 2, providersAgree: which === 'agree', providerTrustEstablished: false });
    expect(io.files.get('health.json')).not.toContain('PRIVATE_API_TOKEN');
  });

  it.each(['implausible', 'missing'] as const)('fails closed on %s RPC head data', async (which) => {
    const { io, state } = paymentWorld();
    if (which === 'implausible') state.head = '0x2540be401';
    else {
      const send = io.rpcTransport.send.bind(io.rpcTransport);
      io.rpcTransport.send = async (url, body, init) => {
        const request = JSON.parse(body) as { id: number; method: string };
        return request.method === 'eth_getBlockByNumber' ? JSON.stringify({ jsonrpc: '2.0', id: request.id, result: null }) : send(url, body, init);
      };
    }
    await expect(execute('diagnostics rpc', io, ['--chain', '11155111', '--online', '--rpc-file', 'rpc.txt'])).rejects.toMatchObject({ code: 'RPC_FAILURE', exitCode: 4 });
  });

  it('keeps disabled assets inspectable but refuses disabled live verification and unknown chains', async () => {
    const { io, calls } = paymentWorld();
    expect(await execute('chain assets', io, ['--chain', '1'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ enabled: false });
    await expect(execute('chain assets', io, ['--chain', '123456'])).rejects.toMatchObject({ code: 'UNSUPPORTED_CHAIN' });
    await expect(execute('chain deployment verify', io, ['--chain', '1'])).rejects.toMatchObject({ code: 'CHAIN_DISABLED' });
    expect(calls).toHaveLength(0);
  });

  it('distinguishes unpinned schema inspection from trusted live deployment read-back through two providers', async () => {
    const { io } = paymentWorld();
    expect(await execute('chain deployment inspect', io, ['--chain', '11155111', '--in', 'manifest.json'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ manifestTrusted: false, deploymentVerified: false });
    io.out.length = 0;
    expect(await execute('chain deployment verify', io, ['--chain', '11155111', '--manifest', 'manifest.json', '--manifest-digest', PIN,
      '--online', '--rpc-file', 'rpc.txt', '--secondary-rpc-file', 'secondary.txt'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ providers: 2, deploymentVerified: true, policyEnabled: false });
  });

  it.each([
    ['network', 'invalid', 'BAD_NETWORK'], ['version', 2, 'UNSUPPORTED_VERSION'], ['network', 'regtest', 'NETWORK_MISMATCH'],
    ['headers', null, 'INVALID_INPUT'], ['headers', ['00'], 'INVALID_INPUT'], ['headers', Array.from({ length: 4097 }, () => BLOCK_ONE), 'INVALID_INPUT'],
  ])('rejects unsupported Bitcoin snapshot %s', async (field, value, code) => {
    const snapshot = { version: 1, network: 'mainnet', checkpoint: GENESIS, headers: [BLOCK_ONE], [field]: value };
    const io = makeIo({ 'headers.json': JSON.stringify(snapshot), 'checkpoint.json': JSON.stringify(GENESIS) });
    await expect(execute('chain bitcoin headers verify', io, ['--in', 'headers.json', '--checkpoint', 'checkpoint.json', '--network', value === 'invalid' ? 'invalid' : 'mainnet'])).rejects.toMatchObject({ code });
    expect(io.out).toHaveLength(0);
  });

  it.each([
    ['height', -1], ['hash', '00'], ['headerHex', '00'], ['previousHeaders', 'invalid'],
    ['previousHeaders', ['00']], ['previousHeaders', Array.from({ length: 11 }, () => GENESIS.headerHex)],
    ['hash', 'ef'.repeat(32)],
  ])('rejects an invalid independent Bitcoin checkpoint %s', async (field, value) => {
    const io = makeIo({ 'headers.json': JSON.stringify({ version: 1, network: 'mainnet', checkpoint: GENESIS, headers: [BLOCK_ONE] }),
      'checkpoint.json': JSON.stringify({ ...GENESIS, [field]: value }) });
    await expect(execute('chain bitcoin headers verify', io, ['--in', 'headers.json', '--checkpoint', 'checkpoint.json', '--network', 'mainnet'])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(io.out).toHaveLength(0);
  });
  it('inspects a valid Solana announcement memo offline without promoting its opaque metadata to a payment', async () => {
    const keys = solanaKeys();
    const memo = encodeAnnouncementMemo({ ephemeralPublicKey: keys.viewPublicKey, viewTag: 17, metadata: new Uint8Array([1, 2]) });
    keys.spendSecret.fill(0); keys.viewSecret.fill(0);
    const io = makeIo({ 'memo.txt': memo });
    expect(await execute('chain solana announcement inspect', io, ['--in', 'memo.txt'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ valid: true, family: 'solana', status: 'announced', viewTag: 17,
      metadataHex: '0102', paymentVerified: false, networkUsed: false });
  });

  it.each(['evm', 'solana', 'bitcoin'] as const)('validates %s public recipient encoding with its shared decoder', async (family) => {
    const keys = solanaKeys();
    const canonical = family === 'evm' ? `st:eth:0x${G}${G2}` : family === 'solana' ? solanaMeta(keys)
      : encodeSilentPaymentAddress('testnet', Buffer.from(G, 'hex'), Buffer.from(G2, 'hex'));
    keys.spendSecret.fill(0); keys.viewSecret.fill(0);
    const io = makeIo({ 'address.txt': canonical });
    expect(await execute('chain recipient inspect', io, ['--family', family, '--in', 'address.txt', ...(family === 'bitcoin' ? ['--network', 'testnet'] : [])])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ family, valid: true, canonical, paymentVerified: false, identityVerified: false });
  });
  it('lists actual enabled testnets and keeps mainnets and experimental families explicitly gated', async () => {
    const io = makeIo();
    expect(await execute('chain list', io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true });
    expect(stdoutJson(io)['chains']).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: 'evm', chainId: 'eip155:11155111', enabled: true }),
      expect.objectContaining({ family: 'evm', chainId: 'eip155:1', enabled: false }),
      expect.objectContaining({ family: 'tron', chainId: 'tron-nile', productionReady: false }),
    ]));
  });

  it('reports native and allowlisted assets without enabling disabled chains', async () => {
    const io = makeIo();
    expect(await execute('chain assets', io, ['--chain', '11155111'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ chainId: 'eip155:11155111' });
    expect(stdoutJson(io)['assets']).toEqual(expect.arrayContaining([
      expect.objectContaining({ asset: 'native', symbol: 'ETH', decimals: 18 }),
      expect.objectContaining({ symbol: 'USDC', decimals: 6 }),
    ]));
  });

  it('inspects manifest schema and supplied trust pins without claiming a deployed or verified payment', async () => {
    const { io, calls } = paymentWorld();
    expect(await execute('chain deployment inspect', io, ['--chain', '11155111', '--in', 'manifest.json', '--manifest-digest', PIN])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, manifestTrusted: true, deploymentVerified: false, paymentVerified: false });
    expect(calls).toHaveLength(0);
  });

  it('checks an RPC endpoint only with explicit online consent and never equates response with provider trust', async () => {
    const { io, calls } = paymentWorld();
    expect(await execute('diagnostics rpc', io, ['--chain', '11155111', '--online', '--rpc-file', 'rpc.txt'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, reachable: true, chainMatches: true, providerTrustEstablished: false, head: '200' });
    expect(calls.map((c) => c.method)).toEqual(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber']);
    expect(io.out.join('')).not.toContain('PRIVATE_API_TOKEN');
  });

  it('verifies pinned deployment bytecode with live RPC without activating policy or payment signing', async () => {
    const { io } = paymentWorld();
    expect(await execute('chain deployment verify', io, ['--chain', '11155111', '--manifest', 'manifest.json', '--manifest-digest', PIN,
      '--online', '--rpc-file', 'rpc.txt'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, deploymentVerified: true, paymentVerified: false, productionReady: false, policyEnabled: false });
  });

  it('validates real Bitcoin header-chain data against a separately supplied checkpoint', async () => {
    const checkpoint = { height: 0, hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      headerHex: '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c', previousHeaders: [] };
    const headers = ['010000006fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000982051fd1e4ba744bbbe680e1fee14677ba1a3c3540bf7b1cdb606e857233e0e61bc6649ffff001d01e36299'];
    const io = makeIo({ 'headers.json': JSON.stringify({ version: 1, network: 'mainnet', checkpoint, headers }),
      'checkpoint.json': JSON.stringify(checkpoint) });
    expect(await execute('chain bitcoin headers verify', io, ['--in', 'headers.json', '--checkpoint', 'checkpoint.json', '--network', 'mainnet'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ headersValid: true, tipHeight: 1, tipHash: '00000000839a8e6886ab5951d76f411475428afc90947ee320161bbf18eb6048',
      transactionsVerified: false, signetSignaturesVerified: false, canonicalNetworkEstablished: false });
  });

  it('inspects TRON public addresses with the existing checksum decoder', async () => {
    const io = makeIo({ 'address.txt': '410000000000000000000000000000000000000000' });
    expect(await execute('chain recipient inspect', io, ['--family', 'tron', '--in', 'address.txt'])).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ family: 'tron', valid: true, paymentVerified: false, canonical: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' });
  });
});
