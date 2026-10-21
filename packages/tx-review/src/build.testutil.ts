import { ghostPayRouterAbi, erc20Abi, routerFee } from '@ghostpay/chain-adapters';
import { encodeFunctionData, getAddress } from 'viem';
import type {
  Hex,
  Intent,
  PermitSigIntent,
  RelayedSweepSigIntent,
  ReviewPolicy,
  RouterPaymentIntent,
  TxInput,
  TypedDataInput,
} from './types.js';

export const CHAIN = 11155111;
export const NOW = 1_800_000_000;
export const ROUTER = getAddress('0x0000000000000000000000000000000000000b22');
export const RELAYER = getAddress('0x0000000000000000000000000000000000000c33');
export const ANNOUNCER = getAddress('0x0000000000000000000000000000000000000a11');
export const FEE_RECIPIENT = getAddress('0x0000000000000000000000000000000000000d44');
export const USDC = getAddress('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');
export const EVIL_TOKEN = getAddress('0x00000000000000000000000000000000DeaDBeef');
export const STEALTH = getAddress('0x0000000000000000000000000000000000005555');
export const OWNER = getAddress('0x0000000000000000000000000000000000006666');
export const DEST = getAddress('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65');
/** secp256k1 generator, compressed: a valid 33-byte point. */
export const EPH: Hex = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
export const NATIVE_META_TOKEN = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export function erc20Metadata(tag: number, token: string, net: bigint): Hex {
  return `0x${tag.toString(16).padStart(2, '0')}a9059cbb${token.slice(2).toLowerCase()}${net.toString(16).padStart(64, '0')}`;
}
export function nativeMetadata(tag: number, net: bigint): Hex {
  return `0x${tag.toString(16).padStart(2, '0')}eeeeeeee${NATIVE_META_TOKEN}${net.toString(16).padStart(64, '0')}`;
}

export function policy(over: Partial<ReviewPolicy> = {}): ReviewPolicy {
  return {
    tokens: new Map([[CHAIN, new Set([USDC.toLowerCase()])]]),
    contracts: { router: ROUTER, sweepRelayer: RELAYER, announcer: ANNOUNCER },
    feeCaps: { maxFeePerGasWei: 100n * 10n ** 9n, maxGasLimit: 100_000n, maxFeeShareBps: 300 },
    feeRecipient: FEE_RECIPIENT,
    maxDeadlineSeconds: 3600,
    ...over,
  };
}

export function routerPayment(over: Partial<RouterPaymentIntent> = {}): RouterPaymentIntent {
  const gross = over.gross ?? 1_000_000_000n;
  const fee = routerFee(gross);
  const token = over.token ?? USDC;
  const method = over.method ?? (token === 'native' ? 'payNative' : 'payERC20');
  return {
    kind: 'router_payment',
    method,
    chainId: CHAIN,
    router: ROUTER,
    token,
    stealth: STEALTH,
    gross,
    minNet: gross - fee,
    fee,
    deadline: BigInt(NOW + 600),
    metadata: token === 'native' ? nativeMetadata(7, gross - fee) : erc20Metadata(7, token, gross - fee),
    ephemeralKey: EPH,
    ...over,
  };
}

export const approve = (over: Partial<Extract<Intent, { kind: 'erc20_approve' }>> = {}): Extract<Intent, { kind: 'erc20_approve' }> => ({
  kind: 'erc20_approve',
  chainId: CHAIN,
  token: USDC,
  spender: ROUTER,
  amount: 1_000_000_000n,
  ...over,
});

export const directSweep = (over: Partial<Extract<Intent, { kind: 'direct_sweep' }>> = {}): Extract<Intent, { kind: 'direct_sweep' }> => ({
  kind: 'direct_sweep',
  chainId: CHAIN,
  from: STEALTH,
  token: USDC,
  to: DEST,
  amount: 10n ** 12n,
  maxFeePerGas: 2n * 10n ** 9n,
  maxPriorityFeePerGas: 10n ** 9n,
  gasLimit: 65_000n,
  ...over,
});

