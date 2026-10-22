import {
  BaseError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  erc20Abi,
} from 'viem';
import { ghostPaySweepRelayerAbi } from '@ghostpay/chain-adapters';
import { SimulationRevert } from './errors.js';
import type { PermitFields, SweepFields } from './validate.js';

/** One sweep submission. */
export interface SweepCall {
  readonly sweepRelayer: Address;
  readonly sweep: SweepFields;
  readonly sweepSig: Hex;
  readonly permit: PermitFields | undefined;
}

/** Transaction parameters chosen by the relayer. */
export interface SendOptions {
  readonly nonce: number;
  readonly gas: bigint;
  readonly gasPrice: bigint;
}

/** Cheap on-chain prerequisites, checked before paying for a simulation or transaction. */
export interface OrderState {
  readonly ownerBalance: bigint;
  readonly allowance: bigint;
  readonly nonceUsed: boolean;
}

/** Simulation output used both for transaction gas and the fee-covers-gas check. */
export interface SimulationResult {
  readonly gasLimit: bigint;
  readonly gasEstimate: bigint;
}

/** Final state of a sent transaction. */
export interface ReceiptSummary {
  readonly status: 'success' | 'reverted' | 'timeout';
  readonly gasUsed: bigint;
}

/**
 * Everything the relayer needs from a chain for ONE chain id and ONE hot key. Injected so tests run
 * with a fake; {@link createViemChainClient} is the production implementation.
 *
 * @remarks Implementations throw {@link SimulationRevert} when the simulation reverts; any other
 * thrown error is treated as an RPC/operational failure.
 */
export interface ChainClient {
  readonly chainId: number;
  /** Address of the hot key sending the transactions. */
  readonly relayerAddress: Address;
  /** `eth_gasPrice` in wei. */
  getGasPrice(): Promise<bigint>;
  /** Native balance of the hot key in wei. */
  getBalance(): Promise<bigint>;
  /** Pending transaction count of the hot key. */
  getPendingNonce(): Promise<number>;
  /** Reads token balance, allowance and the sweep nonce without spending gas. */
  readOrderState(call: SweepCall): Promise<OrderState>;
  /** Simulates the sweep (`simulateContract`) and returns a gas limit to use. */
  simulateSweep(call: SweepCall): Promise<SimulationResult>;
  /** Signs with the hot key and broadcasts. */
  sendSweep(call: SweepCall, opts: SendOptions): Promise<Hex>;
  /** Waits for inclusion (never throws; failures map to `timeout`). */
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<ReceiptSummary>;
}

/** Dependencies of {@link createViemChainClient}. */
export interface ViemChainDeps {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient<Transport, Chain, Account>;
  readonly account: Account;
  readonly chain: Chain;
  readonly receiptPollMs?: number;
}

/** Gas limit headroom over the node's estimate, in percent. */
const GAS_HEADROOM_PERCENT = 20n;

function toRevert(e: unknown): Error {
  if (e instanceof BaseError) {
    const hit = e.walk((x) => x instanceof ContractFunctionRevertedError || x instanceof ExecutionRevertedError);
    if (hit instanceof ContractFunctionRevertedError) return new SimulationRevert(hit.data?.errorName);
    if (hit instanceof ExecutionRevertedError) return new SimulationRevert();
  }
  return new Error('rpc_failure');
}

function sweepTuple(s: SweepFields): {
  token: Address; owner: Address; destination: Address; feeTo: Address;
  amount: bigint; fee: bigint; deadline: bigint; nonce: bigint;
} {
  return {
    token: s.token, owner: s.owner, destination: s.destination, feeTo: s.feeTo,
    amount: s.amount, fee: s.fee, deadline: s.deadline, nonce: s.nonce,
  };
}

/**
 * Production {@link ChainClient} on top of viem.
 *
 * @remarks Simulation is `publicClient.simulateContract` (an `eth_call` from the hot key) followed by
 * `estimateContractGas`; the gas limit is the estimate plus 20 %. Transactions are legacy (`gasPrice`)
 * so the configured cap is a hard bound on the price paid on every chain type.
 *
 * @param d Clients and account.
 * @returns The chain client.
 */
export function createViemChainClient(d: ViemChainDeps): ChainClient {
  const { publicClient: pub, walletClient: wallet, account, chain } = d;
  const abi = ghostPaySweepRelayerAbi;

  return {
    chainId: chain.id,
    relayerAddress: account.address,
    getGasPrice: () => pub.getGasPrice(),
    getBalance: () => pub.getBalance({ address: account.address }),
    getPendingNonce: () => pub.getTransactionCount({ address: account.address, blockTag: 'pending' }),

    async readOrderState(call) {
      const { owner, token, nonce } = call.sweep;
      const [ownerBalance, allowance, nonceUsed] = await Promise.all([
        pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
        pub.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, call.sweepRelayer] }),
        pub.readContract({ address: call.sweepRelayer, abi, functionName: 'nonceUsed', args: [owner, nonce] }),
      ]);
      return { ownerBalance, allowance, nonceUsed };
    },

    async simulateSweep(call) {
      const s = sweepTuple(call.sweep);
      try {
        if (call.permit === undefined) {
          const args = { account, address: call.sweepRelayer, abi, functionName: 'sweep', args: [s, call.sweepSig] } as const;
          await pub.simulateContract(args);
          const gas = await pub.estimateContractGas(args);
          return { gasLimit: gas + (gas * GAS_HEADROOM_PERCENT) / 100n, gasEstimate: gas };
        }
        const p = call.permit;
        const args = {
          account, address: call.sweepRelayer, abi, functionName: 'sweepWithPermit',
          args: [s, call.sweepSig, { value: p.value, deadline: p.deadline, v: p.v, r: p.r, s: p.s }],
        } as const;
        await pub.simulateContract(args);
        const gas = await pub.estimateContractGas(args);
        return { gasLimit: gas + (gas * GAS_HEADROOM_PERCENT) / 100n, gasEstimate: gas };
      } catch (e) {
        throw toRevert(e);
      }
    },

    sendSweep(call, opts) {
      const s = sweepTuple(call.sweep);
      const common = { account, chain, address: call.sweepRelayer, abi, nonce: opts.nonce, gas: opts.gas, gasPrice: opts.gasPrice } as const;
      if (call.permit === undefined) {
        return wallet.writeContract({ ...common, functionName: 'sweep', args: [s, call.sweepSig] });
      }
      const p = call.permit;
      return wallet.writeContract({
        ...common,
        functionName: 'sweepWithPermit',
        args: [s, call.sweepSig, { value: p.value, deadline: p.deadline, v: p.v, r: p.r, s: p.s }],
      });
    },

    async waitForReceipt(hash, timeoutMs) {
      try {
        const r = await pub.waitForTransactionReceipt({ hash, timeout: timeoutMs, pollingInterval: d.receiptPollMs ?? 1000 });
        return { status: r.status, gasUsed: r.gasUsed };
      } catch {
        return { status: 'timeout', gasUsed: 0n };
      }
    },
  };
}
