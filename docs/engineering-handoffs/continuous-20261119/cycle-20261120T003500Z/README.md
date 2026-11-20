# Bounded GhostPay continuation — November 19, 2026 (America/Vancouver)

Cycle: `20261120T003500Z`. Coordinator: native ChatGPT `/root`, workspace
`fc8b0b472d30`. Target: the existing static, non-custodial Pages browser beta.

**Outcome: one QR input-boundary repair implemented and independently verified;
the two priority fixes qualified against their real repository tests; concurrent
duplicate work reconciled. Hosted qualification and shared integration remain
blocked/pending. No deployment or release occurred.**

## Source identities and ownership

- Main at discovery and the recorded refresh: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Canonical candidate: [PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278),
  `d74af79ebabdc8cead843361c3497b46d8c421f9`.
- This cycle's minimal stacked source: [PR #290](https://github.com/djshellshoxxx/GhostPay/pull/290),
  final head `ec546311f994fe1db544fe85ff2aa6db428d67d4`, tree
  `9c5df12a4621384323af1f4d51b1b04e37d62d3c`.
- Independently tested local final source: `53503b41e1b459e389b8b2d2696631a47bc2298c`.
  A fresh Git fetch and whole-tree comparison confirmed identical source trees.
- Production repair commit: `23f792518c0358dc066f4c97211e9bd5454befe6`.
  Test-first checkpoint: `455e9c496fb9b0bb1cf7e9f835d9d6dafae295b1`.
- Source branch: `automation/20261120T003500Z/coordinator/qr-runtime-qualification`.
- Evidence branch: `automation/20261120T003500Z/coordinator/qualification-evidence`.
  Evidence-only updates do not restart the frozen source PR's active checks.

[PUBLICATION_MAP.json](PUBLICATION_MAP.json) records every local/published commit
pair and matching tree. Direct Git push lacked credentials. The authorized
connector used expected-head, non-force updates; each reconstructed tree was
checked before publication. No credential retrieval or permission bypass occurred.

The lock was initially released at generation 4. Its refreshed immutable state at
`2f56e26f56db57d0d4cabf646d8e0843ccb8d1e3` is **held, generation 5**, by
`20261119-continuous-followup-0a7bc3583588-root`. This cycle never acquired,
renewed, released or changed it. Shared integration belongs to that coordinator.

## Actual engineering and scoped audit

`qrKindClass` and `kindForPayload` previously checked own properties before
establishing that their runtime key was a primitive string. Arrays, boxed strings
and objects could be accepted through property-name conversion; a stateful
conversion could supply different names during validation and lookup.

The production change adds two short-circuit `typeof` guards before property
access. Existing TypeError messages, all valid mappings, secret/bearer precedence,
warning rules and print policy remain unchanged. Files changed in the source PR:

- `apps/web/src/lib/qrKinds.ts`: runtime guards and explanatory comment.
- `apps/web/src/lib/qrKinds.test.ts`: malformed-key, conversion, getter,
  error-class and valid-mapping regressions.
- `docs/design/qr-colors.md`: source-backed runtime contract.
- `docs/ai/ACTIVE_WORK.md`: task ownership recorded before implementation.

Severity is **low API correctness**, confidence high. Current call sites supply
internal literal kinds; no externally reachable exploit or fund-loss path was
demonstrated. The finding is repaired and independently verified, not merged.
The independent [QR review](qr-review/REVIEW.md) records exact file blobs,
reproduction, scope, practical limits, repair owner and verification state.

No additional base64url production defect was found. Its guard preserves
`Base64UrlError`, the fixed error code/message and valid byte output. The independent
[base64 review](base64-review/REVIEW.md) provides the original-regression replay,
adversarial controls and full package qualification.

Existing Mythril and external-security release requirements remain open. This
cycle changed no contract or analyzer gate, and did not rerun Mythril or claim
third-party security clearance.

## Concurrent work reconciled without duplicate runtime integration

