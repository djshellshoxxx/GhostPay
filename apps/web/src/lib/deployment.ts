import { verifyDeployment as defaultVerify, type DeploymentManifest, type RpcClient, type VerifiedDeployment } from '@ghostpay/chain-adapters';

/**
 * Result of reading the bundled manifest back from the chain (S3-01). Pay, Scan and Sweep stay disabled unless this is
 * `verified`; the router and fee recipient shown to the user come from `verified`, not from the manifest text.
 */
export type DeploymentCheck =
  | { readonly status: 'verified'; readonly verified: VerifiedDeployment }
  | { readonly status: 'unverified'; readonly reason: string }
  | { readonly status: 'no-rpc' };

export type VerifyFn = (m: DeploymentManifest, client: RpcClient, opts?: { readonly secondary?: RpcClient }) => Promise<VerifiedDeployment>;

/** Never throws. `reason` is a fixed-form adapter message (no URLs, no provider text). */
export async function checkDeployment(
  manifest: DeploymentManifest,
  primary: RpcClient | undefined,
  secondary: RpcClient | undefined,
  verify: VerifyFn = defaultVerify,
): Promise<DeploymentCheck> {
  if (primary === undefined) return { status: 'no-rpc' };
  try {
    const verified = await verify(manifest, primary, secondary === undefined ? {} : { secondary });
    return { status: 'verified', verified };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'ChainAdapterError' ? e.message.replace(/^[A-Z_]+: /, '') : 'the RPC could not be read';
    return { status: 'unverified', reason: msg };
  }
}

/** One sentence per non-verified state, for banners and blockers. */
export function deploymentProblem(check: DeploymentCheck | 'checking' | undefined): string | undefined {
  if (check === undefined || check === 'checking') return 'Checking the contracts on-chain through your RPC…';
  if (check.status === 'no-rpc') return 'Configure an RPC for this chain in Settings: the app must read the contracts back from the chain before it enables payments.';
  if (check.status === 'unverified') return `The deployment could not be verified on-chain (${check.reason}). Payments are disabled.`;
  return undefined;
}
