import { BaseError, getAddress, type Address, type Hex } from 'viem';
import { assertTestnet } from '../chainGuard.js';
import type { SponsorCall, SponsorChain, SponsorReceipt } from './types.js';

/** The subset of a viem public client the adapter uses (so tests can fake it). */
export interface PublicClientLike {
  getGasPrice(): Promise<bigint>;
  call(args: { to: Address; data: Hex }): Promise<{ data?: Hex | undefined }>;
  estimateGas(args: {
    account: Address;
    to: Address;
    data: Hex;
    authorizationList?: SponsorCall['authorizationList'];
  }): Promise<bigint>;
  waitForTransactionReceipt(args: { hash: Hex; timeout?: number }): Promise<{
    status: 'success' | 'reverted';
    gasUsed: bigint;
    effectiveGasPrice: bigint;
    logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[];
  }>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
}

/** The subset of a viem wallet client (with the sponsor hot key account) the adapter uses. */
export interface WalletClientLike {
  readonly account: { readonly address: Address };
  sendTransaction(args: {
    to: Address;
    data: Hex;
    gas: bigint;
    authorizationList?: SponsorCall['authorizationList'];
  }): Promise<Hex>;
}

/**
 * Adapts viem clients to the sponsor's chain port. The wallet client holds the testnet hot key; this
 * module never reads or logs it.
 *
 * @param chainId Chain id (testnet allowlist enforced).
 * @param pub Public client.
 * @param wallet Wallet client with the sponsor account.
 * @param receiptTimeoutMs Receipt wait timeout (default 60 s).
 * @returns The chain port.
 */
export function createViemSponsorChain(chainId: number, pub: PublicClientLike, wallet: WalletClientLike, receiptTimeoutMs = 60_000): SponsorChain {
  assertTestnet(chainId);
  const sponsorAddress = getAddress(wallet.account.address);
  const withAuth = (c: SponsorCall) => (c.authorizationList === undefined ? {} : { authorizationList: c.authorizationList });
  return {
    chainId,
    sponsorAddress,
    gasPrice: () => pub.getGasPrice(),
    call: async (to, data) => (await pub.call({ to, data })).data ?? '0x',
    simulate: async (c) => {
      try {
        const gas = await pub.estimateGas({ account: sponsorAddress, to: c.to, data: c.data, ...withAuth(c) });
        return { ok: true, gas };
      } catch (e) {
        // Only an EVM revert is a "simulation failed" (neutral for the breaker); transport and node
        // errors propagate so the breaker counts them as failures.
        if (isRevert(e)) return { ok: false };
        throw e;
      }
    },
    send: (c, gasLimit) => wallet.sendTransaction({ to: c.to, data: c.data, gas: gasLimit, ...withAuth(c) }),
    waitForReceipt: async (hash): Promise<SponsorReceipt> => {
      const r = await pub.waitForTransactionReceipt({ hash, timeout: receiptTimeoutMs });
      return {
        success: r.status === 'success',
        gasUsed: r.gasUsed,
        effectiveGasPrice: r.effectiveGasPrice,
        logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })),
      };
    },
    getCode: (address) => pub.getCode({ address }),
  };
}

const REVERT_ERRORS = new Set(['ExecutionRevertedError', 'ContractFunctionRevertedError', 'InvalidInputRpcError']);

/**
 * Whether `e` is (caused by) an EVM execution revert as opposed to a transport or node failure.
 *
 * @param e Thrown value.
 * @returns True for a revert.
 */
export function isRevert(e: unknown): boolean {
  if (!(e instanceof BaseError)) return false;
  return e.walk((x) => x instanceof Error && REVERT_ERRORS.has(x.name)) !== null;
}
