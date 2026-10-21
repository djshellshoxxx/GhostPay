import { describe, expect, it } from 'vitest';
import { deploymentFor, parseManifest } from './manifest.js';

const A = '0x1000000000000000000000000000000000000001';
const H = `0x${'ab'.repeat(32)}`;
const code = (f: () => unknown) => expect(f).toThrowError(expect.objectContaining({ code: 'MANIFEST_MISMATCH' }) as Error);

describe('parseManifest', () => {
  it('parses and checksums a valid manifest', () => {
    const m = parseManifest({ deployments: [{ chainId: 31337, relay: A.toLowerCase(), entryPoint: A, entryPointCodeHash: H, supports7702: true }] });
    expect(m.deployments).toHaveLength(1);
    expect(deploymentFor(m, 31337).relay).toBe('0x1000000000000000000000000000000000000001');
    expect(Object.isFrozen(m)).toBe(true);
  });
  it('rejects malformed manifests', () => {
    code(() => parseManifest(null));
    code(() => parseManifest({}));
    code(() => parseManifest({ deployments: [1] }));
    code(() => parseManifest({ deployments: [{ chainId: 'x' }] }));
    code(() => parseManifest({ deployments: [{ chainId: 31337, other: 1 }] }));
    code(() => parseManifest({ deployments: [{ chainId: 31337, relay: 5 }] }));
    code(() => parseManifest({ deployments: [{ chainId: 31337, relay: '0x12' }] }));
    code(() => parseManifest({ deployments: [{ chainId: 31337, entryPointCodeHash: '0x12' }] }));
    code(() => parseManifest({ deployments: [{ chainId: 31337, entryPointCodeHash: 5 }] }));
    code(() => parseManifest({ deployments: [{ chainId: 31337, supports7702: 'yes' }] }));
    code(() => parseManifest({ deployments: [{ chainId: 31337 }, { chainId: 31337 }] }));
  });
  it('refuses a mainnet chain id', () => {
    expect(() => parseManifest({ deployments: [{ chainId: 1 }] })).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
  });
  it('deploymentFor fails for a missing chain', () => {
    code(() => deploymentFor(parseManifest({ deployments: [] }), 84532));
    expect(() => deploymentFor(parseManifest({ deployments: [] }), 1)).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
  });
});
