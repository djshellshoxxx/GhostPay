import { describe, expect, it } from 'vitest';
import { keccak256, type Address, type Hex } from 'viem';
import * as viemAccounts from 'viem/accounts';
import { ZamaBackend, type ZamaSdkPort, type ZamaSession } from './backends/zama.js';
import { createZamaSdkPort, type ZamaSdkModules } from './backends/zama-sdk.js';
import { CtError } from './errors.js';
import { CT1_MANIFEST, verifyManifestOnChain, type CtManifest } from './manifest.js';
import { getBackend } from './registry.js';
import { DEST, NOW, OTHER, PAYER, ROUTER, STEALTH, TOKEN, makeSigner, payParams } from './fixtures.testutil.js';

const H: Hex = `0x${'ab'.repeat(32)}`;
const PROOF: Hex = '0xfeedbeef';
const CHAINS = [11155111, 31337] as const;

/** CT1_MANIFEST with GhostPay contracts pinned on every chain (test only; the shipped manifest pins none). */
function pinned(router: Address | null = ROUTER, tokens: readonly Address[] = [TOKEN]): CtManifest {
  const chains = Object.fromEntries(Object.entries(CT1_MANIFEST.chains).map(([k, c]) => [k, { ...c, ghostpay: { router, tokens } }]));
  return { ...CT1_MANIFEST, chains };
}

function fakePort(over: Partial<ZamaSession> = {}): { port: ZamaSdkPort; opens: number; closed: () => number } {
  const st = { opens: 0, closed: 0 };
  const port: ZamaSdkPort = {
    open() {
      st.opens++;
      return Promise.resolve({
        encrypt: () => Promise.resolve({ handle: H, inputProof: PROOF }),
        decryptValue: () => Promise.resolve(7n),
        decryptPublic: () => Promise.resolve({ cleartext: 5n, decryptionProof: PROOF }),
        close: () => {
          st.closed++;
        },
        ...over,
      });
    },
  };
  return {
    port,
    get opens() {
      return st.opens;
    },
    closed: () => st.closed,
  };
}

async function codeOf(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    if (typeof p === 'function') p();
    else await p;
  } catch (e) {
    return e instanceof CtError ? e.code : `raw:${String(e)}`;
  }
  return 'ok';
}

/** Runs every manifest-checked entry point of `b` and returns the codes. */
async function allCodes(b: ZamaBackend, chainId: number, over: { router?: Address; token?: Address; operator?: Address; contract?: Address } = {}) {
  const router = over.router ?? ROUTER;
  const token = over.token ?? TOKEN;
  return {
    encryptAmount: await codeOf(b.encryptAmount({ chainId, contract: over.contract ?? router, user: PAYER, amount: 1n })),
    buildPayCalldata: await codeOf(b.buildPayCalldata(payParams({ chainId, router, token }))),
    buildSetOperator: await codeOf(() => b.buildSetOperator({ chainId, token, operator: over.operator ?? router, until: NOW + 600, nowSec: NOW })),
    buildConfidentialTransfer: await codeOf(() => b.buildConfidentialTransfer({ chainId, token, to: DEST, amountHandle: H })),
    buildUnwrap: await codeOf(() => b.buildUnwrap({ chainId, token, from: STEALTH, to: DEST, amountHandle: H })),
    finalizeUnwrap: await codeOf(b.finalizeUnwrap({ chainId, token, requestId: H })),
  };
}

