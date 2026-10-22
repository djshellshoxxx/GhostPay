import { secp256k1 } from '@noble/curves/secp256k1.js';
import { describe, expect, it } from 'vitest';
import { loadDeployment, manifestDigest } from '@ghostpay/chain-adapters';
import { fakeManifestJson } from '../test/fakeManifest';
import { loadDefaultManifest } from './defaultServices';

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

describe('default manifest trust policy', () => {
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
