import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, type Hex } from 'viem';
import { ROUTER_ABI, TOKEN_ABI } from './abi.js';
import { CT1_INFO, ZamaBackend, type ZamaSdkPort, type ZamaSession } from './backends/zama.js';
import { createZamaSdkPort, loadZamaSdk, type ZamaSdkModules } from './backends/zama-sdk.js';
import { NOT_PROTECTED_KEYS } from './copy.js';
import { CtError } from './errors.js';
import { DEST, NOW, PAYER, ROUTER, STEALTH, STEALTH_KEY, TOKEN, makeSigner, payParams } from './fixtures.testutil.js';

const H: Hex = `0x${'ab'.repeat(32)}`;
const PROOF: Hex = '0xfeedbeef';

interface Rec {
  opens: { chainId: number; stealthKey?: Hex }[];
  encrypted: { contractAddress: string; userAddress: string; value: bigint }[];
  closed: number;
}

function fakePort(over: Partial<ZamaSession> = {}): { port: ZamaSdkPort; rec: Rec } {
  const rec: Rec = { opens: [], encrypted: [], closed: 0 };
  const port: ZamaSdkPort = {
    open(o) {
      rec.opens.push(o);
      return Promise.resolve({
        encrypt: (p) => {
          rec.encrypted.push(p);
          return Promise.resolve({ handle: H, inputProof: PROOF });
        },
        decryptValue: () => Promise.resolve(777n),
        decryptPublic: () => Promise.resolve({ cleartext: 55n, decryptionProof: PROOF }),
        close: () => {
          rec.closed++;
        },
        ...over,
      });
    },
  };
  return { port, rec };
}

