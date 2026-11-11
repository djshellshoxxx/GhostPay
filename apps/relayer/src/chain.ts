import {
  BaseError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  RpcError,
  RpcRequestError,
  TransactionReceiptNotFoundError,
  UnknownRpcError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  encodeFunctionData,
  erc20Abi,
  keccak256,
} from 'viem';
import { ghostPaySweepRelayerAbi } from '@ghostpay/chain-adapters';
import { SendOutcomeUnknown, SendRefused, SimulationRevert } from './errors.js';
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
  /** Called synchronously with the signed transaction's hash after signing and before broadcast. If it throws, nothing is broadcast and sendSweep throws SendRefused. */
  readonly onSigned?: (txHash: Hex) => void;
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

/** Receipt of a mined transaction. */
export interface MinedReceipt {
  readonly status: 'success' | 'reverted';
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
  /**
   * Signs with the hot key and broadcasts once.
   *
   * @throws {SendRefused} only when the transaction certainly entered no mempool (safe to release and reuse the
   * nonce). Every other error, {@link SendOutcomeUnknown} included, means it may have been broadcast.
   */
  sendSweep(call: SweepCall, opts: SendOptions): Promise<Hex>;
  /** Waits for inclusion (never throws; failures map to `timeout`). */
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<ReceiptSummary>;
  /** Looks a receipt up once without waiting: `null` while the node knows no receipt for `hash`. */
  getReceipt(hash: Hex): Promise<MinedReceipt | null>;
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

/** An operational RPC failure. The provider's error is not kept: its text can name the RPC URL. */
function rpcFailure(): Error {
  return new Error('rpc_failure');
}

function toRevert(e: unknown): Error {
  if (e instanceof BaseError) {
    const hit = e.walk((x) => x instanceof ContractFunctionRevertedError || x instanceof ExecutionRevertedError);
    if (hit instanceof ContractFunctionRevertedError) return new SimulationRevert(hit.data?.errorName);
    if (hit instanceof ExecutionRevertedError) return new SimulationRevert();
  }
  return rpcFailure();
}

/**
 * Node answers to `eth_sendRawTransaction` that refuse THIS transaction, so it is in no mempool afterwards. A fixed
 * list matched on the JSON-RPC error message: anything else is outcome-unknown (fail closed).
 *
 * "nonce too low" is deliberately absent: only this send was signed with its nonce, so a used nonce can mean this very
 * transaction already landed (an RPC gateway that forwards the request twice answers the second copy this way).
 * Reconciliation then sees the pending count above the nonce and settles it as broadcast instead of releasing it.
 */
const NODE_REFUSAL =
  /nonce too high|nonce has max value|insufficient funds|exceeds transaction sender account balance|intrinsic gas too (?:low|high)|exceeds block gas limit|transaction underpriced|fee cap less than block base fee|max fee per gas less than block base fee|transaction type not (?:valid|supported)|execution reverted/;
/**
 * Answers that mean the node already holds the same transaction. Never a refusal, although viem maps some of them to
 * `NonceTooLowError`.
 */
const NODE_HOLDS_TX = /already known|already imported|known transaction|already exists|already in (?:the )?(?:mem)?pool/;

/**
 * True only for a JSON-RPC error answer (not a transport, HTTP or timeout failure) whose message is a refusal of the
 * transaction. viem sends `eth_sendRawTransaction` with `retryCount: 0`, so the answer is to this one attempt.
 */
function nodeRefused(e: unknown): boolean {
  if (!(e instanceof BaseError)) return false;
  const answer = e.walk((x) => x instanceof RpcRequestError || (x instanceof RpcError && !(x instanceof UnknownRpcError)));
  if (!(answer instanceof BaseError)) return false;
  const message = answer.details.toLowerCase();
  return !NODE_HOLDS_TX.test(message) && NODE_REFUSAL.test(message);
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

    async sendSweep(call, opts) {
      // Signed here and sent raw so the hash is known before anything leaves the process: an unknown outcome can then
      // be settled later by a receipt lookup (EVM-3).
      let raw: Hex;
      try {
        const s = sweepTuple(call.sweep);
        const p = call.permit;
        const data =
          p === undefined
            ? encodeFunctionData({ abi, functionName: 'sweep', args: [s, call.sweepSig] })
            : encodeFunctionData({
                abi,
                functionName: 'sweepWithPermit',
                args: [s, call.sweepSig, { value: p.value, deadline: p.deadline, v: p.v, r: p.r, s: p.s }],
              });
        raw = await wallet.signTransaction({
          account, chain, to: call.sweepRelayer, data, nonce: opts.nonce, gas: opts.gas, gasPrice: opts.gasPrice, type: 'legacy',
        });
      } catch {
        throw new SendRefused(); // nothing was handed to the RPC
      }
      const txHash = keccak256(raw);
      try {
        return await wallet.sendRawTransaction({ serializedTransaction: raw });
      } catch (e) {
        if (nodeRefused(e)) throw new SendRefused();
        throw new SendOutcomeUnknown(txHash);
      }
    },

    async waitForReceipt(hash, timeoutMs) {
      try {
        const r = await pub.waitForTransactionReceipt({ hash, timeout: timeoutMs, pollingInterval: d.receiptPollMs ?? 1000 });
        return { status: r.status, gasUsed: r.gasUsed };
      } catch {
        return { status: 'timeout', gasUsed: 0n };
      }
    },

    async getReceipt(hash) {
      try {
        const r = await pub.getTransactionReceipt({ hash });
        return { status: r.status, gasUsed: r.gasUsed };
      } catch (e) {
        if (e instanceof TransactionReceiptNotFoundError) return null;
        throw rpcFailure();
      }
    },
  };
}
