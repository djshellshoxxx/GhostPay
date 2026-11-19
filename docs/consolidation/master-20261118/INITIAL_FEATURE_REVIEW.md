# GhostPay independent application, custody and privacy review

## Reviewed identities

| Scope | Commit | Tree |
| --- | --- | --- |
| Starting main | `dfc75ef2087fa6463ae59e0818abec01796c578d` | `21929503cbb7ee6186cfbfc4b278815387d35d66` |
| Pages candidate #238 | `198aa5baff22272453733a0f3dcfcac0e0994eec` | `e86585f8fe9ae904cbd62802147c0804a48d9a2f` |
| Recovery #239 | `4a1b181c89e02ee564b5568d4b4b8d689f5e42c5` | `bd4eac2eae1a93530c1b7c307d0b42b3252c4941` |
| Recovery #240 | `38d69832ddc58ec27a19c00dbe3c89347c577495` | `d959e5bea2fb8cae9a8847229e1c0f1b14e833ad` |
| Network boundaries #241 | `e8857bfa1ec93fafa9ff83f63f7430ef26a362c2` | `837fa8d51c3bf632cb5b56cba654e1a420213651` |
| Pinned invoice signer #234 | `5e9e7be70399a9818579cf87bd494e013e25d4f9` | `c9c773efd95e0799cf2219bd2f8cab9d44c9648d` |

This review used actual source, Git ancestry, tree/blob identities, diffs and regression assertions. It followed
AGENTS.md, CLAUDE.md, docs/ai/WORKFLOW.md and the repository security-invariant references. No local application
test suite was executed by this reviewer. Exact-head CI and repository requirements are separately owned by
the CI reviewer and coordinator. Review is AI-assisted, not an external audit or production release qualification.

## PR #241: independently mergeable scope

No blocking source defect was found in the five changed runtime modules at the pinned head. The change can be
qualified independently of the broader Pages candidate. It changes no contracts, key handling, dependencies or
workflow policy. Its complete-tree qualification must still be established by the CI reviewer before promotion.

| Module | Reviewed behavior |
| --- | --- |
| `apps/web/src/lib/release.ts` | Same-origin startup hashing rejects redirects and foreign final URLs; caps received bytes and the total operation; omits credentials, referrer and cache; disposes late response bodies and neutralizes custom cleanup errors. The trusted frontend host remains a limitation. |
| `packages/net-transport/src/fetchTransport.ts` | Validates timeout and size limits; enforces an independent deadline even when fetch or body readers ignore abort; cancels without awaiting untrusted cleanup; preserves only request-local error identities; no transport fallback or automatic retry is introduced. |
| `packages/net-transport/src/fetchAdapter.ts` | Honors Request method and signal inheritance; already-aborted requests do not dispatch; later cancellation rejects the result. The underlying RpcTransport has no caller-signal interface, so cancellation cannot recall already dispatched bytes; this is documented. |
| `packages/solana-stealth/src/rpc.ts` | Selected URL remains fixed; abort/deadline covers fetch and streamed reads; late bodies are cancelled; errors are reminted from fixed codes; valid query configuration is preserved while fragments/userinfo are refused. |
| `packages/tron-adapter/src/rpc.ts` | Applies equivalent bounded reads and fixed errors; rejects ambiguous base URL credentials/query/fragment; includes IPv6 loopback support; no direct-provider fallback appears. |

Regression source includes non-cooperative fetch/reader deadlines, stalled cancellation, overflow, exact-cap and
split UTF-8, imported error objects with sensitive fields, late results, real redirects to a second controlled
server, startup hashing, and request signal/method behavior. The native probe script is source-matched through
compilation of leaf modules and records hashes. Its prior execution is not reasserted as this reviewer's run.

The claim is scoped transport/startup hardening. Universal private-path policy, cached clients across every
transport, stale/cross-tab settings, Esplora/indexer/relayer cancellation and combined browser acceptance remain
separate work. The existing #241 handoff makes those boundaries explicit.

## PR #234: strict signer policy

No blocking source defect was found at the pinned head. The strict option is additive: absent/false preserves
the review result; other untyped values cannot silently disable the requested policy. The parser rejects an
invalid signature before evaluating pin membership. A valid self-signature with no matching out-of-band pin is
rejected, including empty/missing pin sets. Errors are static and disclose no invoice material.

Both parseFragment and openFragment converge on the finish policy after successful decoding/decryption.
Passphrase headers remain an explicitly unauthenticated needsPassphrase result. Tests cover plaintext,
encrypted and passphrase formats, uppercase pins, changed payees/signers, impostors, missing pins, malformed
untyped flags, wrong passwords, and earlier schema/decryption failure precedence. The patch changes no
cryptographic primitive or invoice format. UI trust still depends on how the caller obtained its pin.

