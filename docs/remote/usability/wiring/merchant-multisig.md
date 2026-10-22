# Wiring: @ghostpay/merchant-multisig

The package is an **off-chain** approval policy. It decides whether a quorum
approved a proposal and when it may execute. It does not hold or move funds. Until
the steps below land, a single holder of the account's on-chain key can still move
funds without any approvals: the UI must not describe the account as "multisig
protected" before on-chain enforcement exists.

## 1. On-chain enforcement (contracts — NOT edited by this change)

`packages/contracts/src/PolicyAccount.sol` is the natural home. Required work, to be
done by the contracts owner with its own audit:

1. Store `signers[]`, `threshold`, `timelocks`, `version`, `nextNonce`, and a queue
   `mapping(bytes32 digest => uint64 executableAt)`.
2. Recompute the digest on-chain with the identical TLV layout and domain
   (`GhostPay.MerchantMultisig.Proposal.v1\0`, keccak256). Add a cross-language
   test vector: the TS fixture payout digest
   `65b56119d77639946d108ea628767e46cbaedd46c8435a68f55c307073dfd646`
   (see `proposal.test.ts`) must match the Solidity encoder.
3. `chainId` in the proposal must equal `block.chainid`; `accountId` must map to
   `address(this)` (or replace `accountId` with the account address in v2 of the
   domain).
4. Verify signatures with `ecrecover` on the digest, require `s <= n/2`, map the
   recovered address to the signer's compressed key (store addresses on-chain), and
   require strictly increasing signer addresses to dedupe.
5. Timelock uses `block.timestamp`; cancel and config follow MS-13/MS-14.
6. Invariants to fuzz (forge/echidna): nonce monotonic; no execute before
   `executableAt`; config change clears queue; threshold <= signers.length.

## 2. Relayer (apps/relayer)

No change required for v1. If the relayer submits multisig executions, it must
only relay already-approved proposals and never hold approval keys.

## 3. Web (apps/web)

1. Merchant settings: signer list (key + controller label), threshold, timelocks.
   Validate with `validatePolicy` before saving; display `policyHash`.
2. Proposal flow: build proposal -> show human-readable summary (amount from
   base-unit string, asset, destination, expiry) -> each signer signs with
   `signProposal` on their own device -> collect approvals -> `queueProposal` ->
   countdown to `executableAt` -> `executeProposal`.
3. Persist `AccountState` with integrity in mind; `executeProposal` re-verifies
   approvals, but a rolled-back state can re-enable a consumed nonce. Use the
   on-chain nonce as the source of truth once contracts exist.
4. Show a banner while enforcement is off-chain only (see top of this file).
