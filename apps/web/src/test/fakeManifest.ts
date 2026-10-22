import { loadDeployment, type DeploymentManifest, type VerifiedDeployment } from '@ghostpay/chain-adapters';

/**
 * TEST-ONLY, CLEARLY FAKE deployment data. These addresses are obvious placeholders (repeating nibbles), not a
 * deployment, and are never bundled into the app. The app ships no manifest; see deployments/README.md.
 */
export const FAKE_ROUTER = '0x1111111111111111111111111111111111111111' as const;
export const FAKE_SWEEP_RELAYER = '0x2222222222222222222222222222222222222222' as const;
// Runtime verification pins the protocol announcer; only the router/relayer/fee recipient are fake placeholders.
export const FAKE_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564' as const;
export const FAKE_FEE_RECIPIENT = '0x4444444444444444444444444444444444444444' as const;

export function fakeManifestJson(chainId: number): string {
  return JSON.stringify({
    chainId,
    announcer: FAKE_ANNOUNCER,
    router: FAKE_ROUTER,
    sweepRelayer: FAKE_SWEEP_RELAYER,
    feeRecipient: FAKE_FEE_RECIPIENT,
    feeBps: 25,
    deployTx: { router: `0x${'a'.repeat(64)}`, sweepRelayer: `0x${'b'.repeat(64)}` },
    solcVersion: '0.8.28+commit.7893614a',
    commit: 'c'.repeat(40),
    bytecodeHashes: { router: `0x${'d'.repeat(64)}`, sweepRelayer: `0x${'e'.repeat(64)}` },
    date: '2026-01-01T00:00:00Z',
  });
}

export function fakeManifest(chainId: number): DeploymentManifest {
  return loadDeployment(fakeManifestJson(chainId), chainId);
}

/** What a successful on-chain read-back would return for `m` (tests that do not exercise the EVM). */
export function fakeVerified(m: DeploymentManifest): VerifiedDeployment {
  return { chainId: m.chainId, router: m.router, sweepRelayer: m.sweepRelayer, feeRecipient: m.feeRecipient, announcer: m.announcer, feeBps: 25n, providers: 1 };
}
