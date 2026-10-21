import type { DeploymentManifest, RpcClient } from '@ghostpay/chain-adapters';
import { keccak256 } from 'viem';
import { fetchBytes, sha256Hex } from './fetcher.js';
import type { Finding, MonitorContext, Probe } from './types.js';
import { clientsFor, errTag, ethCall, mk, selector, wordToAddress, wordToBigint } from './util.js';

const HEX_CODE = /^0x(?:[0-9a-fA-F]{2})*$/;

async function codeHash(rpc: RpcClient, address: string): Promise<string | null> {
  const code = await rpc.request('eth_getCode', [address, 'latest']);
  if (typeof code !== 'string' || !HEX_CODE.test(code)) throw new Error('malformed');
  return code === '0x' ? null : keccak256(code as `0x${string}`);
}

async function checkCode(rpc: RpcClient, m: DeploymentManifest, name: string, address: string, expected: string): Promise<Finding | null> {
  try {
    const h = await codeHash(rpc, address);
    if (h === null) return mk('W1', 'page', address, `${name}: no code at configured address`, m.chainId);
    if (h.toLowerCase() !== expected.toLowerCase()) {
      return mk('W1', 'page', address, `${name}: code hash ${h} differs from manifest ${expected.toLowerCase()}`, m.chainId);
    }
    return null;
  } catch (e) {
    return mk('W1', 'warn', address, `${name}: eth_getCode failed (${errTag(e)})`, m.chainId);
  }
}

async function checkGetter(
  rpc: RpcClient,
  m: DeploymentManifest,
  contract: string,
  name: string,
  expected: string | bigint,
): Promise<Finding | null> {
  try {
    const word = await ethCall(rpc, contract, selector(`${name}()`));
    const got = typeof expected === 'bigint' ? wordToBigint(word) : wordToAddress(word);
    const want = typeof expected === 'bigint' ? expected : expected.toLowerCase();
    if (got === null) return mk('W1', 'page', contract, `${name}() returned a malformed word`, m.chainId);
    if (got !== want) return mk('W1', 'page', contract, `${name}() = ${String(got)} differs from manifest ${String(want)}`, m.chainId);
    return null;
  } catch (e) {
    return mk('W1', 'warn', contract, `${name}() call failed (${errTag(e)})`, m.chainId);
  }
}

async function checkChain(rpc: RpcClient, m: DeploymentManifest): Promise<Finding[]> {
  const jobs: Promise<Finding | null>[] = [
    checkCode(rpc, m, 'router', m.router, m.bytecodeHashes.router),
    checkCode(rpc, m, 'sweepRelayer', m.sweepRelayer, m.bytecodeHashes.sweepRelayer),
    checkGetter(rpc, m, m.router, 'FEE_RECIPIENT', m.feeRecipient),
    checkGetter(rpc, m, m.router, 'FEE_BPS', BigInt(m.feeBps)),
    checkGetter(rpc, m, m.router, 'ANNOUNCER', m.announcer),
  ];
  if (m.policy !== undefined) {
    jobs.push(
      checkCode(rpc, m, 'policyImplementation', m.policy.implementation, m.policy.bytecodeHashes.implementation),
      checkCode(rpc, m, 'policyFactory', m.policy.factory, m.policy.bytecodeHashes.factory),
      checkGetter(rpc, m, m.policy.factory, 'FEE_RECIPIENT', m.policy.feeRecipient),
    );
  }
  const out = (await Promise.all(jobs)).filter((f): f is Finding => f !== null);
  return out.length > 0 ? out : [mk('W1', 'info', m.router, 'on-chain code and getters match the manifest', m.chainId)];
}

async function checkMirrors(ctx: MonitorContext): Promise<Finding[]> {
  const rel = ctx.release;
  const copies = rel?.manifestCopies;
  if (rel === undefined || copies === undefined) return [];
  const out: Finding[] = [];
  for (const mirror of rel.mirrors) {
    for (const m of ctx.manifests) {
      const copy = copies[m.chainId];
      if (copy === undefined) continue;
      const path = `deployments/${String(m.chainId)}.json`;
      try {
        const served = sha256Hex(await fetchBytes(rel, mirror, path));
        if (served !== sha256Hex(copy)) {
          out.push(mk('W1', 'page', mirror, `${path} served by mirror differs from the release copy`, m.chainId));
        } else {
          out.push(mk('W1', 'info', mirror, `${path} matches the release copy`, m.chainId));
        }
      } catch (e) {
        out.push(mk('W1', 'warn', mirror, `${path} could not be fetched (${errTag(e)})`, m.chainId));
      }
    }
  }
  return out;
}

/**
 * W1 manifest drift: runtime code keccak, `FEE_RECIPIENT()`, `FEE_BPS()`, `ANNOUNCER()` and the served
 * `deployments/<chainId>.json` against the release manifest.
 *
 * @security Read-only (`eth_getCode`, `eth_call`, GET). A lying single provider can hide drift; run W6
 * and give each chain at least two independent clients. Findings carry only manifest addresses and mirror URLs.
 */
export const w1Probe: Probe = {
  id: 'W1',
  async run(ctx) {
    const out: Finding[] = [];
    for (const m of ctx.manifests) {
      const [rpc] = clientsFor(ctx.rpcs, m.chainId);
      if (rpc === undefined) {
        out.push(mk('W1', 'warn', m.router, 'no RPC client configured for this chain', m.chainId));
        continue;
      }
      out.push(...(await checkChain(rpc, m)));
    }
    out.push(...(await checkMirrors(ctx)));
    return out;
  },
};