describe('CT-1 Zama backend (injected port)', () => {
  it('describes itself honestly: trust, licence, relayer, full NOT-protected list', () => {
    expect(CT1_INFO.id).toBe('ct1-zama');
    expect(CT1_INFO.trust).toBe('threshold-kms');
    expect(CT1_INFO.chains).toEqual([11155111, 31337]);
    expect(CT1_INFO.relayerOrigin).toBe('https://relayer.testnet.zama.org');
    expect(CT1_INFO.licence).toContain('BSD-3-Clause-Clear');
    expect([...CT1_INFO.whatItDoesNotHide].sort()).toEqual([...NOT_PROTECTED_KEYS].sort());
  });

  it('encrypts client-side for (router, payer) and builds payConfidential calldata', async () => {
    const { port, rec } = fakePort();
    const b = new ZamaBackend(port);
    const p = payParams({ chainId: 11155111, gross: 123_456n, bufferWei: 9n });
    const tx = await b.buildPayCalldata(p);
    expect(rec.encrypted).toEqual([{ contractAddress: ROUTER, userAddress: PAYER, value: 123_456n }]);
    expect(rec.closed).toBe(1);
    expect(rec.opens[0]?.stealthKey).toBeUndefined();
    const d = decodeFunctionData({ abi: ROUTER_ABI, data: tx.data });
    expect(d.args?.[2]).toBe(H);
    expect(d.args?.[3]).toBe(PROOF);
    expect(tx.value).toBe(9n);
    // the plaintext amount is not present in the calldata
    expect(tx.data.includes((123_456n).toString(16).padStart(8, '0'))).toBe(false);
  });

  it('closes the session even if encryption fails', async () => {
    const { port, rec } = fakePort({ encrypt: () => Promise.reject(new Error('boom')) });
    await expect(new ZamaBackend(port).encryptAmount({ chainId: 11155111, contract: ROUTER, user: PAYER, amount: 1n })).rejects.toThrow('boom');
    expect(rec.closed).toBe(1);
  });

  it('user decrypt passes the stealth key only into the SDK session, once, and closes it', async () => {
    const { port, rec } = fakePort();
    const signer = makeSigner();
    const v = await new ZamaBackend(port).userDecrypt({ chainId: 11155111, contract: TOKEN, handle: H, signer });
    expect(v).toBe(777n);
    expect(signer.calls).toBe(1);
    expect(rec.opens).toEqual([{ chainId: 11155111, stealthKey: STEALTH_KEY }]);
    expect(rec.closed).toBe(1);
  });

  it('user decrypt of the zero handle needs no request', async () => {
    const { port, rec } = fakePort();
    const v = await new ZamaBackend(port).userDecrypt({ chainId: 11155111, contract: TOKEN, handle: `0x${'00'.repeat(32)}`, signer: makeSigner() });
    expect(v).toBe(0n);
    expect(rec.opens).toEqual([]);
  });

  it('maps SDK failures to DECRYPT_FAILED without leaking the cause and still closes', async () => {
    const { port, rec } = fakePort({ decryptValue: () => Promise.reject(new Error('relayer said secret-detail')) });
    const err = await new ZamaBackend(port).userDecrypt({ chainId: 11155111, contract: TOKEN, handle: H, signer: makeSigner() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CtError);
    expect((err as CtError).code).toBe('DECRYPT_FAILED');
    expect((err as CtError).message).not.toContain('secret-detail');
    expect(rec.closed).toBe(1);
  });

  it('passes through CtError from the session', async () => {
    const { port } = fakePort({ decryptValue: () => Promise.reject(new CtError('ACL_DENIED', 'no')) });
    await expect(new ZamaBackend(port).userDecrypt({ chainId: 11155111, contract: TOKEN, handle: H, signer: makeSigner() })).rejects.toMatchObject({ code: 'ACL_DENIED' });
  });

  it('finalizeUnwrap fetches the public proof', async () => {
    const { port, rec } = fakePort();
    const tx = await new ZamaBackend(port).finalizeUnwrap({ chainId: 11155111, token: TOKEN, requestId: H });
    expect(decodeFunctionData({ abi: TOKEN_ABI, data: tx.data }).args).toEqual([H, 55n, PROOF]);
    expect(rec.closed).toBe(1);
  });

  it('finalizeUnwrap maps failures to PROOF_UNAVAILABLE', async () => {
    const { port } = fakePort({ decryptPublic: () => Promise.reject(new Error('x')) });
    await expect(new ZamaBackend(port).finalizeUnwrap({ chainId: 11155111, token: TOKEN, requestId: H })).rejects.toMatchObject({ code: 'PROOF_UNAVAILABLE' });
    const { port: p2 } = fakePort({ decryptPublic: () => Promise.reject(new CtError('ACL_DENIED', 'x')) });
    await expect(new ZamaBackend(p2).finalizeUnwrap({ chainId: 11155111, token: TOKEN, requestId: H })).rejects.toMatchObject({ code: 'ACL_DENIED' });
  });

  it('pure builders', () => {
    const b = new ZamaBackend(fakePort().port);
    const op = b.buildSetOperator({ chainId: 11155111, token: TOKEN, operator: ROUTER, until: NOW + 900, nowSec: NOW });
    expect(op.to).toBe(TOKEN);
    expect(() => b.buildSetOperator({ chainId: 11155111, token: TOKEN, operator: ROUTER, until: NOW + 901, nowSec: NOW })).toThrow(/within 900/);
    expect(b.buildConfidentialTransfer({ chainId: 11155111, token: TOKEN, to: DEST, amountHandle: H }).to).toBe(TOKEN);
    expect(b.buildUnwrap({ chainId: 11155111, token: TOKEN, from: STEALTH, to: DEST, amountHandle: H }).to).toBe(TOKEN);
  });

  it('refuses Base Sepolia, mainnets and unknown chains on every entry point (CT-PAY-4/5)', async () => {
    const { port, rec } = fakePort();
    const b = new ZamaBackend(port);
    for (const chainId of [1, 137, 8453, 42161, 84532, 421614]) {
      await expect(b.encryptAmount({ chainId, contract: ROUTER, user: PAYER, amount: 1n })).rejects.toBeInstanceOf(CtError);
      await expect(b.buildPayCalldata(payParams({ chainId }))).rejects.toBeInstanceOf(CtError);
      expect(() => b.buildSetOperator({ chainId, token: TOKEN, operator: ROUTER, until: NOW + 1, nowSec: NOW })).toThrow(CtError);
      await expect(b.userDecrypt({ chainId, contract: TOKEN, handle: H, signer: makeSigner() })).rejects.toBeInstanceOf(CtError);
      expect(() => b.buildConfidentialTransfer({ chainId, token: TOKEN, to: DEST, amountHandle: H })).toThrow(CtError);
      expect(() => b.buildUnwrap({ chainId, token: TOKEN, from: PAYER, to: DEST, amountHandle: H })).toThrow(CtError);
      await expect(b.finalizeUnwrap({ chainId, token: TOKEN, requestId: H })).rejects.toBeInstanceOf(CtError);
    }
    expect(rec.opens).toEqual([]);
  });

  it('validates inputs before opening any session', async () => {
    const { port, rec } = fakePort();
    const b = new ZamaBackend(port);
    await expect(b.encryptAmount({ chainId: 11155111, contract: ROUTER, user: PAYER, amount: -1n })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(b.userDecrypt({ chainId: 11155111, contract: TOKEN, handle: '0x1', signer: makeSigner() })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(b.finalizeUnwrap({ chainId: 11155111, token: TOKEN, requestId: '0x1' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(rec.opens).toEqual([]);
  });
});

describe('createZamaSdkPort (glue over @zama-fhe/sdk, loader injected)', () => {
  function fakeModules() {
    const calls: Record<string, unknown[]> = { config: [], encrypt: [], decrypt: [], pub: [], terminate: [] };
    const zama = {
      encrypt: vi.fn((p: unknown) => {
        calls['encrypt']?.push(p);
        return Promise.resolve({ encryptedValues: [H], inputProof: PROOF });
      }),
      decryption: {
        decryptValues: vi.fn((i: unknown) => {
          calls['decrypt']?.push(i);
          return Promise.resolve({ [H]: 42n });
        }),
        decryptPublicValues: vi.fn((i: unknown) => {
          calls['pub']?.push(i);
          return Promise.resolve({ clearValues: { [H]: 9n }, decryptionProof: PROOF, abiEncodedClearValues: '0x' });
        }),
      },
      terminate: vi.fn(() => calls['terminate']?.push(1)),
    };
    const modules = {
      sdk: {
        MemoryStorage: class {},
        ZamaSDK: class {
          public constructor() {
            return zama;
          }
        },
        cleartext: () => ({ type: 'cleartext' }),
      },
      adapter: {
        createConfig: (c: unknown) => {
          calls['config']?.push(c);
          return c;
        },
      },
      chains: { sepolia: { id: 11155111 }, hardhat: { id: 31337 } },
      relayer: { make: () => ({ type: 'fake' }) },
      viem: {
        defineChain: (c: unknown) => c,
        http: (u: string) => ({ url: u }),
        createPublicClient: (c: unknown) => ({ public: c }),
        createWalletClient: (c: unknown) => ({ wallet: c }),
      },
      accounts: { privateKeyToAccount: (k: string) => ({ key: k }), generatePrivateKey: () => '0xgenerated' },
    } as unknown as ZamaSdkModules;
    return { modules, calls, zama };
  }

  it('builds a memory-storage, telemetry-off config and wraps encrypt/decrypt', async () => {
    const { modules, calls, zama } = fakeModules();
    const port = createZamaSdkPort({ rpcUrls: { 11155111: 'http://rpc.invalid' }, runtime: 'node', load: () => Promise.resolve(modules) });
    const s = await port.open({ chainId: 11155111, stealthKey: STEALTH_KEY });
    const cfg = calls['config']?.[0] as Record<string, unknown>;
    expect(cfg['telemetry']).toBe(false);
    expect(cfg['storage']).toBeDefined();
    expect((cfg['walletClient'] as { wallet: { account: { key: string } } }).wallet.account.key).toBe(STEALTH_KEY);
    expect((cfg['chains'] as { relayerUrl: string; network: string }[])[0]).toMatchObject({ relayerUrl: 'https://relayer.testnet.zama.org', network: 'http://rpc.invalid' });
    expect(Object.keys(cfg['relayers'] as object)).toEqual(['11155111']);

    expect(await s.encrypt({ contractAddress: ROUTER, userAddress: PAYER, value: 5n })).toEqual({ handle: H, inputProof: PROOF });
    expect(calls['encrypt']?.[0]).toEqual({ values: [{ type: 'euint64', value: 5n }], contractAddress: ROUTER, userAddress: PAYER });
    expect(await s.decryptValue({ handle: H, contractAddress: TOKEN })).toBe(42n);
    expect(await s.decryptPublic(H)).toEqual({ cleartext: 9n, decryptionProof: PROOF });
    s.close();
    expect(zama.terminate).toHaveBeenCalledTimes(1);
  });

  it('uses a throw-away key when no stealth key is given and the local preset for 31337', async () => {
    const { modules, calls } = fakeModules();
    const port = createZamaSdkPort({ rpcUrls: { 31337: 'http://127.0.0.1:8545' }, runtime: 'cleartext', load: () => Promise.resolve(modules) });
    await port.open({ chainId: 31337 });
    const cfg = calls['config']?.[0] as { walletClient: { wallet: { account: { key: string } } }; chains: { id: number }[] };
    expect(cfg.walletClient.wallet.account.key).toBe('0xgenerated');
    expect(cfg.chains[0]?.id).toBe(31337);
  });

  it('refuses bad chains, missing RPC and cleartext on Sepolia before loading the SDK', async () => {
    const load = vi.fn(() => Promise.reject(new Error('must not load')));
    const port = createZamaSdkPort({ rpcUrls: { 11155111: 'http://rpc.invalid' }, runtime: 'cleartext', load });
    await expect(port.open({ chainId: 8453 })).rejects.toMatchObject({ code: 'MAINNET_REFUSED' });
    await expect(port.open({ chainId: 84532 })).rejects.toMatchObject({ code: 'CHAIN_NOT_SUPPORTED' });
    await expect(port.open({ chainId: 31337 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(port.open({ chainId: 11155111 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(load).not.toHaveBeenCalled();
  });

  it('rejects unexpected decrypted value types and empty encryption results', async () => {
    const { modules, zama } = fakeModules();
    zama.decryption.decryptValues.mockResolvedValueOnce({ [H]: 'text' as unknown as bigint });
    zama.encrypt.mockResolvedValueOnce({ encryptedValues: [], inputProof: PROOF });
    const port = createZamaSdkPort({ rpcUrls: { 11155111: 'http://rpc.invalid' }, runtime: 'web', load: () => Promise.resolve(modules) });
    const s = await port.open({ chainId: 11155111 });
    await expect(s.decryptValue({ handle: H, contractAddress: TOKEN })).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
    await expect(s.encrypt({ contractAddress: ROUTER, userAddress: PAYER, value: 1n })).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('the real loader resolves all pinned SDK entry points (no network)', async () => {
    for (const runtime of ['node', 'web', 'cleartext'] as const) {
      const m = await loadZamaSdk(runtime);
      expect(typeof m.sdk.ZamaSDK).toBe('function');
      expect(typeof m.adapter.createConfig).toBe('function');
      expect(m.chains.sepolia.id).toBe(11155111);
      expect(m.relayer.make()).toBeDefined();
    }
  });
});