## Existing Pages candidate and privacy ancestry

Actual ancestor checks establish that #238 already contains #213, #229, #222, #228, #230, #231 and #233.
Those branch heads should not be reapplied as duplicate implementations. Their final combined behavior still
needs successful candidate qualification; ancestry itself proves no test pass.

The current-source own-node guard checks policy on each defaultServices RPC dispatch, including requests
from previously cached clients. Sweep consent, session-only destination warnings and browser privacy fixtures
are present in candidate ancestry. PR #241 is separate from this candidate and can be integrated without
replacing those implementations. Broader universal egress completion is not inferred from these facts.

## Recovery: neither #239 nor #240 supersedes the other

Both heads add six commits to #238, with different trees. The codec, paymentKeyExport.ts and
StealthExportCommon.tsx have identical blobs at both heads. The source receipt records these identities.
The useful differences are in custody failure paths, verification state, raw file handling and regression coverage.

Choosing #240 wholesale would lose the following useful #239 work:

- Atomic session replacement: prepare all new boxes before disposing the old wallet; failures preserve its
  keys, custody and revision; partial new boxes are disposed.
- Retained generated ciphertext and a retry action after a blocked encrypted-file download, avoiding a second
  re-authentication/derivation cycle and preserving truthful generated/downloaded/retained/verified states.
- Clearing stale verification success when the saved-backup passphrase changes.
- Real-crypto verification observers that wait for the actual verification operation before assertions.
- Finally-based wiping of already-received piped passphrase chunks when input throws, plus its regression.

Choosing #239 unchanged would omit useful #240 protections:

- File.text() strips a UTF-8 BOM, so identical decoded text can represent different raw bytes. Recovery and
  saved-file verification need raw size checks to avoid certifying a file the strict independent decoder refuses.
- The unload prompt must examine current external-copy status. A cached local-vault summary can survive another
  tab deleting that vault; conversely, external-copy verification need not change the React backup summary.
- Fresh consent cancellation/retry, keyboard recovery verification and corresponding browser reload behavior.

The selected reconciliation therefore starts with #239 and ports only the latter protections with provenance.
It preserves independent recovery, consent binding, session cancellation, per-key export, code-account refusal,
secret-buffer cleanup and the existing distinction between a full seller keystore and a master/payment backup.

## Implementation produced after review

At the coordinator's request, the reviewer then authored an isolated reconciliation on local branch
`integration/ghostpay-recovery-reconciled-20261118`, based on intact #239. Ownership claim `08f541a2` precedes
the implementation `b0fba272`. No remote branch was changed by this worker.
The final local head is `349b51e99f7fdae0ee61343d66bc95ba18de6f26`; its follow-up removes only a trailing blank
line in the ownership claim. The complete diff from #239 to this final head passes `git diff --check`.

The implementation touches three runtime files: AppShell.tsx, StealthExportRecovery.tsx and
StealthExportVerification.tsx. Focused unit/browser regressions and a handoff accompany it. Eight retained
source/test files were asserted byte-identical to #239, including session atomicity, failed-download regression,
independent decoder pipe cleanup and the codec. Source hashes are in the committed JSON receipt.

Executed checks at that checkpoint:

- `git diff --check`: passed.
- Native File.text BOM mechanism with Node v24.22.3: 39 raw bytes decode to the original 36-character ASCII
  string; the raw-size predicate rejects it. This verifies the mechanism, not a React/browser-suite pass.
- Byte preservation assertions for eight #239 source/test files: passed.

Unit tests, typecheck, lint and browser runs remain unexecuted by this worker because the coordinator's
dependency installations terminated with exit 137. Partial node_modules is not a usable installation claim.
The author cannot independently approve the reconciliation; coordinator/another reviewer must review the
combined result and qualify its exact commit. Earlier isolated #239/#240 evidence cannot substitute for that.

## Required integration order and checks

1. Qualify and promote the focused #241 boundary changes independently when current-main and exact-tree CI
   permit it; do not couple them to unresolved broader recovery/security work.
2. Keep #238's existing recovery/privacy ancestry. Merge the intact #239 lineage and the selective reconciliation.
3. Add the current-main #241 lineage without reverting own-node, Sweep or scan privacy controls.
4. Run focused recovery, session atomicity, beforeunload, privacy and transport suites, then full/lean browsers,
   complete workspace qualification and the unchanged security gates on the actual combined source.
5. Preserve every original historical/feature branch. Mark #239 and #240 dispositions as reconciled only when
   destination commit and passing combined evidence exist. They are not patch-equivalent as complete branches.

No conclusion here authorizes bypassing a failed analyzer, repository requirement or unresolved release decision.
