# Hosted qualification follow-up — 2026-11-20 UTC

**BLOCKED — WITH PRECISE REMAINING REQUIREMENTS.** This bounded read-only follow-up observes newly completed hosted checks for [PR #292](https://github.com/djshellshoxxx/GhostPay/pull/292), preserves the now-terminal web failure on its canonical base, and leaves incomplete security and release gates outstanding. It neither changes the frozen PR head nor duplicates the continuous coordinator's active fixes.

Observation window: 00:50–00:58 UTC on 2026-11-20; final API snapshot at **00:58:06 UTC**. The following values describe that snapshot, not subsequent repository changes.

## Exact sources

| Item | Verified value |
| --- | --- |
| Live main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Canonical PR #278 | `release/ghostpay-beta-qualification-20261119` at `d74af79ebabdc8cead843361c3497b46d8c421f9` |
| Scoped PR #292 | `fix/ghostpay-pages-integrity-gate-20261120` at `814950a1cf99e68765b85f241e6f4a0fc55ea9c6`, targeting PR #278's branch |
| PR #292 synthetic merge | `4b44077fe0ef783f27c390d75472f338266fa410` |
| Tree shared by PR #292 head and merge | `d58874e0d4bfaace14abec3a41cbbff17d755707` |
| Evidence-only branch | `review/ghostpay-hosted-followup-20261120`, based on published PR #292 head; additive ownership claim `ea989a39` |

The GitHub Git-commit endpoints for the head and synthetic merge returned the same tree. The completed Pages Anvil and Integration logs independently show checkout of `4b44077fe0ef783f27c390d75472f338266fa410`. Their checks are associated with head `814950a1cf99e68765b85f241e6f4a0fc55ea9c6`. No result is relabelled as a test of main or of the other coordinator's unpublished successor.

The main-branch API response reports `protected: false`, protection disabled and required-status-check enforcement `off` with empty contexts/checks. A complete repository ruleset inventory was not retrieved. This observation does not relax the user's or repository's independent-review, security, CI and approved-integration requirements.

## PR #292 hosted results

The exact-head check response contained **32 checks: five successful, 25 queued, one in progress and one skipped**. It contained no failed or cancelled check at this observation. This is incomplete qualification. The six workflow records still reported queued status except Integration, which completed successfully; individual check records give the more specific progress below.

| Workflow | Exact run | Observed result |
| --- | --- | --- |
| CI | [44648916840](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916840) | Change classification passed; security, build, unit, contract, lint, typecheck and browser jobs queued |
| Pages | [44648916609](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916609) | Anvil browser acceptance passed; standalone site build queued; publish-only release-gates job skipped |
| Beta acceptance | [44648916495](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916495) | Queued |
| Integration | [44648916484](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916484) | Success |
| CLI qualification | [44648916722](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916722) | Ubuntu passed; Windows running; macOS queued |
| Hosting kit | [44648916459](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916459) | `qualify-ghostpay-web` passed; `kit` queued |

### Direct evidence for the new artifact promotion gate

[Pages Anvil job 135998569362](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916609/job/135998569362) completed all **16 tests with zero failures**. Its retained log shows the newly wired independent verifier executing before serving the test artifact:

```text
Pages site verified: 16 files; DEVELOPMENT BUILD (not release evidence): TESTNET: payments enabled only on the listed testnet chains
Pages artifact verified: 16 files match trusted SHA256SUMS.
Running 16 tests using 1 worker
16 passed (1.6m)
```

This is local-chain development acceptance. It confirms the new build gate executes in a real hosted build and passes the real generated artifact. It does not qualify a payments-disabled release artifact, a published site, an isolated production origin, or an external testnet.

[Integration job 135998569303](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916484/job/135998569303) also passed. Its actual log records seller key generation and signed invoices, four matched announcements, on-chain native receipt verification with inflated claims rejected, and script-side encrypted backup/restore with wrong-password and swapped-identifier rejection. Three unregistered-token claims remain unverified as required by that fixture. The final reported test suite passed five cases. The complete log is retained; this is existing local development-chain integration, not a claim that every browser or external-testnet acceptance requirement ran.

The other successful checks were Ubuntu CLI, Hosting kit's `qualify-ghostpay-web`, and CI change classification. Their terminal statuses were observed through GitHub; this follow-up did not separately replay or inspect all of those logs.

### CodeQL and contract-analysis availability

No CodeQL check appears in the 32-check response and no CodeQL workflow appears in the six exact-head workflow records. No fresh CodeQL clearance is claimed. Whether the repository's default setup will later schedule analysis for this stacked PR was not inferred from the absence of a run. The canonical combined candidate still needs its required current security analysis.

The Contract analysis workflow did not appear for PR #292. Its `pull_request.paths` filter covers contract/analyzer/workflow paths, and the five non-documentation files changed by PR #292 are outside those patterns. No contract analyzer configuration changed. This explains the workflow's absence from this scoped PR; it does not waive strict analysis on the final release candidate.

## Canonical d74 qualification: newly terminal failure

The canonical [CI run 44643709383](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383) completed with **20 successful jobs and four failed jobs**. The failed jobs are the web test shard, lean browser suite, full browser suite and dependent TypeScript aggregate. The actual `ts-typecheck`, `ts-lint`, build/guards, contract aggregate and all non-web test shards passed; in particular, previously pending `ts-test (rest-2)` is now successful.

| Job | Actual outcome | Disposition |
| --- | --- | --- |
| [Web 135981023399](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383/job/135981023399) | 3,849 passed, one failed, one skipped | Selected-seller signer fixture reads Continue before the manifest-dependent control has rendered |
| [Lean browser 135981022990](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383/job/135981022990) | 115 passed, one failed, five skipped | Previously recorded invoice-replacement preflight observation failure; actively owned repair |
| [Full browser 135981023128](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383/job/135981023128) | 128 passed, one failed, two skipped | Same owned observation boundary |
| [TypeScript aggregate 135995823033](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383/job/135995823033) | Failure | Dependency on failed web shard; not a TypeScript compiler failure |

The new web failure is precisely `invoice signer verification lifecycle > compares only the selected seller even when both distinct seller keys are saved`, at the immediate `getByRole('button', { name: 'Continue' })` assertion in `apps/web/src/views/Pay.signer.test.tsx`. The log reports that the button is not yet accessible. The first coverage command fails, so the subsequent `vitest run --config vitest.nocov.config.ts` after `&&` is **not executed**. This run is not full web qualification.

### Existing ownership and reviewed corrections

Before proposing any repair, this worker checked the concurrent coordinator's active claims and local review evidence. That coordinator already owns both failing test paths and the canonical integration lease. No additional implementation or branch competing with those repairs was created.

- Signer correction `f2b991f7eb2c843e96bb533729d71b6a537b9293` awaits the Continue control using `findByRole`, retains `disabled === true`, reasserts the mismatch, and retains zero RPC/wallet assertions. Independent review was integrated as `f83dcad38ed4b2992033779eb4df921e4fc2489d`; its receipt shows the unchanged selected-seller case failing, then all 11 signer tests passing on the correction. This follow-up read that existing receipt; it did not claim to be its implementer or rerun that review.
- Preflight observation correction `ea7a5035` was integrated locally as `4b679218` and independently reviewed as `2b7c015e`, as recorded by the active coordinator. The source claim and local integration history were inspected read-only. Its final published combined browser result remains pending.

At the final GitHub snapshot, PR #278 still pointed to d74. Therefore those local successor repairs must not be counted as included or hosted-qualified on d74 or PR #292. The source-bound failure records are preserved, not erased by the availability of local fixes.

The canonical d74 Pages build/Anvil jobs, Beta acceptance, Integration, all three CLI platforms, and both Hosting jobs passed. Its Pages release-gates, attestation, deployment and live-smoke jobs were skipped under pull-request conditions. `pages.yml` enables publication only for an explicit main-branch workflow dispatch with `deploy=true`; these skips do not establish publication qualification.

## Strict security gates remain unresolved

[Contract analysis 44643709093](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709093) remained in progress. Echidna job `135980874253` passed, and artifact `14587494541` was available with GitHub digest `sha256:8eab2127cdccdc5aef64b410a57435459a22cdc4489b13585553134a53629961`. This follow-up inspected metadata only, not that artifact's bytes.

Mythril job `135980874961` was still in its analyzer-execution step. No Mythril artifact was available. Its current terminal exit, per-target completeness and exact finding count are **unknown**. The workflow retains the 100-minute analyzer-step and 120-minute job limits. The configured source runner uses Mythril 0.24.8, solc 0.8.28, optimizer enabled with 200 runs, Cancun EVM, five sequential targets, 900-second default per-target execution budget and transaction depth three. Configuration inspection is not evidence that the unfinished current analysis completed. No older c993 finding count is presented as a result for d74.

The previously retrieved d74 CodeQL gate reported two High annotations in intentionally malformed fixed test-fixture builders. PR #292 contains the independently reviewed byte-preserving clarification. This follow-up observes no new CodeQL result and does not dismiss alerts or relabel the gate green. The full private GitHub security-alert inventory remains unavailable, so current Critical/High/Medium repository finding counts cannot be asserted as zero.

## Evidence and continuation

[QUALIFICATION_LEDGER.json](QUALIFICATION_LEDGER.json) provides exact-source workflow/check dispositions, owned-fix provenance and next actions. The `evidence/` directory contains compressed normalized API snapshots, the complete decoded failing d74 web log, complete decoded successful PR #292 Pages Anvil and Integration logs, and source/log receipts. Log receipts distinguish exact UTF-8 decoded tool text from HTTP transport bytes; gzip uses a deterministic zero timestamp. [EVIDENCE_SHA256.json](EVIDENCE_SHA256.json) inventories the retained bytes.

No product or test file was changed during this follow-up. No hosted job was rerun or cancelled, no remote ref or alert was changed, and no publication was performed. Evidence-only changes remain off PR #292's frozen head. No local product test is claimed for this read-only cycle.

Continue by obtaining the remaining exact-head results, inspecting each terminal failure, and combining compatible reviewed repairs under the existing coordinator's ownership. Requalify the final combined source, including fresh CodeQL and complete strict analyzer evidence. Keep dedicated-origin, signed-manifest, actual external-testnet/wallet acceptance, owner publishing decisions and required external security review outstanding. Neither demonstration nor testnet beta is ready from this incomplete matrix.
