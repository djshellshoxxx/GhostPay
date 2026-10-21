import { encodeFunctionData } from 'viem/utils';
import { policyAccountAbi } from './abi/policyAccount.js';
import { policyAccountFactoryAbi } from './abi/policyAccountFactory.js';
import { fail } from './errors.js';
import { limitLeafHash, type LimitProof } from './limits.js';
import { computePolicyHash, predictAccountAddress, validatePolicy, type Policy, type PolicyDeployment } from './policy.js';
import type { PolicySignature, ProposeDestinationTypedData, WithdrawTypedData } from './eip712.js';
import { ZERO_HASH, bytes32, hexBytes, nonZeroAddr, type Address, type Hex } from './types.js';

/** A transaction request without gas fields. */
export interface CallRequest {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

/** @internal 65-byte signature hex. */
function sigHex(sig: PolicySignature | Hex): Hex {
  const s = hexBytes(typeof sig === 'string' ? sig : sig.signature, 'signature');
  if (s.length !== 132) return fail('INVALID_HEX', 'signature');
  return s;
}

/**
 * `PolicyAccountFactory.deploy(owner, destination, delay, limitsRoot)` calldata plus the predicted account.
 *
 * @remarks Validates the policy like the factory (non-zero, `MIN_DELAY..MAX_DELAY`) and refuses
 * `owner == destination` and `destination == account` (P8: the contract allows the former; it
 * defeats the product). With a non-zero `FLAT_FEE` the sender must first approve `FEE_TOKEN`.
 *
 * @param deployment Factory and implementation.
 * @param owner Owner EOA.
 * @param policy Policy pre-image.
 * @returns Call request and the address it will deploy.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_DELAY`, `INVALID_POLICY`, `INVALID_HEX`.
 * @security Anyone may send this transaction; it reveals the full policy (destination, delay, root) on-chain.
 * @testVector policy-scheme.accounts
 */
export function encodeDeployAccount(
  deployment: PolicyDeployment,
  owner: Address,
  policy: Policy,
): CallRequest & { readonly account: Address; readonly policyHash: Hex } {
  const o = nonZeroAddr(owner, 'owner');
  const p = validatePolicy(policy);
  const policyHash = computePolicyHash(p);
  const account = predictAccountAddress(deployment, o, policyHash);
  if (p.destination === o) return fail('INVALID_POLICY', 'destination equals owner');
  if (p.destination === account) return fail('INVALID_POLICY', 'destination equals account');
  const data = encodeFunctionData({
    abi: policyAccountFactoryAbi,
    functionName: 'deploy',
    args: [o, p.destination, p.delaySeconds, p.limitsRoot],
  });
  return Object.freeze({ to: nonZeroAddr(deployment.factory, 'factory'), data, value: 0n, account, policyHash });
}

/**
 * `PolicyAccount.requestWithdraw(Withdraw, LimitProof, bytes)` calldata.
 *
 * @param td Signed typed data from {@link buildWithdrawTypedData}.
 * @param proof The same proof used to build `td` (or {@link noLimitsProof}).
 * @param signature Owner signature over `td.digest`.
 * @returns Call request to the account.
 * @throws {PolicySchemeError} `INVALID_PROOF` if `(token, limit, windowSeconds)` does not hash to the signed
 * `limitLeafHash` (contract `LimitLeafMismatch`), `INVALID_HEX`, `INVALID_LIMIT`.
 * @security Anyone may relay; the relayer cannot change token, amount, leaf or recipient.
 * @testVector policy-scheme.withdraws
 */
export function encodeRequestWithdraw(
  td: WithdrawTypedData,
  proof: LimitProof,
  signature: PolicySignature | Hex,
): CallRequest {
  const m = td.message;
  if (m.limitLeafHash !== ZERO_HASH) {
    const leaf = limitLeafHash({ token: m.token, limit: proof.limit, windowSeconds: proof.windowSeconds });
    if (leaf !== m.limitLeafHash) return fail('INVALID_PROOF', 'proof leaf is not the signed limitLeafHash');
  }
  const data = encodeFunctionData({
    abi: policyAccountAbi,
    functionName: 'requestWithdraw',
    args: [
      { token: m.token, amount: m.amount, deadline: m.deadline, nonce: m.nonce, limitLeafHash: m.limitLeafHash },
      { limit: proof.limit, windowSeconds: proof.windowSeconds, proof: proof.proof.map((x, i) => bytes32(x, `proof[${String(i)}]`)) },
      sigHex(signature),
    ],
  });
  return Object.freeze({ to: td.domain.verifyingContract, data, value: 0n });
}

/**
 * `PolicyAccount.executeWithdraw(id)` calldata (permissionless after the delay).
 *
 * @param account Account clone.
 * @param id Request id (`WithdrawTypedData.structHash`).
 * @returns Call request.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security Public; pays to the destination current at execution time.
 */
export function encodeExecuteWithdraw(account: Address, id: Hex): CallRequest {
  const data = encodeFunctionData({ abi: policyAccountAbi, functionName: 'executeWithdraw', args: [bytes32(id, 'id')] });
  return Object.freeze({ to: nonZeroAddr(account, 'account'), data, value: 0n });
}

/**
 * `PolicyAccount.cancel(id, sig)` calldata.
 *
 * @param account Account clone.
 * @param id Request id.
 * @param signature Owner signature over `CancelWithdraw(id)`.
 * @returns Call request.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security Public once sent.
 */
export function encodeCancelWithdraw(account: Address, id: Hex, signature: PolicySignature | Hex): CallRequest {
  const data = encodeFunctionData({ abi: policyAccountAbi, functionName: 'cancel', args: [bytes32(id, 'id'), sigHex(signature)] });
  return Object.freeze({ to: nonZeroAddr(account, 'account'), data, value: 0n });
}

/**
 * `PolicyAccount.proposeDestination(newDestination, deadline, nonce, sig)` calldata.
 *
 * @param td Typed data from {@link buildProposeDestinationTypedData}.
 * @param signature Owner signature over `td.digest`.
 * @returns Call request.
 * @throws {PolicySchemeError} `INVALID_HEX`.
 * @security Starts the `2 * delay` timelock; announces the new destination publicly.
 * @testVector policy-scheme.withdraws
 */
export function encodeProposeDestination(td: ProposeDestinationTypedData, signature: PolicySignature | Hex): CallRequest {
  const m = td.message;
  const data = encodeFunctionData({
    abi: policyAccountAbi,
    functionName: 'proposeDestination',
    args: [m.newDestination, m.deadline, m.nonce, sigHex(signature)],
  });
  return Object.freeze({ to: td.domain.verifyingContract, data, value: 0n });
}

/**
 * `PolicyAccount.executeDestinationChange()` calldata (permissionless after `2 * delay`).
 *
 * @param account Account clone.
 * @returns Call request.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`.
 * @security Public.
 */
export function encodeExecuteDestinationChange(account: Address): CallRequest {
  const data = encodeFunctionData({ abi: policyAccountAbi, functionName: 'executeDestinationChange', args: [] });
  return Object.freeze({ to: nonZeroAddr(account, 'account'), data, value: 0n });
}

/**
 * `PolicyAccount.cancelDestination(id, sig)` calldata.
 *
 * @param account Account clone.
 * @param id Proposal id (`ProposeDestinationTypedData.structHash`, or `pendingProposalId()`).
 * @param signature Owner signature over `CancelDestination(id)`.
 * @returns Call request.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security Public once sent.
 */
export function encodeCancelDestination(account: Address, id: Hex, signature: PolicySignature | Hex): CallRequest {
  const data = encodeFunctionData({ abi: policyAccountAbi, functionName: 'cancelDestination', args: [bytes32(id, 'id'), sigHex(signature)] });
  return Object.freeze({ to: nonZeroAddr(account, 'account'), data, value: 0n });
}
