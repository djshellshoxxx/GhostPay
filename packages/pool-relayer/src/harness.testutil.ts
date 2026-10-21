import { contextOf, type WithdrawProofCalldata, type Withdrawal } from '@ghostpay/pool-sdk';
import { getAddress, zeroAddress, type Address, type Hex } from 'viem';
import type { ChainPort, ReceiptSummary } from './chain.js';
import { buildConfig, type RelayerConfig } from './config.js';
import { SimulationRevert } from './errors.js';
import { quoteFee } from './quote.js';
import type { RelayRequest } from './validate.js';

export const POOL: Address = getAddress('0x1000000000000000000000000000000000000001');
export const RELAYER: Address = getAddress('0x2000000000000000000000000000000000000002');
export const FEE_TO: Address = getAddress('0x3000000000000000000000000000000000000003');
export const DEST: Address = getAddress('0x4000000000000000000000000000000000000004');
export const SCOPE = 123456789n;
export const TX: Hex = `0x${'ef'.repeat(32)}`;

export const config = (over: Partial<RelayerConfig> = {}): RelayerConfig =>
  buildConfig({ pools: [{ chainId: 31337, pool: POOL, rate: { num: 1n, den: 1n } }], feeTo: FEE_TO, gasEstimate: 100_000n, ...over });

export interface FakeChain extends ChainPort {
  sent: number;
  simulated: number;
  state: { gasPrice: bigint; ts: bigint; knownRoot: boolean; spent: boolean; simulate: 'ok' | 'revert' | 'rpc'; send: 'ok' | 'fail'; receipt: ReceiptSummary['status']; costWei: bigint; rpcDown: boolean };
}

export function fakeChain(chainId = 31337): FakeChain {
  const c: FakeChain = {
    chainId,
    relayerAddress: RELAYER,
    sent: 0,
    simulated: 0,
    state: { gasPrice: 1_000n, ts: 1_000_000n, knownRoot: true, spent: false, simulate: 'ok', send: 'ok', receipt: 'success', costWei: 77n, rpcDown: false },
    getGasPrice() {
      return c.state.rpcDown ? Promise.reject(new Error('down')) : Promise.resolve(c.state.gasPrice);
    },
    getBalance: () => Promise.resolve(10n ** 18n),
    blockTimestamp: () => Promise.resolve(c.state.ts),
    readScope: () => Promise.resolve(SCOPE),
    isKnownRoot: () => Promise.resolve(c.state.knownRoot),
    nullifierSpent: () => Promise.resolve(c.state.spent),
    simulateWithdraw() {
      c.simulated++;
      if (c.state.simulate === 'revert') return Promise.reject(new SimulationRevert());
      if (c.state.simulate === 'rpc') return Promise.reject(new Error('rpc'));
      return Promise.resolve({ gasLimit: 200_000n });
    },
    sendWithdraw() {
      if (c.state.send === 'fail') return Promise.reject(new Error('send'));
      c.sent++;
      return Promise.resolve(TX);
    },
    waitForReceipt: () => Promise.resolve({ status: c.state.receipt, costWei: c.state.costWei }),
  };
  return c;
}

/** A consistent relay request: fee equals the current quote, context bound, ASP off. */
export function goodRequest(over: { w?: Partial<Withdrawal>; sig?: Partial<Record<number, bigint>>; fee?: bigint } = {}): RelayRequest {
  const cfg = config();
  const entry = cfg.pools[0];
  /* c8 ignore next */
  if (entry === undefined) throw new Error('x');
  const fee = over.fee ?? quoteFee(cfg, entry, 1_000n);
  const w: Withdrawal = { recipient: DEST, relayer: RELAYER, relayerFee: fee, feeTo: FEE_TO, deadline: 1_000_000n + 600n, aspPublisher: zeroAddress, announce: '0x', ...over.w };
  const sig: bigint[] = [11n, 22n, 10n ** 10n, 33n, 3n, 0n, 0n, 0n, contextOf({ ...w }, SCOPE)];
  for (const [i, v] of Object.entries(over.sig ?? {})) sig[Number(i)] = v ?? 0n;
  const proof: WithdrawProofCalldata = { pA: [1n, 2n], pB: [[3n, 4n], [5n, 6n]], pC: [7n, 8n], pubSignals: sig };
  return { chainId: 31337, pool: POOL, withdrawal: w, proof };
}
