# GhostPay consolidation continuation — 2026-11-20

## Scope and ownership

The owner requested continued consolidation of branches containing unique code and parallel completion of unfinished features. This cycle prioritizes the static browser/Pages application, signed invoice files, backup operation ownership, selected-document printing and static Tor hosting qualification. Broader recovery, privacy, relayer and contract candidates remain preserved for separate coherent integration.

Coordinator: `994a0d214fb9-root`. Independent lanes: initial branch inventory, invoice-file qualification, SellerKeys completion, integration review and Tor qualification completion. The cooperative integration lock was acquired at generation 8 through an expected-head, non-force GitHub ref update. Its control commit is `1989389469bbb3a2ae9d529d95c7854fb9a4b8fa`.

Starting main was `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. No release or Pages deployment is part of this cycle. The existing Pages workflow deploys only through its explicit dispatch path; ordinary PR validation and main integration do not publish the site.

## Completed main integrations

| Contribution | Reviewed donor | Main integration | Evidence |
| --- | --- | --- | --- |
| PR #306: five unique QR, profile, history and merchant-pin fixes | `885b9569e6fc99e43bf01d23305494275e10120e` | `68aa26cdd93de32ae7ed3867f4a21a017ebc46ed` | Independent exact-source review; all 15 donor source/test/handoff blobs and modes preserved; 36 successful checks and three intentional deployment-only skips |
| PR #311: payment-URI builder/parser length agreement | `0fa33f7101f3c9ac4d685673aece16eda6e98366` | `aa3df1cb37274fae73af0ca957183c15c51b62d3` | Two independent source reviews; 36 successful checks and three intentional deployment-only skips |

The five branches in #306 reject lossy Unicode in multipart QR, narrow unexpected build profiles, mark incomplete 30-day scan history, reject duplicate merchant-pin JSON members, and reject unknown/inherited QR kinds. #311 applies the existing 2,048-character parser limit to generated Bitcoin, Solana and TRON payment URIs without truncation.

CI sources: [#306](https://github.com/djshellshoxxx/GhostPay/actions/runs/44685958289), [#311](https://github.com/djshellshoxxx/GhostPay/actions/runs/44690480477).

## Combined candidate

The continuation begins with PR #307 at `0e926f8b4cf7f307c3174f3a03298ff310cb1808`. That branch retains #306 and sixteen isolated recovered contributions. Its 38 original source/test blobs and modes were independently verified against the existing provenance manifest. Its target was changed to `main` after #306 merged.

The following source heads are integrated into the continuation candidate with donor ancestry retained. All source conflicts observed during these integrations were limited to `docs/ai/ACTIVE_WORK.md`; each side's ownership record was preserved.

| Source | Frozen head | Resulting behavior |
| --- | --- | --- |
| PR #313 | `c48c9917708ea86ea1a82a9d5d44f3add9876c98` | Invalid decimal precision yields the typed error; supported integer scales 0–77 remain unchanged |
| PR #315 | `7e1a189c065f4ae437a2570f03922eb66ca38c2c` | Ledger regression tests wait for actionable activation while preserving exactly-once activation assertions |
| PR #317 | `caa4bd7e3465b5d6655eb3dbe86e5f240eb21462` | Encrypted tag display is scoped to the selected chain and current seller session; replacement requires fresh unlock |
| PR #319, retaining #314 | `627ab977c9cc4e5ebc682eda822cfe792cd76fc1` | Superseded export/import/verification/unlock operations release their own controls, while durable save/delete operations retain their busy state |
| F03 canonical repair #310 | `1de98f6c9371010883253450446e6f7294da84fa` | Explicit signed request-file download, staged local import, review and open using the existing signed envelope |
| F03 independent qualification | `7de737b5c8c5fc02086ba0030d78c181d239590c` | Preserves the canonical F03 product tree plus independent source review and executed qualification evidence |
| Updated print repair #316 | `e0c583be2514b44af7f3b15619fb8160358f1470` | Printing selects one receipt or bill and excludes unrelated documents, controls and wallet UI |
| Tor qualification completion #320, retaining #308 | `e8010bbe002331ee0cb37dc6b16dfd91c8b8647d` | Static Tor packaging and qualification retain their reviewed runtime; complete build inputs and an exact generated-origin assertion repair the two recorded gates |

These source and focused-test results do not replace final combined-head hosted checks. Earlier green checks for the CSS-only #316 head do not qualify its later print-target hook. Likewise, original F03 browser failures are superseded only when the repaired browser jobs actually pass.

## Repairs completed in this cycle

### Sweep RPC fixture

PR #307's only observed web assertion failure was the existing B-R6 test for an unknown transaction outcome following a successful dry run. The shared RPC fixture answered an ERC-20 `transfer` call with its default EIP-712 domain separator. The stricter token validator correctly rejected that noncanonical Boolean result.

The one-line fixture correction explicitly encodes ABI Boolean `true` for the transfer selector, after the existing simulated RPC-unavailable branch. Production validation and all original warning assertions remain unchanged. The original failing assertion reproduced locally; both B-R6 regressions pass after correction. Independent review approved the exact corrected test blob `60bd8a7d379fc6b69050e1928ba4ddb101341db9`.

### SellerKeys operation ownership

The backup worker retained the upstream #314 repair and identified three adjacent lifecycle defects. A canceled unlock could leave controls disabled; session replacement could release a pending save's controls; editing unlock fields could release a pending deletion's controls. Separate `unlockBusy` and `vaultWriteBusy` state now represents the two lifetimes. Original controller, generation, session, reauthentication and storage guards remain intact.

The added regression suite produced three expected failures and two passes against the unchanged donor runtime, then five passes after the repair. An independent reviewer examined the complete runtime and test diff. The public commit sequence retains test-before-runtime ordering and the original #314 parent. See [the published handoff](https://github.com/djshellshoxxx/GhostPay/blob/627ab977c9cc4e5ebc682eda822cfe792cd76fc1/docs/handoffs/SELLERKEYS_OPERATION_COMPLETION_20261120.md).

### Signed invoice files

The original feature owner published the memo assertion correction while this cycle was inspecting the feature. The independent worker adopted that canonical source instead of replacing it. Positive browser assertions now match the complete `Memo: …` paragraph inside payment review; negative assertions still detect premature or stale disclosure. Envelope, signature, explicit-open, wallet, network, storage, passphrase and malformed-file assertions remain intact.

The worker rebuilt 18 dependency workspaces from its own source and passed 105 tests across five existing feature/DOM/QR test files. Product/test files are byte-identical to canonical `1de98f6c`. Detailed review and execution records are under `docs/consolidation/invoice-file-20261120/`.

### Selected-document printing

The independently reviewed follow-up to #316 introduces `usePrintTarget`, which assigns print ownership to the selected receipt or bill. Completion, cancellation, synchronous errors, ref replacement and unmount release that ownership. The older CSS-only donor could reveal every mounted receipt and was not promoted merely because its earlier CI was green. The published follow-up exactly matches the reviewed local tree.

### Static Tor qualification

The existing Tor candidate had two established hosted failures. Its dedicated workflow omitted library declarations imported indirectly by existing web tests, and a generated-README substring assertion triggered CodeQL's incomplete-URL-sanitization rule. The CodeQL annotation was in a test; it was not evidence that production origin authorization accepted partial URLs.

The repair installs the complete pinned dependency graph with lifecycle scripts disabled, builds workspace libraries, and retains the original lean web TypeScript, Vite and postbuild checks. The README test now requires exactly one complete expected origin line. No production URL guard, compiler inclusion or analysis rule is relaxed. The two-file repair was independently reviewed and published with both the original Tor candidate and current main as parents.

The Tor worker passed 55 native tests, five existing workflow tests, hosting-kit lint and typecheck, the secret scan, and all 114 pinned Actions references. One Docker-dependent case was skipped because Docker Compose is unavailable. Full application/browser/container/Tor qualification and fresh CodeQL remain hosted gates. See `docs/handoffs/TOR_QUALIFICATION_REPAIR_20261120.md`.

## Executed verification and limits

| Check | Actual outcome |
| --- | --- |
| Current web dependency closure built from coordinator source | Passed, serial TypeScript builds |
| Updated invoice-schema build after F03 integration | Passed |
| Original payment-URI suite with original coverage configuration | 213 passed; statements 97.51%, branches 97.12%, functions 100%, lines 99.09% |
| Original B-R6 baseline | One expected assertion failure, 54 filtered tests |
| Corrected B-R6 selection | Two passed, 53 filtered tests |
| Complete Sweep test file in a fresh serial invocation | 55 passed at 512 MiB |
| Complete legacy SellerKeys test file in a fresh serial invocation | 39 passed at 512 MiB |
| Independent invoice-file selection | 105 passed across five files |
| SellerKeys focused operation suite | Five passed after three confirmed baseline failures |
| Wider coordinator Sweep/txGuard selection | Incomplete: 40 assertions passed before a worker received SIGKILL; not a suite pass |
| Wider SellerKeys selection | Incomplete: six files/54 tests passed before the large legacy test worker received SIGKILL |
| Backup typed ESLint with 512 MiB heap | Heap exhaustion, exit 134; no lint pass claimed |
| Local invoice-file browser runner | No assertions executed: compiler subprocess exited 137 |
| Installed Chromium launch diagnostic | No page created: required process-singleton socket denied by host policy |
| Initial combined eleven-file feature selection | Eight files passed; aggregate reported 65 passing tests before three worker interruptions. Pay invoice QR, ReconciliationLedger and Pay request files received SIGKILL; no assertion failure was reported |
| Isolated completion of the three interrupted feature files | All passed at 512 MiB with one fresh invocation per file: Pay invoice QR 63, ReconciliationLedger 18, Pay request files 17. Together these complete successful verification of all eleven selected files; overlapping partial-run counts are not added to these 98 tests |
| Tor native and workflow selections | 55 native tests and five workflow tests passed; one Docker-dependent skip |
| Tor hosting-kit lint/typecheck and Actions pins | Passed; 114 action references pinned |

The original coordinator-wide `build:libs` attempt stopped because the reused dependency installation lacked an unrelated merchant-hooks workspace link. The web dependency closure subsequently built successfully from current source. Dependency versions and lockfiles were not changed to accommodate this local installation.

Local browser restrictions and interrupted processes are explicit evidence limits. Repository CI configuration, coverage thresholds, lint rules, compiler inclusions and security checks remain intact. Additional combined-source results and final hosted status belong in the continuation handoff or PR body with their exact source head.

The final local composed product checkpoint `9e304385cb052f7fea4ea7103b46e507561585f6` received a fresh source review after Tor integration. All 17 Tor source/configuration/test files match the corrected donor, and the earlier 73 reviewed contributed files plus the single Sweep fixture correction remain unchanged. The reviewer verified donor/main ancestry, scope boundaries and preservation of every nonempty ownership line. This source approval is for publication and qualification, not a substitute for final hosted results.

## Initial branch census

`BRANCH_CENSUS_INITIAL.json` preserves exact branch heads and comparison counts from the initial complete local Git-tree census. The comparison was frozen at starting main `773a94be` and original candidate `0e926f8b`; it is not relabeled as a post-integration census.

The raw inventory contained 378 remote-tracking entries. One entry was the local `origin/HEAD` symbolic alias, leaving **377 actual branch refs and 372 distinct heads**. The integration-lock control branch is metadata, not missing product code.

| Initial classification | Branch refs |
| --- | ---: |
| Ancestors of starting main | 178 |
| Additional ancestors of original candidate | 7 |
| No code changes under the documented file filter | 65 |
| Nonancestor heads with exact matching compared code in candidate | 15 |
| Related heads requiring semantic disposition | 110 |
| Coordination metadata | 1 |
| Unrelated deployment history | 1 |
| Total | 377 |

The census uses full local trees rather than GitHub's 300-file comparison ceiling. Ancestry alone does not prove every historical behavior survived, and differing blobs do not prove valuable behavior is absent. Per-file lists were omitted from the committed summary; exact heads and counts permit reproduction. New branches created by this cycle are documented above rather than silently added to the frozen initial sample.

## Preserved work and remaining gates

Large #278/#302 feature candidates contain hundreds of product changes and broader paused scope. They are preserved as source donors. Their known CodeQL/Mythril and combined qualification gaps are not bypassed by this cycle.

The required privacy v1 and v1.1 snapshots preserve the same trees as their earlier local checkpoints. Their status document records eight focused implementations, partial persistent invoice/transaction retention, and remaining full qualification gates. Older clipboard variants must not overwrite the newer helper. This report does not mark the entire privacy roadmap complete.

Final integration requires the current combined head's applicable CI, full/lean browser jobs, Pages build and browser acceptance, CodeQL and other configured gates. Recheck main, donor heads and lock ownership before promotion. Never infer success from queued, skipped, canceled or interrupted checks.