describe('B2: ZamaBackend checks router, operator and token against the manifest', () => {
  it('fails closed with the shipped manifest (no GhostPay router or token pinned) on every CT-1 chain, before any session', async () => {
    const f = fakePort();
    for (const b of [new ZamaBackend(f.port), new ZamaBackend(f.port, CT1_MANIFEST), await getBackend('ct1-zama', { zamaPort: f.port })]) {
      for (const chainId of CHAINS) {
        const codes = await allCodes(b as ZamaBackend, chainId);
        expect(Object.values(codes).every((c) => c === 'CHAIN_NOT_SUPPORTED'), JSON.stringify(codes)).toBe(true);
      }
    }
    expect(f.opens).toBe(0);
  });

  it('works for the pinned router and token', async () => {
    const f = fakePort();
    const b = new ZamaBackend(f.port, pinned());
    for (const chainId of CHAINS) {
      const codes = await allCodes(b, chainId);
      expect(Object.values(codes).every((c) => c === 'ok'), JSON.stringify(codes)).toBe(true);
    }
    // the manifest also accepts its own addresses in lowercase
    expect(await codeOf(b.buildPayCalldata(payParams({ router: ROUTER.toLowerCase() as Address, token: TOKEN.toLowerCase() as Address })))).toBe('ok');
  });

  it('refuses an unpinned router, operator, token or encryption contract with MANIFEST_MISMATCH', async () => {
    const f = fakePort();
    const b = new ZamaBackend(f.port, pinned());
    const r = await allCodes(b, 11155111, { router: OTHER });
    expect(r.encryptAmount).toBe('MANIFEST_MISMATCH');
    expect(r.buildPayCalldata).toBe('MANIFEST_MISMATCH');
    expect(r.buildSetOperator).toBe('MANIFEST_MISMATCH');
    const t = await allCodes(b, 11155111, { token: OTHER });
    expect(t.buildPayCalldata).toBe('MANIFEST_MISMATCH');
    expect(t.buildSetOperator).toBe('MANIFEST_MISMATCH');
    expect(t.buildConfidentialTransfer).toBe('MANIFEST_MISMATCH');
    expect(t.buildUnwrap).toBe('MANIFEST_MISMATCH');
    expect(t.finalizeUnwrap).toBe('MANIFEST_MISMATCH');
    // operator must be the pinned router, not just any address
    expect((await allCodes(b, 11155111, { operator: OTHER })).buildSetOperator).toBe('MANIFEST_MISMATCH');
    // encrypting for a pinned token is allowed; for anything else it is not
    expect((await allCodes(b, 11155111, { contract: TOKEN })).encryptAmount).toBe('ok');
    expect((await allCodes(b, 11155111, { contract: DEST })).encryptAmount).toBe('MANIFEST_MISMATCH');
  });

  it('a manifest with tokens but no router refuses router use and still allows token operations', async () => {
    const b = new ZamaBackend(fakePort().port, pinned(null, [TOKEN]));
    const c = await allCodes(b, 11155111);
    expect(c.buildPayCalldata).toBe('CHAIN_NOT_SUPPORTED');
    expect(c.buildSetOperator).toBe('CHAIN_NOT_SUPPORTED');
    expect(c.encryptAmount).toBe('MANIFEST_MISMATCH');
    expect(c.buildConfidentialTransfer).toBe('ok');
    expect(c.buildUnwrap).toBe('ok');
    const noTokens = new ZamaBackend(fakePort().port, pinned(ROUTER, []));
    expect((await allCodes(noTokens, 11155111)).buildPayCalldata).toBe('CHAIN_NOT_SUPPORTED');
    expect((await allCodes(noTokens, 11155111)).buildUnwrap).toBe('CHAIN_NOT_SUPPORTED');
  });

  it('getBackend threads the manifest dependency', async () => {
    const f = fakePort();
    const b = await getBackend('ct1-zama', { zamaPort: f.port, manifest: pinned() });
    expect(await codeOf(b.buildPayCalldata(payParams({ chainId: 11155111 })))).toBe('ok');
  });
});

