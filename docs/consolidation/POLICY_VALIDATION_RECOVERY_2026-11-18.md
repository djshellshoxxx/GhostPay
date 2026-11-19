# Existing policy validation recovery — 2026-11-18

## Scope and source

This group follows the separately reviewable CLI/relayer recovery `d80aa890c6492247cccbe13ac0621f1242749254`.
Ownership is recorded before edits at `6316b0c4`. It preserves existing PR #211 validation from
`a92658b1ef6b95ff0145b2e1933d0047d51289d5`; it is not a new payment protocol or deployment.

Nine original source patches applied cleanly in dependency order. Exact commit ids, path blobs and retained-base
receipts are recorded in `policy-validation-recovery-2026-11-18.json`.

| Source commits | Restored behavior |
|---|---|
| `0c0bbaa2` | Decode policy-router calldata only when its ABI encoding is canonical, the ephemeral key is a compressed curve point, metadata matches the method/token/net amount, and net is at least minNet. |
| `6e27f497`, `ca2c6b75` | Sign only the package's policy-account domains and structs. Read caller properties once, validate copies, recompute the digest using package-owned types, compare the supplied digest and sign only the recomputed value. |
| `86fa1fef`, `ba877c31` | Recompute a limit leaf from token, limit and window before accepting a withdrawal proof or a restored tree entry. A valid Merkle path cannot authorize edited leaf fields or another token. |
| `16133082` | Validate policy hashes and deployment inputs before copying the viewing secret, so every later path is covered by the existing wipe. |
| `818aa34f` | Preserve the source's explanations of unauthenticated meta-addresses, decoder boundaries and signer responsibilities. |
| `0dab0db4`, `60f44acd` | Bind prepare and final wallet-send checks to the derived ephemeral key and metadata, in addition to owner/account/policy. Rebuild tampered token/amount test fixtures so they remain internally valid and reach the intended final guard. |

The paired tests retain canonical positive controls and adversarial cases: foreign/self-consistent typed data,
changing getters, inherited or hidden domain salt, edited limits, inner-node-as-leaf proofs, secret lifetime,
trailing calldata, valid but swapped ephemeral keys/view tags, and final pre-wallet refusal with zero sends.

## Preserved boundaries

Contract runtime, ABI, policy hash definitions, deployment authentication, empty built-in pinned-deployment map,
experimental exposure and delay limits remain unchanged. The strict signer validates message field types and
the policy signature domain; existing builder checks still own business constraints such as amounts and deadlines.
It is not a general EIP-712 signing API.

`payNative` gross is transaction value, outside calldata. The decoder therefore checks its metadata kind and
minNet; the final web send guard retains its separate transaction value, router, token/amount, deadline, approval,
review-snapshot and session-authority checks. Canonical decoding alone does not authenticate the intended recipient.

The separate #211 asset-coverage UI/disclosure and multichain format changes are not included. Existing v4 scan
checkpoint privacy remains byte-equal; no stale v3 namespace is restored. No dependency, test gate, coverage setting,
workflow, protocol or mainnet-exposure change accompanies these validations.

## Verification and integration

Executed static checks: `git diff --cached --check`, exact-source blob comparisons, retained-base file assertions,
and confirmation that the contracts tree has no changed path. The machine receipt gives the exact counts and hashes.
Independent review is requested for the resulting crypto/custody source rather than inherited source claims.

No unit, coverage, typecheck, lint, browser or anvil suite was executed locally on this tree: the coordinator
paused local test/install workloads after repeated exit 137. Earlier PR #211 test results are provenance only.

Required before promotion: rebuild core-crypto and policy-scheme; run the original policy-scheme coverage suite,
its digest/contract-vector checks, typecheck and lint; run the web policy logic, self-check/send, existing policy
UI tests, typecheck and lint; then exact combined-tree hosted gates. Preserve anvil/forge requirements and report
any skipped contract integration separately. No source branch or remote ref was changed by this worker.
