# Self-review: @ghostpay/merchant-multisig

Scope: `packages/merchant-multisig/src/*.ts`. Reviewer: the implementing agent
(not independent). Spec: `specs/multisig-merchant.md`.

## Threat model

| Actor | Capability | Goal |
|-------|------------|------|
| Outsider | Submits proposals/approvals, observes signatures | Get funds paid out |
| Single rogue signer (< threshold) | One valid key | Act alone, cast two votes, replay old approvals |
| Rogue quorum (>= threshold) | m valid keys | Drain quickly before others react |
| Storage attacker | Edits or rolls back persisted `AccountState` | Skip timelock, reuse nonces |
| Cross-context replayer | Signatures from another account/chain/policy/kind | Reuse them here |

## Findings and fixes

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | High | Negated key: `k` and `n-k` give the same x with flipped 02/03 prefix; one secret could hold two seats. | Fixed: dedupe by x-coordinate. Test: "rejects the negated key". |
| 2 | High | Duplicate approvals or the high-s malleated twin could count twice. | Fixed: count by signer key; low-s required. Tests. |
| 3 | High | Replay across account, chain, signer-set version, kind, nonce. | Fixed: all in digest; `policyHash` commits to full policy incl. version; kind tag; sequential nonce consumed at queue. |
| 4 | Medium | Accessor properties (getters) could return different values on validate vs encode. | Fixed: `readExact` rejects accessors; frozen copies used downstream. |
| 5 | Medium | Persisted `executableAt` / approvals could be tampered. | Fixed: timelock recomputed from policy; approvals re-verified at execute; digest re-checked. |
| 6 | Medium | Timelock could be unreachable (expires first), leaving dead queue entries. | Fixed: queue refuses if `now + timelock >= expiresAt`. |
| 7 | Medium | A quorum could shorten timelocks then drain. | Mitigated: `config >= max(payout, refund)` and config waits its own timelock. |
| 8 | Low | Old queued proposals after rotation. | Fixed: config execution clears the queue and returns `invalidated`. |
| 9 | Low | Unbounded inputs. | Fixed: <= 20 signers, <= 64 approvals, <= 64 queued, 60-day lifetime, u64 nonce with no wrap. |

## Honest limits (not fixed)

- **Off-chain only.** No contract enforces this policy yet; a holder of the
  account's on-chain key bypasses it. See `wiring/merchant-multisig.md`.
- **Rogue quorum.** Cancel and rotation both need threshold. If `m` keys are
  compromised the timelock only buys observation time; it does not let a minority
  stop them. Enforcement of a lower "veto" threshold is a product decision not made here.
- **Disjoint quorums.** With `m <= n/2` two disjoint groups can each queue
  conflicting proposals. Not enforced; UI should recommend `m > n/2`.
- **Controller labels are self-declared.** Related-signer detection can only catch
  identical keys, negated keys, and identical labels; it cannot prove two keys are
  held by different people.
- **State rollback.** Restoring an older `AccountState` re-opens consumed nonces.
  Needs an append-only store or on-chain nonce.
- **Clock trust.** `now` is injected; a wrong executor clock shortens timelocks.
- Hostile `Proxy` inputs can throw non-`MultisigError` exceptions from traps
  (fail-closed, but the error type differs).
- `verifyRaw`'s `catch` is defensive and not reached by tests (1 uncovered line).

## Verification run

`npm test -w @ghostpay/merchant-multisig` (55 tests, coverage 99.6/98.7/100/99.6),
`npm run typecheck`, `npm run lint`, `npm run build` — all pass. Not run: Solidity
cross-check of the digest vector (no contract exists), mutation testing.