describe('B2/B10: verifyManifestOnChain covers the GhostPay router and token roles', () => {
  const CODE: Hex = '0x6001600155';
  const allProtocol = ['acl', 'coprocessor', 'kmsVerifier', 'inputVerifier', 'wrappersRegistry'];
  const withHashes = (m: CtManifest, roles: string[]): CtManifest => {
    const base = m.chains['11155111'];
    if (!base) throw new Error('fixture');
    const codeHashes: Record<string, Hex | null> = { ...base.codeHashes };
    for (const r of roles) codeHashes[r] = keccak256(CODE);
    return { ...m, chains: { '11155111': { ...base, codeHashes } } };
  };

  it('pinned protocol hashes but no GhostPay router/tokens is NOT fully pinned', async () => {
    const m = withHashes(CT1_MANIFEST, allProtocol);
    await expect(verifyManifestOnChain(11155111, () => Promise.resolve(CODE), {}, m)).rejects.toMatchObject({ code: 'UNPINNED_CODEHASH' });
    const r = await verifyManifestOnChain(11155111, () => Promise.resolve(CODE), { requirePinned: false }, m);
    expect(r.roles['router']).toBe('unpinned');
    expect(r.roles['tokens']).toBe('unpinned');
    expect(r.fullyPinned).toBe(false);
  });

  it('checks the code of every pinned token', async () => {
    const tokenRole = `token:${TOKEN}`;
    const m = withHashes(pinned(), [...allProtocol, 'router', tokenRole]);
    const seen: string[] = [];
    const ok = await verifyManifestOnChain(11155111, (a) => {
      seen.push(a);
      return Promise.resolve(CODE);
    }, {}, m);
    expect(ok.fullyPinned).toBe(true);
    expect(ok.roles[tokenRole]).toBe('ok');
    expect(seen).toContain(TOKEN);
    // token code differs from its pinned hash
    await expect(verifyManifestOnChain(11155111, (a) => Promise.resolve(a === TOKEN ? '0x60aa' : CODE), {}, m)).rejects.toMatchObject({ code: 'MANIFEST_MISMATCH' });
    // no code at the token address
    await expect(verifyManifestOnChain(11155111, (a) => Promise.resolve(a === TOKEN ? '0x' : CODE), {}, m)).rejects.toMatchObject({ code: 'MANIFEST_MISMATCH' });
    // token hash not pinned
    const unpinnedToken = withHashes(pinned(), [...allProtocol, 'router']);
    await expect(verifyManifestOnChain(11155111, () => Promise.resolve(CODE), {}, unpinnedToken)).rejects.toMatchObject({ code: 'UNPINNED_CODEHASH' });
    const r = await verifyManifestOnChain(11155111, () => Promise.resolve(CODE), { requirePinned: false }, unpinnedToken);
    expect(r.roles[tokenRole]).toBe('unpinned');
    expect(r.fullyPinned).toBe(false);
  });

  it('accepts a token hash keyed by the lowercase address', async () => {
    const m = withHashes(pinned(), [...allProtocol, 'router', `token:${TOKEN.toLowerCase()}`]);
    expect((await verifyManifestOnChain(11155111, () => Promise.resolve(CODE), {}, m)).fullyPinned).toBe(true);
  });
});

