import { ghostPayRouterAbi } from '@ghostpay/chain-adapters';
import { encodeFunctionData, keccak256 } from 'viem/utils';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER, FAKE_SWEEP_RELAYER, fakeManifestJson } from './fakeManifest';
import { mockRpc, type MockRpc } from './mockRpc';

/** Clearly fake "runtime code" per contract; the manifest hashes below are the real keccak256 of these bytes. */
export const ROUTER_CODE = '0x6001600155' as const;
export const RELAYER_CODE = '0x6002600255' as const;
export const ANNOUNCER_CODE = '0x6003600355' as const;

const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
const sel = (name: 'FEE_RECIPIENT' | 'ANNOUNCER' | 'FEE_BPS'): string => encodeFunctionData({ abi: ghostPayRouterAbi, functionName: name });

/** The test manifest, but with `bytecodeHashes` that match `ROUTER_CODE` / `RELAYER_CODE`. */
export function readbackManifestJson(chainId: number): string {
  const m = JSON.parse(fakeManifestJson(chainId)) as Record<string, unknown>;
  m['bytecodeHashes'] = { router: keccak256(ROUTER_CODE), sweepRelayer: keccak256(RELAYER_CODE) };
  return JSON.stringify(m);
}

export interface ReadbackFaults {
  readonly feeRecipient?: string;
  readonly routerCode?: string;
  readonly noRelayerCode?: boolean;
}

/** JSON-RPC answers that satisfy `verifyManifest` for `readbackManifestJson`, optionally with one fault. */
export function readbackReply(method: string, params: readonly unknown[], f: ReadbackFaults = {}): unknown {
  if (method === 'eth_call') {
    const c = params[0] as { to: string; data: string };
    if (c.to.toLowerCase() !== FAKE_ROUTER) throw new Error('unexpected call target');
    if (c.data === sel('FEE_RECIPIENT')) return word(f.feeRecipient ?? FAKE_FEE_RECIPIENT);
    if (c.data === sel('ANNOUNCER')) return word(FAKE_ANNOUNCER);
    if (c.data === sel('FEE_BPS')) return word('0x19');
    throw new Error('unexpected selector');
  }
  if (method === 'eth_getCode') {
    const a = String(params[0]).toLowerCase();
    if (a === FAKE_ROUTER) return f.routerCode ?? ROUTER_CODE;
    if (a === FAKE_SWEEP_RELAYER) return f.noRelayerCode === true ? '0x' : RELAYER_CODE;
    if (a === FAKE_ANNOUNCER) return ANNOUNCER_CODE;
  }
  throw new Error(`unexpected ${method}`);
}

export function readbackRpc(chainId: number, f: ReadbackFaults = {}): MockRpc {
  return mockRpc(chainId, (m, p) => readbackReply(m, p, f));
}