export const relayedSweep = (over: Partial<RelayedSweepSigIntent> = {}): RelayedSweepSigIntent => ({
  kind: 'relayed_sweep_sig',
  chainId: CHAIN,
  verifyingContract: RELAYER,
  owner: STEALTH,
  token: USDC,
  destination: DEST,
  amount: 1_000_000n,
  fee: 10_000n,
  feeTo: FEE_RECIPIENT,
  deadline: BigInt(NOW + 600),
  nonce: 3n,
  ...over,
});

export const permitSig = (over: Partial<PermitSigIntent> = {}): PermitSigIntent => ({
  kind: 'permit_sig',
  chainId: CHAIN,
  token: USDC,
  owner: STEALTH,
  spender: ROUTER,
  value: 1_000_000_000n,
  nonce: 0n,
  deadline: BigInt(NOW + 600),
  ...over,
});

const loose = encodeFunctionData as unknown as (p: { abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) => Hex;
const SIG = { v: 27, r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}` };

/** Independent builder: Intent -> unsigned tx (tests only; production builders live in chain-adapters). */
export function buildTx(i: Intent, gas: Partial<TxInput> = {}): TxInput {
  switch (i.kind) {
    case 'router_payment': {
      const common = [i.stealth, i.minNet, i.deadline, i.ephemeralKey, i.metadata] as const;
      if (i.method === 'payNative') {
        return { chainId: i.chainId, to: i.router, value: i.gross, data: loose({ abi: ghostPayRouterAbi, functionName: 'payNative', args: common }) };
      }
      const [stealth, minNet, deadline, eph, meta] = common;
      const head = [i.token, stealth, i.gross, minNet, deadline, eph, meta];
      const args = i.method === 'payERC20WithPermit' ? [...head, SIG.v, SIG.r, SIG.s] : head;
      return { chainId: i.chainId, to: i.router, value: 0n, data: loose({ abi: ghostPayRouterAbi, functionName: i.method, args }) };
    }
    case 'erc20_approve':
      return { chainId: i.chainId, to: i.token, value: 0n, data: loose({ abi: erc20Abi, functionName: 'approve', args: [i.spender, i.amount] }) };
    case 'direct_sweep': {
      const g = { from: i.from, maxFeePerGas: i.maxFeePerGas, maxPriorityFeePerGas: i.maxPriorityFeePerGas, gasLimit: i.gasLimit, ...gas };
      if (i.token === 'native') return { chainId: i.chainId, to: i.to, value: i.amount, data: '0x', ...g };
      return { chainId: i.chainId, to: i.token, value: 0n, data: loose({ abi: erc20Abi, functionName: 'transfer', args: [i.to, i.amount] }), ...g };
    }
    default:
      throw new Error('not a transaction intent');
  }
}

/** Independent builder: signature intent -> typed data. */
export function buildTyped(i: Intent): TypedDataInput {
  if (i.kind === 'relayed_sweep_sig') {
    return {
      domain: { name: 'GhostPaySweepRelayer', version: '1', chainId: i.chainId, verifyingContract: i.verifyingContract },
      types: {
        Sweep: [
          { name: 'token', type: 'address' },
          { name: 'owner', type: 'address' },
          { name: 'destination', type: 'address' },
          { name: 'feeTo', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'fee', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'Sweep',
      message: { token: i.token, owner: i.owner, destination: i.destination, feeTo: i.feeTo, amount: i.amount, fee: i.fee, deadline: i.deadline, nonce: i.nonce },
    };
  }
  if (i.kind === 'permit_sig') {
    return {
      domain: { name: 'USDC', version: '2', chainId: i.chainId, verifyingContract: i.token },
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Permit',
      message: { owner: i.owner, spender: i.spender, value: i.value, nonce: i.nonce, deadline: i.deadline },
    };
  }
  throw new Error('not a signature intent');
}