describe('B5: no raw SDK/viem error (or key material) escapes the CT-1 backend', () => {
  const BAD_KEY: Hex = `0x${'ff'.repeat(32)}`;
  const leaks = (e: unknown): boolean => {
    const text = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    return text.includes('ff'.repeat(32)) || text.includes(BigInt(BAD_KEY).toString()) || text.toLowerCase().includes(BAD_KEY);
  };

  /** Fake modules that use the REAL viem `privateKeyToAccount` (it throws with the key scalar in the message). */
  function modules(over: Record<string, unknown> = {}): ZamaSdkModules {
    const zama = {
      encrypt: () => Promise.reject(new Error(`sdk encrypt failed for key ${BAD_KEY}`)),
      decryption: {
        decryptValues: () => Promise.reject(new Error(`relayer rejected permit signed by ${BAD_KEY}`)),
        decryptPublicValues: () => Promise.reject(new Error(`kms said ${BAD_KEY}`)),
      },
      terminate: () => {
        throw new Error(`terminate failed ${BAD_KEY}`);
      },
      ...over,
    };
    return {
      sdk: { MemoryStorage: class {}, ZamaSDK: class { public constructor() { return zama; } }, cleartext: () => ({}) },
      adapter: { createConfig: (c: unknown) => c },
      chains: { sepolia: { id: 11155111 }, hardhat: { id: 31337 } },
      relayer: { make: () => ({}) },
      viem: { defineChain: (c: unknown) => c, http: () => ({}), createPublicClient: () => ({}), createWalletClient: () => ({}) },
      accounts: { privateKeyToAccount: viemAccounts.privateKeyToAccount, generatePrivateKey: viemAccounts.generatePrivateKey },
    } as unknown as ZamaSdkModules;
  }
  const port = (m: ZamaSdkModules) => createZamaSdkPort({ rpcUrls: { 11155111: 'http://rpc.invalid' }, runtime: 'node', load: () => Promise.resolve(m) });

  it('user decrypt with an out-of-range stealth key fails with a fixed CtError and never shows the key', async () => {
    const b = new ZamaBackend(port(modules()), pinned());
    const err = await b.userDecrypt({ chainId: 11155111, contract: TOKEN, handle: H, signer: { address: STEALTH, withKey: (fn) => fn(BAD_KEY) } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CtError);
    // the real port reports a session it could not start as BACKEND_UNAVAILABLE (fixed message, passed through)
    expect((err as CtError).code).toBe('BACKEND_UNAVAILABLE');
    expect(leaks(err)).toBe(false);
  });

  it('the port itself maps a key-parse failure to a fixed CtError', async () => {
    const err = await port(modules()).open({ chainId: 11155111, stealthKey: BAD_KEY }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CtError);
    expect((err as CtError).code).toBe('BACKEND_UNAVAILABLE');
    expect(leaks(err)).toBe(false);
  });

  it('SDK failures inside a session are mapped with fixed messages; a throwing close is contained', async () => {
    const b = new ZamaBackend(port(modules()), pinned());
    const enc = await b.encryptAmount({ chainId: 11155111, contract: ROUTER, user: PAYER, amount: 1n }).catch((e: unknown) => e);
    expect(enc).toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
    expect(leaks(enc)).toBe(false);
    const dec = await b.userDecrypt({ chainId: 11155111, contract: TOKEN, handle: H, signer: makeSigner() }).catch((e: unknown) => e);
    expect(dec).toMatchObject({ code: 'DECRYPT_FAILED' });
    expect(leaks(dec)).toBe(false);
    const fin = await b.finalizeUnwrap({ chainId: 11155111, token: TOKEN, requestId: H }).catch((e: unknown) => e);
    expect(fin).toMatchObject({ code: 'PROOF_UNAVAILABLE' });
    expect(leaks(fin)).toBe(false);
    // success path with a throwing terminate(): the result survives, no raw error
    const ok = new ZamaBackend(port(modules({ decryption: { decryptValues: () => Promise.resolve({ [H]: 3n }), decryptPublicValues: () => Promise.reject(new Error('x')) } })), pinned());
    expect(await ok.userDecrypt({ chainId: 11155111, contract: TOKEN, handle: H, signer: makeSigner() })).toBe(3n);
  });

  it('ZamaBackend wraps a raw port.open failure and a raw close failure from any port', async () => {
    const rawOpen: ZamaSdkPort = { open: () => Promise.reject(new Error(`open failed ${BAD_KEY}`)) };
    const b = new ZamaBackend(rawOpen, pinned());
    const errs = [
      await b.encryptAmount({ chainId: 11155111, contract: ROUTER, user: PAYER, amount: 1n }).catch((e: unknown) => e),
      await b.userDecrypt({ chainId: 11155111, contract: TOKEN, handle: H, signer: makeSigner() }).catch((e: unknown) => e),
      await b.finalizeUnwrap({ chainId: 11155111, token: TOKEN, requestId: H }).catch((e: unknown) => e),
    ];
    expect(errs.map((e) => (e as CtError).code)).toEqual(['BACKEND_UNAVAILABLE', 'DECRYPT_FAILED', 'PROOF_UNAVAILABLE']);
    for (const e of errs) expect(leaks(e)).toBe(false);
    const f = fakePort({
      close: () => {
        throw new Error(`close failed ${BAD_KEY}`);
      },
    });
    expect(await new ZamaBackend(f.port, pinned()).userDecrypt({ chainId: 11155111, contract: TOKEN, handle: H, signer: makeSigner() })).toBe(7n);
  });
});

describe('B8: finalizeUnwrap validates the token before opening a relayer session', () => {
  it('a malformed, zero or unpinned token opens no session', async () => {
    const f = fakePort();
    const b = new ZamaBackend(f.port, pinned());
    for (const token of ['0x12', '0x0000000000000000000000000000000000000000', OTHER] as Address[]) {
      await expect(b.finalizeUnwrap({ chainId: 11155111, token, requestId: H })).rejects.toBeInstanceOf(CtError);
    }
    expect(f.opens).toBe(0);
  });
});
