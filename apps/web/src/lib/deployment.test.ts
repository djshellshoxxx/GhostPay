import { ChainAdapterError, type DeploymentManifest, type RpcClient, type VerifiedDeployment } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { fakeManifest } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { checkDeployment, deploymentProblem, type VerifyFn } from './deployment';

const manifest: DeploymentManifest = fakeManifest(84532);
const rpc = (): RpcClient => mockRpc(84532, () => { throw new Error('unexpected'); });
const VERIFIED = { router: manifest.router } as unknown as VerifiedDeployment;

describe('checkDeployment fails closed (A7-2)', () => {
  it('returns no-rpc without calling verify when there is no primary RPC', async () => {
    let called = false;
    const verify: VerifyFn = () => { called = true; return Promise.resolve(VERIFIED); };
    expect(await checkDeployment(manifest, undefined, rpc(), verify)).toEqual({ status: 'no-rpc' });
    expect(called).toBe(false);
    expect(deploymentProblem({ status: 'no-rpc' })).toMatch(/Configure an RPC/);
  });
  it('is verified only when verify resolves, and passes the secondary through', async () => {
    let seen: unknown;
    const verify: VerifyFn = (_m, _c, opts) => { seen = opts; return Promise.resolve(VERIFIED); };
    const primary = rpc();
    expect(await checkDeployment(manifest, primary, undefined, verify)).toEqual({ status: 'verified', verified: VERIFIED });
    expect(seen).toEqual({});
    const secondary = rpc();
    await checkDeployment(manifest, primary, secondary, verify);
    expect(seen).toEqual({ secondary });
    expect(deploymentProblem({ status: 'verified', verified: VERIFIED })).toBeUndefined();
  });
  it('turns an adapter mismatch into unverified with the fixed-form reason, payments disabled', async () => {
    const verify: VerifyFn = () => Promise.reject(new ChainAdapterError('DEPLOYMENT_UNVERIFIED', 'router codehash differs'));
    const check = await checkDeployment(manifest, rpc(), undefined, verify);
    expect(check.status).toBe('unverified');
    expect(deploymentProblem(check)).toMatch(/could not be verified.*Payments are disabled/);
  });
  it('hides provider text from non-adapter errors (RPC failure is unverified, never verified)', async () => {
    const verify: VerifyFn = () => Promise.reject(new Error('https://secret.rpc/key failed'));
    const check = await checkDeployment(manifest, rpc(), undefined, verify);
    expect(check).toEqual({ status: 'unverified', reason: 'the RPC could not be read' });
    expect(JSON.stringify(check)).not.toContain('secret');
    const nonError: VerifyFn = () => Promise.reject('boom'); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
    expect((await checkDeployment(manifest, rpc(), undefined, nonError)).status).toBe('unverified');
  });
  it('reports a pending check as unavailable', () => {
    expect(deploymentProblem(undefined)).toMatch(/Checking/);
    expect(deploymentProblem('checking')).toMatch(/Checking/);
  });
});
