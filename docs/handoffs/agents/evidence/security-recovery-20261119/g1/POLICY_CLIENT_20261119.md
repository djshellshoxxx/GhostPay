# Policy client validation recovery — 2026-11-19

## Scope and provenance

This is a selective recovery of the completed policy client work in draft PR
[#211](https://github.com/djshellshoxxx/GhostPay/pull/211), whose inspected head was
`a92658b1ef6b95ff0145b2e1933d0047d51289d5`. The isolated recovery branch is
`chatgpt/ghostpay-policy-client-20261119`, based on coordinator commit
`0249b30c7c6c3bfeda45287f41d92f8d2152c96c`.

The original PR and other workspaces are read-only inputs. Current dependency
versions are retained. The scope is the policy library, the existing experimental
policy payment UI, seven required locale/security keys, and the policy API guide.
The contract ABI, EIP-712 domain/type strings and hash constants, policy authority,
feature flag, numerical withdrawal-delay presets and release gates are unchanged.

| Recovery | Historical source commits | Behavior |
|---|---|---|
| N09/N10 calldata, proof and signing checks | `0c0bbaa2`, `6e27f497`, `86fa1fef`, `ba877c31`, `16133082`, `818aa34f`, `ca2c6b75` | Canonical payment calldata; valid ephemeral key; consistent metadata; recomputed token-limit leaf; policy-only typed data reconstructed from one read; viewing-secret copy created only after argument validation and wiped on subsequent exits. |
| N11 final payment binding | `0dab0db4`, `60f44acd` | Preparation and the synchronous final wallet gate bind the ephemeral key and metadata/view tag to the derivation as well as the existing account, owner, policy, token and amount checks. The swapped-token/gross fixtures remain internally consistent, so they test the intended final gate. |
| SEC11 / N01 asset coverage and delay explanation | `46ab81d2`, `00f9134b`, `1f5c2d73`, `b542c839` | Rebuild and prove a token leaf against the policy root; show withdrawable assets; block a known unsupported asset before any wallet request; show uncertainty when the record is unavailable; recheck a record imported after review. The existing delay choices are explained without setting a new chain-specific minimum. |

## Security boundaries

The decoder establishes internal consistency. It cannot authenticate a completely
substituted payee, a router address or the native `msg.value`; the UI retains its
own derivation and transaction checks. Signing reconstructs a known policy
message and signs only its recomputed digest. It validates field types, while the
builders and caller remain responsible for the intended message values.

A scheme-2 meta-address contains a policy hash, not the token-limit preimage.
Coverage therefore remains unknown unless a verified matching policy record is
loaded. A matching record is checked against a rebuilt limits tree. An asset
absent from a nonzero limits root remains permanently unwithdrawable under the
current contract; this recovery prevents a known bad payment, without inventing
recovery authority.

The seven locale additions are copied exactly from #211. Its Spanish, Japanese
and Arabic entries intentionally retain English source text in their existing
draft catalogs. No translation-review status or unrelated locale key is changed.
The API documentation describes the actual `PolicyRef{owner, policyHash}` ABI
and its existing public policy-hash disclosure; the ABI/privacy decision remains
open.

## Regression evidence

Evidence logs are under `/workspace/scratch/6eafdb04d91b/security-evidence/`.
Every baseline ran with the new regression tests and without that stage's runtime
fix. All test budgets, assertions and configured coverage thresholds are retained.

| Stage | Baseline | Recovered behavior |
|---|---|---|
| Library validators and typed-data snapshots | `policy-client-red.log`: 14 failed, 31 passed | `policy-client-library-green.log`: 45 passed |
| Payment preparation and final send binding | `policy-client-send-red.log`: 4 failed, 39 passed | `policy-client-send-green.log`: 43 passed |
| Record/token coverage helper | `policy-client-coverage-library-red.log`: 5 failed, 35 passed | Included in the 118-test full package pass |
| Asset coverage logic and UI | `policy-client-coverage-web-red.log`: 6 failed, 28 passed | Included in the 121-test affected-web pass |

The first complete package attempt passed 117 of 118 tests. The existing Anvil
fixture intentionally built a token withdrawal with a native proof; the hardened
builder now correctly refuses it earlier. The test-only follow-up asserts that
new refusal, explicitly constructs the adversarial policy message with viem's
`hashStruct`/`hashTypedData`, signs through the hardened signer with
`expectedOwner`, and preserves the encoder rejection and mined transaction
revert. It also asserts the exact on-chain `LimitLeafMismatch` error. No runtime
bypass or assertion removal was used to make the test pass.

Final qualification:

- Full policy package: **118/118 passed**, including all seven Anvil cases, the
  existing typed-data vectors and adversarial getter tests. `REQUIRE_ANVIL=1`
  prevents silent native-test skips. Statement/branch/function/line coverage is
  **97.38% / 95.84% / 100% / 99.57%**, above the unchanged thresholds. Log:
  `policy-client-library-full-green.log`.
- Native cross-checks reuse the already compiled core artifacts from the
  deployment-policy worktree; contract sources are unchanged. Anvil is
  **1.8.5**, commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`; the artifacts
  were built with solc **0.8.28+commit.7893614a**.
- Focused web/security-key selection: **121/121 passed in nine suites**,
  covering preparation, sending, coverage, existing policy views/guards and the
  creation callback. Log: `policy-client-web-green.log`. This is scoped evidence,
  not a claim that the full web suite or its global coverage gate ran.
- Library typecheck and build passed. Locale checks report **zero errors** and
  **zero missing keys**; 521 draft/length warnings and 139 unused keys are
  reported without suppressions. Secret scan and `git diff --check` passed.
- The complete policy library source and the ten changed web/security-key source
  and test files pass scoped ESLint checks.

Node **24.22.3** and Vitest **5.1.0** are the existing workspace versions. Heavy
checks use one worker, a 768-MiB Node old-space cap and the shared qualification
mutex. No test timeout, fuzz budget or coverage threshold was reduced. No hosted
CI or complete repository qualification is claimed for this local recovery.

## Independent review

The coordinator independently reviewed the N09/N10 source diff (`derive.ts`,
`limits.ts`, `eip712.ts`, `router.ts`) and found no blocking issue: argument checks
precede the secret copy, calldata/point/metadata validation fails closed, leaf
recomputation binds token/limit/window, and signing uses the reconstructed digest
after taking its snapshot while keeping existing domain/typehash constants.
The final full selection includes the typed-data vectors and tampered-getter
tests. The coordinator also independently reviewed the new Anvil fixture and
confirmed that its client and exact contract refusal assertions were preserved.

N11 and SEC11 source review also passed: the derived payment binds R, metadata
and view tag at preparation and the final pre-wallet gate; coverage rebuilds
canonical leaves/root and proves the asset; newly loaded records are rechecked
before wallet requests; known uncovered assets are blocked and unknown coverage
is stated. The additive locale changes preserve existing messages. A payer
holding only the meta-address still cannot cryptographically determine accepted
assets. This is the existing client mitigation, **not full protocol-level SEC11
closure**.

## Related release blockers

This work does not change the strict Mythril gate. The independently extracted
current report at commit `198aa5ba` still fails with eleven findings. The
machine-readable per-finding review is a separate observational artifact,
`security-evidence/mythril-198aa5ba-dispositions.json`, including fresh concrete
trace replay and exact trace/source hashes; it authorizes no suppression.
Fee-token freeze policy (N1), chain-specific reaction-window assumptions (OD11),
policy-hash ABI/privacy choice, and destination/typehash changes remain owner
decisions. No production deployment or real-funds qualification is implied.
