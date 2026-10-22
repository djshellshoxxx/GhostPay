# Spec: multisig-merchant (m-of-n merchant account approvals)

Status: implemented as an off-chain policy library in `packages/merchant-multisig`
(`@ghostpay/merchant-multisig`). On-chain enforcement is **not** implemented; see
`docs/remote/usability/wiring/merchant-multisig.md`.

## Goal

A merchant account can require `m` of `n` independent signers to approve payouts,
refunds and changes to the signer set itself, with replay protection, expiry and a
timelock that gives honest signers time to react to a malicious quorum or a leaked key.

## Requirements

| ID | Requirement |
|----|-------------|
| MS-1 | A policy has `accountId`, `chainId` (decimal u64 >= 1), `version`, 1..20 signers, `threshold` in 1..n, per-kind timelocks (payout, refund, config) each 0..30 days. |
| MS-2 | Signers are compressed secp256k1 keys (lowercase hex, valid point). Duplicate keys are rejected. |
| MS-3 | Related signers are rejected: same x-coordinate (the negated key `n-k` is derivable from `k`), or same `controller` label (case-insensitive). |
| MS-4 | `timelocks.config >= max(timelocks.payout, timelocks.refund)`, so a quorum cannot shorten protections faster than they protect. |
| MS-5 | Proposal kinds: `payout`, `refund` (bound to an invoice id), `config` (new signers/threshold/timelocks), `cancel` (target digest). |
| MS-6 | Proposals carry `accountId`, `chainId`, `policyHash`, `nonce`, `createdAt`, `expiresAt`; all are signed. |
| MS-7 | Digest = `keccak256("GhostPay.MerchantMultisig.Proposal.v1\0" \|\| TLV(fields))`. TLV is injective. Domain differs from invoice signatures. |
| MS-8 | Approvals are 64-byte compact ECDSA secp256k1 signatures, RFC 6979, low-s only (high-s twin rejected), verified with `@noble/curves` as in `invoice-schema`. |
| MS-9 | A signer counts at most once; unknown signers, bad and malformed signatures do not count and are reported, not thrown. |
| MS-10 | Replay: nonce must equal the account's `nextNonce` (strictly sequential) and is consumed on queue; `policyHash` binds to the exact signer set and version; account and chain must match. |
| MS-11 | Expiry: cannot queue or execute at/after `expiresAt`; `createdAt` may be at most 300 s in the future; lifetime <= 60 days; queueing is refused if `now + timelock >= expiresAt`. |
| MS-12 | Timelock: executable only at `queuedAt + timelock(kind)`, recomputed from the policy at execution (stored `executableAt` is not trusted alone). |
| MS-13 | Cancel needs the same threshold and applies immediately. |
| MS-14 | Rotation (config) needs threshold of the *current* policy, waits the config timelock, installs `version + 1`, and invalidates all other queued proposals. |
| MS-15 | Execution re-verifies stored approvals against the current policy. |
| MS-16 | Money is decimal strings / bigint; amounts 1..2^256-1; no floats. Clock is injected (`now`). No network, no randomness needed (deterministic signatures). |

## Acceptance tests (all in `packages/merchant-multisig/src/*.test.ts`)

- 2-of-3 payout queues at T0+60, fails at T0+60+3599 (`TIMELOCK`), executes at T0+60+3600.
- Same approval x3 counts once; high-s twin is `BAD_SIGNATURE`; outsider is `UNKNOWN_SIGNER`; signature over amount `1` does not approve amount `250000000`.
- Payout approvals cannot be replayed as a refund, on chain `1` instead of `8453`, on another account, under policy version 1, or at the same nonce twice; nonce `5` when `0` is expected is `REPLAY`; nonce 2^64-1 is `LIMIT`.
- Negated key (02/03 flip of the same x), duplicate key, and shared controller (`Alice`/`alice`) are rejected.
- Rotation with 1 approval is `THRESHOLD`; with 2 it executes after 86 400 s, bumps version to 1, invalidates the queued payout, old signer K3 no longer counts, new signer K4 does.
- Tampered persisted state (lowered `executableAt`, removed approvals, swapped proposal) fails at execution.
- Pinned digest test vector for the fixture payout.
