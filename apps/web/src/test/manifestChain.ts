import { loadDeployment, type DeploymentManifest, type RpcClient } from '@ghostpay/chain-adapters';
import { keccak256, toBytes } from 'viem/utils';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER, FAKE_SWEEP_RELAYER, fakeManifestJson } from './fakeManifest';

/** TEST-ONLY synthetic runtime code per fake contract (not real bytecode). */
export const FAKE_CODE: Readonly<Record<string, `0x${string}`>> = {
  [FAKE_ROUTER.toLowerCase()]: '0x6001600155',
  [FAKE_SWEEP_RELAYER.toLowerCase()]: '0x6002600255',
  [FAKE_ANNOUNCER.toLowerCase()]: '0x6003600355',
};

const sel = (s: string): string => keccak256(toBytes(s)).slice(0, 10);
const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;

/** Fake manifest whose bytecode hashes match {@link FAKE_CODE}, so on-chain read-back can pass in tests. */
export function backedManifest(chainId: number): DeploymentManifest {
  const j = JSON.parse(fakeManifestJson(chainId)) as Record<string, unknown>;
  j['bytecodeHashes'] = { router: keccak256(FAKE_CODE[FAKE_ROUTER.toLowerCase()] as `0x${string}`), sweepRelayer: keccak256(FAKE_CODE[FAKE_SWEEP_RELAYER.toLowerCase()] as `0x${string}`) };
  return loadDeployment(JSON.stringify(j), chainId);
}

/** Wraps an RpcClient so it also answers the manifest read-back calls like the fake deployment would. */
export function withManifestChain(inner: RpcClient, over: { feeRecipient?: string; code?: Record<string, string> } = {}): RpcClient {
  const code = over.code ?? FAKE_CODE;
  return {
    ...inner,
    request: (method, params) => {
      if (method === 'eth_getCode') return Promise.resolve(code[(params[0] as string).toLowerCase()] ?? '0x');
      if (method === 'eth_call') {
        const data = (params[0] as { data?: string }).data;
        if (data === sel('FEE_RECIPIENT()')) return Promise.resolve(word(over.feeRecipient ?? FAKE_FEE_RECIPIENT));
        if (data === sel('ANNOUNCER()')) return Promise.resolve(word(FAKE_ANNOUNCER));
        if (data === sel('FEE_BPS()')) return Promise.resolve(word('0x19'));
      }
      return inner.request(method, params);
    },
  };
}
