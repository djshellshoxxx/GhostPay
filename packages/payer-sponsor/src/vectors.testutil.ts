import type { Address, Hex } from 'viem';
import { buildRelayIntent, relayDigest } from './relay/intent.js';
import { buildDelegatePayIntent, delegateDigest } from './eip7702/intent.js';
import { buildErc20Metadata, routerFee } from './routerTargets.js';
import { buildInitCode } from './erc4337/account.js';
import { buildPayerCalls, buildUserOperation, getUserOpHashV07, packedUserOpHash } from './erc4337/userop.js';
import { encodePaymasterAndData, paymasterSignedHash, type PaymasterParams } from './erc4337/paymaster.js';
import { parseManifest } from './manifest.js';

export const A = {
  relay: '0x1000000000000000000000000000000000000001',
  router: '0x1000000000000000000000000000000000000002',
  token: '0x1000000000000000000000000000000000000003',
  stealth: '0x1000000000000000000000000000000000000004',
  payer: '0x1000000000000000000000000000000000000005',
  sponsorFeeTo: '0x1000000000000000000000000000000000000006',
  delegate: '0x1000000000000000000000000000000000000007',
  paymaster: '0x1000000000000000000000000000000000000008',
  factory: '0x1000000000000000000000000000000000000009',
  owner: '0x100000000000000000000000000000000000000b',
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  account: '0x100000000000000000000000000000000000000a',
} as const satisfies Record<string, Address>;

export const VECTOR_CHAIN_ID = 31337;
const GROSS = 1_000_000_000n;
const SPONSOR_FEE = 2_000_000n;

/** Deterministic inputs and every value derived from them with this package (the Foundry side recomputes them). */
export function computeVectors() {
  const net = GROSS - routerFee(GROSS);
  const pay = {
    token: A.token,
    stealth: A.stealth,
    gross: GROSS,
    minNet: net,
    deadline: 1_700_086_400n,
    ephemeralPubKey: `0x02${'12'.repeat(32)}` as Hex,
    metadata: buildErc20Metadata(0xab, A.token, net),
  };
  const router = { kind: 'ghostpay', address: A.router } as const;
  const relay = buildRelayIntent({
    chainId: VECTOR_CHAIN_ID,
    relay: A.relay,
    payer: A.payer,
    router,
    pay,
    sponsorFee: SPONSOR_FEE,
    sponsorFeeTo: A.sponsorFeeTo,
    deadline: 1_700_003_600n,
    nonce: 7n,
  });
  const manifest = parseManifest({ deployments: [{ chainId: VECTOR_CHAIN_ID, delegate: A.delegate }] });
  const delegate = buildDelegatePayIntent({
    chainId: VECTOR_CHAIN_ID,
    manifest,
    delegate: A.delegate,
    payer: A.payer,
    payerAccountNonce: 0,
    router,
    pay,
    sponsorFee: SPONSOR_FEE,
    sponsorFeeTo: A.sponsorFeeTo,
    deadline: 1_700_003_600n,
    nonce: 7n,
  });
  const calls = buildPayerCalls({
    token: A.token,
    router: A.router,
    routerCalldata: relay.routerCalldata,
    gross: GROSS,
    sponsorFee: SPONSOR_FEE,
    sponsorFeeTo: A.sponsorFeeTo,
  });
  const built = buildUserOperation({
    chainId: VECTOR_CHAIN_ID,
    entryPoint: A.entryPoint,
    sender: A.account,
    initCode: buildInitCode(A.factory, A.owner, 7n),
    nonce: 0n,
    calls,
    gas: { verificationGasLimit: 1_500_000n, callGasLimit: 1_000_000n, preVerificationGas: 100_000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n },
  });
  const pm: PaymasterParams = { paymaster: A.paymaster, verificationGasLimit: 300_000n, postOpGasLimit: 50_000n, validUntil: 1_700_003_600n, validAfter: 1_699_999_999n };
  const withPm = { ...built.userOp, paymasterAndData: encodePaymasterAndData(pm, `0x${'11'.repeat(65)}`) };
  return {
    chainId: VECTOR_CHAIN_ID,
    addresses: A,
    pay: { ...pay, gross: pay.gross.toString(), minNet: pay.minNet.toString(), deadline: pay.deadline.toString() },
    sponsorFee: SPONSOR_FEE.toString(),
    routerCalldata: relay.routerCalldata,
    payloadHash: relay.intent.payloadHash,
    expected: {
      relayDigest: relayDigest(relay.typedData),
      delegateDigest: delegateDigest(delegate.typedData),
      userOpCallData: built.userOp.callData,
      userOpInitCode: built.userOp.initCode,
      userOpHash: getUserOpHashV07(withPm, A.entryPoint, VECTOR_CHAIN_ID),
      packedUserOpHash: packedUserOpHash(withPm),
      paymasterHash: paymasterSignedHash(withPm, pm, VECTOR_CHAIN_ID),
    },
    userOp: {
      sender: withPm.sender,
      nonce: withPm.nonce.toString(),
      accountGasLimits: withPm.accountGasLimits,
      preVerificationGas: withPm.preVerificationGas.toString(),
      gasFees: withPm.gasFees,
      paymasterAndData: withPm.paymasterAndData,
    },
    paymaster: { validUntil: pm.validUntil.toString(), validAfter: pm.validAfter.toString() },
    withPm,
  };
}
