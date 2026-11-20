# Generation 5: remaining unique-work review

Observed 2026-11-20. Compared source: `3dc86fbc49e919e664230b63dae372ff79430fc5`, tree `e76c03d9dba595ff1171577139c1628c4ad45f5b`. Published #278 head `d74af79ebabdc8cead843361c3497b46d8c421f9` has the same tree. Main is `c977b5d6723f6822c3b5d86cd6b231712c53c395`. These are frozen comparison identities, not claims about a later candidate.

## Result

This pass found two demonstrably missing behaviors in preserved branches: a merchant-ledger status guard and composite-action update discovery. Both were recovered on separate, narrowly owned branches after coordinator authorization. This documentation branch contains neither production change. No further missing Pages runtime behavior was demonstrated in the inspected scope.

Eleven of the original **70 non-ancestor branches with null fresh semantic classifications** received new scoped reviews. The other **59** remain outside this initial matrix; their dated original rows are preserved in [remaining-original-census-rows.json](remaining-original-census-rows.json). The broad recovery branch remains **UNKNOWN as a whole**. This is not a complete semantic fixed point, a blanket release approval, or a replacement for required CI.

## Evidence and method

Read the current handoff, original branch summary and complete compressed branch inventory. Refreshed the eleven individual live heads read-only and repeated that sample before this receipt. All eleven heads, main and #278 were unchanged between the two samples. Every source head and prior status is recorded in [MATRIX.json](MATRIX.json); raw samples are [initial](live-refs-initial.txt) and [final](live-refs-final.txt).

For each branch, computed every best merge base against both targets, inspected right-only commits/patch equivalence, and compared final blobs over the union of all base-to-head changed paths. The computed union exactly matched the preserved path inventory in all eleven cases. [final-blob-comparisons.json.gz](final-blob-comparisons.json.gz) retains every compared path, both full Git blob IDs, all merge bases and `git cherry` output. Patch uniqueness was not treated as missing behavior.

For example, recovery head `38d69832` has four best merge bases with main and a different best base with the selected candidate. A single triple-dot diff is insufficient. Its 657-path union has 434 exact final blobs, but that does not establish equivalence for the remaining paths.

The table's non-documentation category follows the inventory's path heuristic; it is not an execution classification. Executable audit PoCs under `docs/` were checked explicitly. Blob equality proves preserved file content, not a newly executed test pass. No historical branch's complete suite was rerun merely for this matrix.

## Fresh branch matrix

Full forty-character heads, all bases, counts, source PR associations and scope limits are in `MATRIX.json`. Counts below are **all touched paths / exact blobs**, then **non-documentation-category paths / exact blobs**.

| Source branch and head | Counts | Fresh scoped disposition |
| --- | --- | --- |
| `chatgpt/ghostpay-idle-lifecycle-qualified-20261119` — `d5fe06e7` | 21/6; 14/3 | **SUPERSEDED — ARCHIVE** for inspected idle/session behavior; current guards are stronger. |
| `chatgpt/ghostpay-mythril-checker-failclosed-20261118` — `94ca7d5b` | 16/3; 7/3 | **PARTIALLY UNIQUE — EXTRACT** only inherited Dependabot scope; advertised checker and tests are exact. |
| `chatgpt/ghostpay-sonar-review-20261118` — `3a3b136a` | 41/37; 33/33 | **EQUIVALENT — SKIP** touched source; preserve four historical documentation differences. |
| `chatgpt/spec18-recovery-completion-20261118` — `38d69832` | 657/434; 289/199 | **UNKNOWN — INSPECT** whole branch; inspected lean recovery behavior is superseded. |
| `claude/friendly-turing-1ui0on` — `f4e79b07` | 1/0; 0/0 | **SUPERSEDED — ARCHIVE** historical outcome paragraph. |
| `claude/ghostpay-consolidation-9xhtxg-security` — `4894d0d8` | 14/1; 7/1 | **PARTIALLY UNIQUE — EXTRACT** Dependabot maintenance; preserve owner/audit packets. |
| `claude/sharp-bohr-uigfgh` — `c9a8c3d3` | 2/2; 0/0 | **EQUIVALENT — SKIP** both exact handoff files. |
| `integration/ghostpay-idle-session-completion-20261119` — `e2ebb490` | 23/7; 16/4 | **PARTIALLY UNIQUE — EXTRACT** additional test assertions only; inspected production idle behavior is superseded. |
| `integration/ghostpay-mythril-security-closure-20261118` — `ea47fa75` | 55/9; 21/9 | **PARTIALLY UNIQUE — EXTRACT** separately reviewed optional deployment/analyzer tooling; preserve rather than activate. |
| `repair/ghostpay-pr-87-20261119` — `6b07e403` | 73/2; 71/2 | **FUTURE — PRESERVE** unqualified major dependency migration; repaired socket behavior is exact current source. |
| `security/mythril-full-remediation-20261118` — `16c48521` | 34/10; 22/9 | **PARTIALLY UNIQUE — EXTRACT** verified merchant-ledger guard; other scopes remain separate. |

