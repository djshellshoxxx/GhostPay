import { secp256k1 } from '@noble/curves/secp256k1.js';
import { describe, expect, it } from 'vitest';
import { canonicalManifestJson, loadDeployment, manifestDigest } from '@ghostpay/chain-adapters';
import { keccak256, toBytes } from 'viem/utils';
import { fakeManifestJson } from '../test/fakeManifest';
import { createSelectedRpc, loadDefaultManifest, loadNetworkSelection } from './defaultServices';

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

describe('default manifest trust policy', () => {
  it.each(['', 'GhostPay/receipt/v1\n'])('refuses a structured manifest signed with foreign domain %j in the default app loader', async (domain) => {
    const privateKey = secp256k1.utils.randomSecretKey();
    const key = hex(secp256k1.getPublicKey(privateKey, true));
    const unsigned = fakeManifestJson(84532);
    const manifest = loadDeployment(unsigned, 84532);
    const signedWithDigest = (digest: string): string => {
      const bytes = Uint8Array.from(digest.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16));
      const signature = `0x${hex(secp256k1.sign(bytes, privateKey, { prehash: false, lowS: true }))}`;
      return JSON.stringify({ ...(JSON.parse(unsigned) as Record<string, unknown>), signature });
    };
    const accepted = await loadDefaultManifest(84532, { '84532': signedWithDigest(manifestDigest(manifest)) }, [key]);
    expect(accepted.status).toBe('loaded');
    const foreign = signedWithDigest(keccak256(toBytes(domain + canonicalManifestJson(manifest))));
    expect((await loadDefaultManifest(84532, { '84532': foreign }, [key])).status).toBe('invalid');
  });
  it('keeps deployment disabled when the bundle has no release key', async () => {
    const result = await loadDefaultManifest(84532, { '84532': fakeManifestJson(84532) }, []);
    expect(result).toEqual({ status: 'invalid', reason: 'No release verification key is configured; deployment manifests are disabled.' });
  });

  it('loads a manifest only when a configured release key verifies its signature', async () => {
    const privateKey = secp256k1.utils.randomSecretKey();
    const key = hex(secp256k1.getPublicKey(privateKey, true));
    const unsigned = fakeManifestJson(84532);
    const manifest = loadDeployment(unsigned, 84532);
    const signature = `0x${hex(secp256k1.sign(Uint8Array.from(manifestDigest(manifest).slice(2).match(/../g) ?? [], (part) => parseInt(part, 16)), privateKey, { prehash: false, lowS: true }))}`;
    const signed = JSON.stringify({ ...(JSON.parse(unsigned) as Record<string, unknown>), signature });

    const accepted = await loadDefaultManifest(84532, { '84532': signed }, [key]);
    expect(accepted.status).toBe('loaded');
    if (accepted.status === 'loaded') expect(accepted.trust).toBe('signed');

    const foreignKey = hex(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true));
    const rejected = await loadDefaultManifest(84532, { '84532': signed }, [foreignKey]);
    expect(rejected.status).toBe('invalid');
  });
});

describe('TM14 network selection (default unchanged)', () => {
  const chain = { chainId: 84532 } as import('@ghostpay/chain-adapters').ChainConfig;
  const store = (v: string | null): Storage => ({ getItem: () => v } as unknown as Storage);
  const own = JSON.stringify({ rpcProfile: 'direct', relayerProfile: 'tor-browser', rpcMode: 'own-node', noticeAcknowledged: true });

  it('defaults only for missing selection and blocks malformed, unreadable or unacknowledged stored choices', () => {
    const def = { rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'single', noticeAcknowledged: false };
    expect(loadNetworkSelection(undefined)).toEqual(def);
    expect(loadNetworkSelection(store(null))).toEqual(def);
    expect(() => loadNetworkSelection(store('{not json'))).toThrow(/network profile/i);
    expect(() => loadNetworkSelection(store(JSON.stringify({ rpcProfile: 'tor-socks' })))).toThrow(/network profile/i);
    expect(() => loadNetworkSelection(store(JSON.stringify({ rpcMode: 'own-node' })))).toThrow(/invalid or unavailable/i);
    expect(() => loadNetworkSelection({ getItem: () => { throw new Error('blocked'); } } as unknown as Storage)).toThrow(/network profile/i);
    expect(loadNetworkSelection(store(own)).rpcMode).toBe('own-node');
  });

  it('default mode passes the URL through exactly as before', async () => {
    const seen: unknown[] = [];
    const rpc = createSelectedRpc(() => loadNetworkSelection(undefined), (_c, url, opts) => { seen.push([url, opts.allowInsecureLocalhost, typeof opts.transport.send]); return Promise.resolve({} as never); });
    await rpc(chain, 'https://rpc.example.org');
    expect(seen).toEqual([['https://rpc.example.org', false, 'function']]);
  });

  it('own-node refuses a third-party RPC without contacting it and allows loopback http', async () => {
    const seen: string[] = [];
    const rpc = createSelectedRpc(() => loadNetworkSelection(store(own)), (_c, url) => { seen.push(url); return Promise.resolve({} as never); });
    await expect(rpc(chain, 'https://rpc.example.org')).rejects.toThrow(/on this computer/);
    expect(seen).toEqual([]);
    await rpc(chain, 'http://127.0.0.1:8545');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^http:\/\/127\.0\.0\.1:8545/);
  });
});