[PR #291](https://github.com/djshellshoxxx/GhostPay/pull/291) appeared during the
cycle at `17333ceda784ecdf5734a666ef57ee1d1e599296`, based on #285. Its runtime
is identical to #290 after ignoring one comment. Its distinct getter, complete
mapping, explicit error-class and extra primitive-input controls were selectively
retained in #290, with upstream SHA and test-blob provenance in commits
`41580cc98571f85414ea76ea356c5baff3e94476` and
`ec546311f994fe1db544fe85ff2aa6db428d67d4`.

The final reviewer confirmed that #290's existing assertions remain intact and
that the extracted tests retain #291's useful semantics. **Integrate the guard
once, using the canonical-baseline #290 candidate after all gates pass.** Preserve
#291 and its independent evidence; do not wholesale replace the final test file
or separately merge its equivalent runtime. Neither PR was closed or deleted.
Creation timestamps establish publication order only, not which investigation
began first. See [the comparison](ci-review/REVIEW.md).

The requested earlier candidates are already represented in #278:

| Candidate | Verified representation at `d74af79e` |
| --- | --- |
| #258, #268, #274, #279 | Original heads are ancestors; runtime and test blobs match. |
| #265 | Original ancestry retained; stronger descriptor validation and additional regression/lint repairs are present. |
| #261 | Both non-documentation files were extracted byte-for-byte; metadata control ref was not merged. |
| #280, #281, #282, #285 | Production and test blobs were extracted identically. |
| #289 | Production blob identical; the only test difference removes the unused `_index` parameter. |

None of these original heads is an ancestor of the observed main. No additional
product integration into #278 is necessary for these already retained fixes.
The comparison is bounded to these candidates; it is not a new semantic audit of
every repository branch. Detailed identities are in [CI/source evidence](ci-review/evidence.json).

## Verification actually executed

Environment: Linux, Node 22.23.4, npm 10.9.11, locked Vitest/coverage 5.1.0,
TypeScript 5.9.3 and ESLint 10.15.0. A clean offline `npm ci --ignore-scripts`
installed 721 packages without changing the lockfile. No paid model/API or Codex
job was invoked. Original test thresholds and configuration remained unchanged.

| Check | Result and exact scope |
| --- | --- |
| Initial QR test-first replay | 10 failed / 29 passed on original runtime; 39/39 passed after repair. |
| Final independent QR replay | Final 53-test taxonomy selection: 13 expected failures / 40 passes with the old runtime, then all pass with the fixed runtime. |
| Final original QR consumer suites | **133/133 passed**, eight files, no skips; includes the 53 taxonomy tests. Full web typecheck and changed-file typed lint pass on local final `53503b41`. |
| Independent QR direct-module probe | 144 valid payload/flag controls, six valid frame controls, 87 malformed rejection assertions and seven hook/proxy cases with zero hook invocation; runtime unchanged through final source. |
| Original #289 committed regression | Actual repository Vitest: original decoder 1 failed / 4 passed; fixed decoder 5/5 passed. |
| Independent base64url probe | Baseline 21 failed / 4 passed; fixed 25/25 passed, including runtime traps, malformed text and 513 deterministic byte comparisons. |
| Full invoice package | **804/804 tests**, 14 files, no skips; coverage 98.07% statements, 97.6% branches, 100% functions, 99.29% lines. Typecheck, full typed lint and build passed. Package tree is unchanged from `d74af79e`. |
| Workspace libraries | All 65 rebuilt successfully with the existing script. |
| Web checks | Full web typecheck and full ESLint passed on `c70321e1`; after test-only consolidation, the final reviewer repeated full typecheck and changed-file lint. |
| Full web build and bundle scan | Passed; bundle scanner checked 19 files. |
| Pages tooling | **112/112 passed**, no failures or skips. |
| Payments-disabled Pages build | Passed; 16 static files independently verified by the unchanged builder. No manifest/signing key supplied; no chain enabled; nothing published. |
| Secrets/action policy scripts | Both passed. |
| Local Playwright | **Blocked before browser assertions.** First attempt lacked the configured browser. A documented installed-browser override reached Chromium, which aborted on `socket() ... Operation not permitted`. Zero browser scenarios passed; seven did not run. No retry followed that access failure. |

Counts overlap and must not be summed. The full invoice suite, final QR suite and
standalone probes are different scopes, not a claim of whole-product completion.
See [root command receipts](root/RECEIPTS.json), [final QR receipt](qr-review/FINAL_RECEIPT.json)
and the independent reports. Raw logs are retained, including failures.

The local static artifact records its actual build source `c70321e1`. Final
changes after that build affect only regression tests; the production blob is
unchanged. This is not a deployed artifact or an exact-final-commit release asset.

## Exact-head hosted qualification and existing owner repairs

Original #289 `856b2d60` actually ran repository Vitest 5.0.5: **729 invoice tests
passed**, including five base64url tests. Its [core CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965189)
fails the unused test parameter; #278 already repairs that diagnostic. Its four
other workflows succeeded. Original #285 `89942105` has all five workflows
successful, including 13 QR tests, 2,808 web coverage tests with one skip, and
three separate nocov tests. Synthetic checkout trees were verified equal to their
respective PR-head trees; earlier standalone-only limitations are now resolved
for those specific executed scopes.

At final source #290 `ec546311`, five applicable workflows were observed
queued/pending; **no success is inferred**. The current links are:

- [CI 44649231040](https://github.com/djshellshoxxx/GhostPay/actions/runs/44649231040)
- [Pages 44649231026](https://github.com/djshellshoxxx/GhostPay/actions/runs/44649231026)
- [Beta acceptance 44649231132](https://github.com/djshellshoxxx/GhostPay/actions/runs/44649231132)
- [Hosting 44649231031](https://github.com/djshellshoxxx/GhostPay/actions/runs/44649231031)
- [CLI qualification 44649231168](https://github.com/djshellshoxxx/GhostPay/actions/runs/44649231168)

These workflows support a stacked PR base. QR-only paths do not trigger the
separate Integration/Contract-analysis workflows; their absence is not described
as a pass. Snyk's reported status is recorded separately in [SNAPSHOT.json](SNAPSHOT.json).

Parent #278's [CI 44643709383](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383)
has three substantive failures and a failed aggregate: the same network-authority
scenario in both browser profiles, and one `Pay.signer.test.tsx` assertion. The
web run reports 3,849 passed, one failed and one skipped; its chained nocov pass
did not run. Other 20 jobs passed. Earlier cached workflow summaries temporarily
reported queued despite terminal jobs; the terminal response and logs are retained
in the CI review rather than interpreting that cache inconsistency as a rerun.

The active integration owner already has separate fixes: browser follow-up
`89e163fcc24f72830c0a5876486a72178a9365e7` and signer-fixture follow-up
`f2b991f7eb2c843e96bb533729d71b6a537b9293`. Their source and local owner receipts
were observed; this cycle did not edit, publish, integrate or re-qualify those
branches. Preserve their ownership and obtain fresh hosted results when that
coordinator publishes its combined candidate.

## Tracking, documentation and remaining blockers

The requested `docs/automation/*.md` records exist on preserved PR #261 but are
absent from #278. Their historical statuses were read, not copied over current
evidence. This cycle extends the existing continuous `TASK_LEDGER.json`, README
and handoff index on an **isolated evidence proposal**. It creates no competing
live ledger and does not update the shared integration branch.

| Maintenance area | Current record |
| --- | --- |
| Master status / cycle history | This source-pinned handoff and `SNAPSHOT.json`. |
| Branch inventory / merge queue | Candidate table and `ci-review/evidence.json`; #290/#291 duplication explicitly resolved. |
| Feature backlog / missing implementations | Existing generation-3 completeness assessment retained. No new required feature gap was established in this bounded slice; whole-product completion is not asserted. |
| Security findings / bug backlog | QR finding above, independent reviews, existing open Mythril/external gates, and owner-held browser/signer repairs. |
| Worker handoffs | `/root/base64_review`, `/root/qr_security_review` and `/root/ci_reconcile` reports in this directory. |

Wiki Home and Sidebar still prominently link separate User Guide and Developer
Guide sections. All 27 relative file links in Home, Sidebar and both guides resolve.
Existing Wiki owner #215 is preserved; no live Wiki publication or external-link/
anchor verification is claimed. The source-backed QR design document was updated.

Required remaining gates: final-head hosted checks; current canonical-owner
integration and deduplication; readable required protection/review policy (connector
returned 403 for branch protection); valid lock ownership; existing security and
external-review clearance; owner-controlled origin, approved manifests and real
wallet/testnet acceptance. No source change waives any of those requirements.

## Next bounded invocation

1. Refresh main, #278, #290, #291 and the lock. Read this cycle and any newer owner
   handoff before claiming files.
2. Inspect the final #290 workflow results, including the actual checkout SHA/tree.
   Diagnose source failures; retain environmental failures without blind retries.
3. Let the active integration owner publish and qualify its browser/signer fixes.
   Preserve #290's regression superset and apply the QR runtime guard only once.
4. Keep unresolved Mythril/security and deployment gates separate from local code
   qualification. Merge only with every required gate and valid lock ownership.

Actual concurrency peaked at four: one coordinator and three native workers.
Workers completed their assigned phases; no persistent agent loop or schedule was
created, changed or represented as continuously running. No main/shared-branch
merge, source deletion, force-push, release, deployment or fund transaction occurred.