### Verified recovery: merchant-ledger counted-payment guard

Original mixed commit `6db114920589a38dbbb5d52f45bb7a52be98d9b6` contains a small independent correction in `packages/merchant-ledger/src/reconcile.ts`. Candidate and main both have original blob `9e8b5e310e0c445c954e43de3ad712a1a88512b2`: when tolerance is at least the invoice amount, zero counted payments can incorrectly settle a nonzero invoice. The exact upstream guard additionally requires zero due or positive counted payment; fixed blob `5ca846c8e38c4a99343c2cb979f42f8f03883b8a` is preserved unchanged.

The unchanged upstream regression failed on the unchanged runtime: 27 passed/1 failed. Additional boundary controls produced 28 passed/2 failed on baseline. The final original package suite passed 30/30 with statements/functions/lines 100% and branches 99.32%; original thresholds were unchanged. Package typecheck, lint and normal build passed. Zero-due settlement remains valid before/at expiry, while wrong-currency, late, malformed-time and zero-value observations cannot settle a nonzero invoice by tolerance alone.

Separate branch `fix/ghostpay-ledger-zero-payment-20261119` ends at `271a21b0dcd368e90c6293fe66bb0151f8305d67`; exact production extraction is `d694ce1c98056690fd104c08f80e9c7190e779e4`, with Claude authorship and upstream provenance. It includes the narrow R4 status-precedence clarification and durable original test receipts under `generation-5-ledger-fix/`. Independent Generation 6 review separately reproduces and checks the correction.

This is an existing public library correctness defect. The only declared package dependent is CLI, whose current source imports export helpers/types and `LedgerError`, not `reconcile`. No production caller of this reconciliation API was found in the repository; the browser has separate reconciliation code. This receipt does not label it a repaired current browser payment flow.

### Verified recovery: nested composite-action discovery

