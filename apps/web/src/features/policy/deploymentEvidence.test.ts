import { CHAINS } from '@ghostpay/chain-adapters';
import { ZERO_ADDRESS } from '@ghostpay/policy-scheme';
import { describe, expect, it } from 'vitest';
import { verifyPolicyDeployment } from './chain';
import { captureCanonicalPolicyBlock, policyQuantity } from './deploymentEvidence';
import { DEPLOYMENT, LOCAL_POLICY_PROFILE, SEPOLIA, deploymentCalls, fakeChain } from './fixtures.testutil';

const chain = CHAINS.find((c) => c.chainId === SEPOLIA)!;
const input = { factory: DEPLOYMENT.factory, router: DEPLOYMENT.router };

describe('authenticated policy deployment', () => {
  it('refuses pasted getter-compatible deployments without authenticated application configuration', async () => {
    const rpc = fakeChain(SEPOLIA, deploymentCalls());
    await expect(verifyPolicyDeployment(rpc, chain, input)).rejects.toThrow(/No authenticated/);
    expect(rpc.calls).toHaveLength(0);
  });
  it('binds all code and getter reads to a single canonical block hash', async () => {
    const rpc = fakeChain(SEPOLIA, deploymentCalls());
    const result = await verifyPolicyDeployment(rpc, chain, input, LOCAL_POLICY_PROFILE);
    expect(result.canonicalBlock.number).toBe(1000n);
    expect(result.canonicalBlock.hash).toBe(`0x${(1000).toString(16).padStart(64, '0')}`);
    for (const call of rpc.calls.filter((c) => ['eth_getCode', 'eth_call'].includes(c.method))) {
      expect(call.params[1]).toEqual({ blockHash: result.canonicalBlock.hash, requireCanonical: true });
    }
    expect(Object.isFrozen(result.profile.assets[0])).toBe(true);
    expect(Object.isFrozen(result.profile.codeHashes)).toBe(true);
  });
  it.each(['factory', 'router', 'implementation', 'announcer'] as const)('rejects getter-compatible malicious %s code', async (name) => {
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: (method, params) => method === 'eth_getCode' && params[0] === DEPLOYMENT[name] ? '0x6002' : undefined });
    await expect(verifyPolicyDeployment(rpc, chain, input, LOCAL_POLICY_PROFILE)).rejects.toThrow(/authenticated configuration/);
  });
  it.each(['FEE_TOKEN', 'FEE_RECIPIENT', 'IMPLEMENTATION', 'FLAT_FEE'])('rejects mismatched factory %s', async (name) => {
    const rpc = fakeChain(SEPOLIA, deploymentCalls({ [`${name}@${DEPLOYMENT.factory.toLowerCase()}`]: name === 'FLAT_FEE' ? 1n : DEPLOYMENT.router }));
    await expect(verifyPolicyDeployment(rpc, chain, input, LOCAL_POLICY_PROFILE)).rejects.toThrow(/authenticated configuration/);
  });
  it.each(['ANNOUNCER', 'FEE_RECIPIENT', 'FACTORY', 'FEE_BPS', 'BPS', 'SCHEME_ID', 'NATIVE'])('rejects mismatched router %s', async (name) => {
    const rpc = fakeChain(SEPOLIA, deploymentCalls({ [`${name}@${DEPLOYMENT.router.toLowerCase()}`]: ['BPS', 'FEE_BPS', 'SCHEME_ID'].includes(name) ? 1n : DEPLOYMENT.router }));
    await expect(verifyPolicyDeployment(rpc, chain, input, LOCAL_POLICY_PROFILE)).rejects.toThrow(/authenticated configuration/);
  });
  it('rejects disabled testnet, wrong profile chain, mismatched input, and a predeployment block', async () => {
    const rpc = fakeChain(SEPOLIA, deploymentCalls());
    await expect(verifyPolicyDeployment(rpc, { ...chain, enabled: false }, input, LOCAL_POLICY_PROFILE)).rejects.toThrow();
    await expect(verifyPolicyDeployment(rpc, chain, input, { ...LOCAL_POLICY_PROFILE, deployment: { ...DEPLOYMENT, chainId: 1 } })).rejects.toThrow();
    await expect(verifyPolicyDeployment(rpc, chain, { ...input, router: DEPLOYMENT.factory }, LOCAL_POLICY_PROFILE)).rejects.toThrow();
    await expect(verifyPolicyDeployment(rpc, chain, input, { ...LOCAL_POLICY_PROFILE, deploymentStartBlock: 2000n })).rejects.toThrow();
  });
  it.each(['0x', '0xz1', '0x' + '00'.repeat(24_577)])('rejects missing, malformed or oversized code', async (code) => {
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: (method) => method === 'eth_getCode' ? code : undefined });
    await expect(verifyPolicyDeployment(rpc, chain, input, LOCAL_POLICY_PROFILE)).rejects.toThrow();
  });
  it('rejects chain drift during verification', async () => {
    let reads = 0;
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: (method) => method === 'eth_chainId' && ++reads === 2 ? '0x1' : undefined });
    await expect(verifyPolicyDeployment(rpc, chain, input, LOCAL_POLICY_PROFILE)).rejects.toThrow(/canonical block changed/);
  });
  it('rejects reorg during verification', async () => {
    const rpc = fakeChain(SEPOLIA, { ...deploymentCalls(), extra: (method, params) => method === 'eth_getBlockByNumber' && params[0] !== 'latest' ? { number: '0x3e8', timestamp: '0x6b49d200', hash: `0x${'ab'.repeat(32)}` } : undefined });
    await expect(verifyPolicyDeployment(rpc, chain, input, LOCAL_POLICY_PROFILE)).rejects.toThrow(/canonical block changed/);
  });
  it('rejects missing/duplicate/native-mismatched asset profiles and malformed code hashes', async () => {
    const rpc = fakeChain(SEPOLIA, deploymentCalls());
    for (const profile of [
      { ...LOCAL_POLICY_PROFILE, assets: [] },
      { ...LOCAL_POLICY_PROFILE, assets: [...LOCAL_POLICY_PROFILE.assets, ...LOCAL_POLICY_PROFILE.assets] },
      { ...LOCAL_POLICY_PROFILE, assets: [{ token: DEPLOYMENT.router, semantics: 'native' as const }] },
      { ...LOCAL_POLICY_PROFILE, assets: [{ token: ZERO_ADDRESS, semantics: 'erc20-exact-transfer' as const, codeHash: `0x${'ab'.repeat(32)}` as const }] },
      { ...LOCAL_POLICY_PROFILE, codeHashes: { ...LOCAL_POLICY_PROFILE.codeHashes, router: '0x0' as const } },
    ]) await expect(verifyPolicyDeployment(rpc, chain, input, profile)).rejects.toThrow();
  });
  it.each([null, {}, { number: '0x1', hash: 'bad', timestamp: '0x2' }, { number: '0x01', hash: `0x${'ab'.repeat(32)}`, timestamp: '0x2' }])('rejects malformed canonical blocks', async (block) => {
    const rpc = fakeChain(SEPOLIA, { extra: (method) => method === 'eth_getBlockByNumber' ? block : undefined });
    await expect(captureCanonicalPolicyBlock(rpc)).rejects.toThrow();
  });
  it('rejects requested block mismatch and invalid quantities', async () => {
    const rpc = fakeChain(SEPOLIA, { extra: () => ({ number: '0x2', timestamp: '0x3', hash: `0x${'ab'.repeat(32)}` }) });
    await expect(captureCanonicalPolicyBlock(rpc, 1n)).rejects.toThrow();
    await expect(captureCanonicalPolicyBlock(rpc, -1n)).rejects.toThrow();
    for (const value of ['0x00', '0x', '-1', 1, '0x' + 'f'.repeat(65)]) expect(() => policyQuantity(value)).toThrow();
    expect(policyQuantity('0x0')).toBe(0n);
  });
});