Original mixed commit `b246782cf7acd5625b5fd97df76ff6be6a5e7678` changes the Actions updater location to `directories: [/, /.github/actions/*]`. Root scanning covers root action manifests and `.github/workflows`; it does not discover arbitrary nested composites as primary update targets. The current GitHub [options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#directories-or-directory) and [file fetcher](https://github.com/dependabot/dependabot-core/blob/main/github_actions/lib/dependabot/github_actions/file_fetcher.rb) corroborate the directory and wildcard semantics. Separate lockfile support-file discovery is not primary update targeting.

The three existing additional targets are `.github/actions/release-verify/action.yml`, `.github/actions/setup-forge/action.yml` and `.github/actions/setup-node-libs/action.yml`. Parsed mappings show this is the sole configuration change; existing weekly Monday cadence, group, limit, prefix and npm entry remain intact. Existing action-pin verification passed all 113 references. No hosted updater run is claimed.

Separate branch `fix/ghostpay-dependabot-composites-20261119` ends at `126b13fb173ea32716af5bf0ba845bbe32d66bab`; focused configuration commit `ed98fde75f7d58f7f34ea6c7816ed95a81a42a07` preserves original authorship. The resulting configuration blob is `604a27d1f04a043461d0dd9adcbcfdf73234e845`. Its full receipt is in that branch's `generation-5-dependabot-fix/` folder.

## Substantive source comparisons and preserved differences

**Idle lifecycle and recovery.** Both idle branches retain the clock/suspension behavior now present. Current `session.ts` prepares and boxes replacement keys before retiring the old wallet, cleans partial allocations, and enforces credential verification. Current `keyVault.ts` and `SellerKeys.tsx` guard exports/recovery after suspension. Current `AppShell.tsx` adds explicit network authority and a before-unload guard for any loaded wallet without a verified external copy. The qualified idle-clock test differs only by a typed input query. Locale files also contain later wording/key changes; no blanket translation-equivalence claim is made.

The integration idle branch has distinct `TagArchive.test.tsx` assertions for exact retained object identity, all mounted inputs being scrubbed, encrypted backup controls and `captureSessionBackupGuard`. Current consolidated tests still exercise scrubbing, suspension and hidden archive access, but these additional assertions should remain preserved for a separate current-fixture qualification. They are additional evidence coverage, not a demonstrated source defect. Its older Pages fixture predates encrypted invoice tampering, explicit receipt-address consent, saved-payment replay and fee review; it must not replace the current fixture wholesale.

**Recovery branch scope.** Inspected `paymentKeyExport.ts` and export components have current per-export cancellation, session-version binding, guarded secret loans, final-handoff expiry checks and retryable encrypted downloads. Current scan cursor/history/privacy sources add active-session checks, saved-observation revalidation, atomic persistence, bounded transport and action-specific authority. Current range/padded adapters check aborts around awaits and budget work before allocation. Invoice handling distinguishes missing signatures from unavailable verification. The independent recovery script now wipes collected chunks on stream failure. These observations support retaining current inspected source; they do not certify all non-EVM, relayer, build/dependency or sweep differences among the 657 paths. Those remain preserved/UNKNOWN where not explicitly reviewed.

**Mythril and optional deployment tooling.** `ea47fa75` contains real distinct source: `DeployPolicy.s.sol` and `pre-deploy-check.sh` bind fee-freeze acknowledgment to chain, token/runtime code, flat fee and recipient; new `DeployPolicyFreezeConfig.t.sol`, `PolicyAccountFactoryFreezeRisk.t.sol` and preflight tests exercise those boundaries. This is optional deployment/policy work. It is not an authorization to enable fees or deploy contracts, nor does it remove all prefunded-counterfactual freeze risk.

That branch's inactive `scripts/contract-analysis/mythril-disposition-check.mjs` additionally requires captured evidence, target-specific analysis identity, source/toolchain closure and stricter duplicate/location handling. Preserve it as a distinct protocol for fresh independent validation; do not treat it as already accepted finding disposition or gate wiring. The configured strict Mythril runner still rejects reported findings. `scripts/tests/setup-forge-integrity.test.mjs` adds separate fixture coverage for an already-present action integrity guard. Workflow runner pinning and path-trigger differences likewise need their own scope; no schedule or gate was changed here.

**Sonar, Claude and socket branches.** Sonar's 33 non-documentation-category blobs and four executable audit PoCs under `docs/` are exact current content. This does not freshly clear Sonar findings. The small Claude branch with two Haiku handoffs is exactly represented; the friendly-turing paragraph is historical. The independent bounded Claude review is preserved in [claude-candidate-review.json.gz](claude-candidate-review.json.gz).

The PR #87 repair's `packages/net-harness/src/socks5Server.ts` and `harness.test.ts` exactly match current source. Its remaining 69 source-category differences are 68 manifests and the lockfile. Its own dated handoff records the broader compiler/API migration as unqualified; this pass did not rerun that dependency graph or assume the old blocker still fully explains current compatibility. Preserve the original migration, do not reapply an already retained socket fix.

Finally, `security/mythril-full-remediation` has an additional `@security` warning in `packages/ux-flow/src/reconcile.ts` about unauthenticated proof/payer binding. The runtime function is identical; the warning and rejected ambiguity-only approach remain source-pinned design evidence. No new exploit reproduction or completed payer-binding fix is claimed. Current RPC additionally handles non-finite retry values, so the older adapter file must not replace it.

## Handoff

Root owns integration, fresh combined qualification and publication. This lane made no remote mutation. Preserve original source refs, historical evidence and the listed future/tooling/test candidates. A next bounded pass can inspect the remaining 59 original rows; it must refresh their heads, keep broad unresolved scopes UNKNOWN and report a concrete missing behavior before any further production edit.

## Subsequent bounded checkpoint

The same worker continued across the other 59 sampled heads after this initial receipt. See [CONTINUATION.md](CONTINUATION.md) for fresh source/lock comparisons, path-only preservation decisions and explicitly unresolved scopes. The initial matrix above remains an immutable account of its original scope.
