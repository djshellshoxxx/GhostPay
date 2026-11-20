# GhostPay — finish current features and consolidate unique code

Prepared November 20, 2026, from the completed source audit and source-pinned engineering handoffs. Copy the prompt below into the next engineering session. This file is a continuation instruction, not a claim that the requested implementation has already happened.

---

## Mission

Continue engineering in **https://github.com/djshellshoxxx/GhostPay**. Finish the accepted, unfinished core and latest current features, recover useful unique code from existing branches, and consolidate compatible work into a coherent, tested candidate for main.

Perform implementation, integration, review and verification. Continue through successive bounded milestones and fresh workers until the agreed scope is complete or only concrete external, access or unresolved product decisions remain. Record those blockers precisely and continue every independent task that can proceed. Use existing authorization for ordinary reversible engineering; do not ask the user to reconfirm routine steps.

## Start from verified state

Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/ACTIVE_WORK.md`, and the current source-pinned engineering/consolidation handoffs. `docs/ai/HANDOFF.md` was a template at the audit checkpoint; verify its contents before relying on it.

Read the published audit on **`audit/zero-cool-core-20261119`**, especially:

- `docs/security-audits/zero-cool-20261119/AUDIT_HANDOFF.md`
- `docs/security-audits/zero-cool-20261119/FINDINGS.md`
- `docs/security-audits/zero-cool-20261119/finding-status.json`
- `docs/security-audits/zero-cool-20261119/scope-refs-final.json`
- `docs/security-audits/zero-cool-20261119/COVERAGE.md`
- `docs/security-audits/zero-cool-20261119/VALIDATION.md`

The completed audit covers **546 paths / 670 distinct source versions / 12 pinned snapshots**, with zero pending coverage, through **2026-11-20 06:29:30 UTC**. It records **16 core finding families: 4 Medium and 12 Low**, plus separately classified hosting defects and hardening. It was a static source review; it did not qualify the combined application or execute application/browser/contract suites. Preserve that historical boundary. Review and qualify new changes separately.

Audit publication was explicitly authorized and completed. Its first public snapshot is `9c17c871ea71f23b5ce2897188086b5291917461`, with the same tree as local audit checkpoint `d54e055cdd5fc6f5637f60cf2a542dca6211a4cd`. Read the latest audit-branch handoff for publication bookkeeping. Do not treat the earlier resolved publication block as a current blocker, or treat publication permission as deployment permission.

Fetch current branch/tag metadata without deleting refs. Enumerate current branches and relevant open/merged/closed PRs with complete pagination. Verify exact main, candidate and donor heads, active owners, required checks, and deployment target. Main at the audit cutoff was `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`; refresh it. A branch name, date, old green CI run or document titled “latest” does not establish current correctness.

Start a dedicated integration worktree from verified current main, or reuse a current candidate only after reconciling its full delta with main and its active owner. The audit branch is an evidence source, not a current product-development base.

## Product scope

Prioritize the static, client-side, non-custodial **GitHub Pages browser beta** and its current first-party production dependency closure, with current HTTPS/Tor static-hosting support. Preserve accepted browser/network boundaries and existing custody/recovery requirements.

Inventory current feature families from actual source and accepted specifications: custody and portable recovery, per-stealth-address key export where required by the accepted specification, session revocation and idle lock, wallet/network/signer selection, receipt verification, sweep consent, scan completeness and persistence, privacy masking/history/clipboard/quick-hide, origin/frame boundaries, and supported merchant/invoice/import/export flows. Preserve the supported status of any current non-EVM browser integrations rather than expanding experimental scope.

Continue accepted current-scope work already underway. Preserve future-only specifications, archived implementations, paused server/native/merchant-CLI variants, optional contracts and unrelated experiments with a clear disposition. They are not automatically release requirements. Do not activate guardians, fees, paid services or new protocol authority to finish a Pages task. The portable static-hosting tools are relevant support; that does not reopen unrelated application CLI/server work.

## Candidate sources to rediscover

These are historical audited pins and donor leads, not assertions of current branch heads or instructions to merge whole branches:

| Branch | Audited head | Integration lead |
| --- | --- | --- |
| `integration/ghostpay-main-unique-code-20261120` | `885b9569e6fc99e43bf01d23305494275e10120e` | Five narrow contributions; report referred to PR #306. |
| `integration/ghostpay-main-recovered-fixes-20261120` | `6c65cc3fd31c9ae361f932bee4a3449d89ed776c` | Thirteen further isolated recoveries, including receipt, QR and ERC-20 corrections. |
| `release/ghostpay-beta-qualification-20261119` | `417f7c71daf8645e1432f2ec8f070110879b80bd` | Broad current implementation; also includes out-of-scope material that needs selective treatment. |
| `integration/ghostpay-completion-20261120` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | Lifecycle, sweep and other coherent current feature work. |
| `fix/ghostpay-format-validation-20261120` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | Related corrected source and validation work. |
| `snapshot/ghostpay-privacy-8be15289-20261120` | `d6819796a9542acc488b896786faffe83b913d9b` | Privacy implementation and corrected backup clipboard component. |
| `feat/ghostpay-privacy-quick-hide-20261120` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | One-way quick-hide integration over that privacy snapshot. |
| `feat/ghostpay-tor-completion-20261119` | `14a7526842b3cb055452b721d237a7e68813ff0c` | Current Tor static-hosting implementation and supporting tools. |

Newer handoffs may be absent from main or the audit working tree. Read them from their owning refs with `git show <verified-sha>:<path>`; do not check out an old broad branch over ongoing work. Useful starting documents are:

- On recovered-fixes: `docs/consolidation/main-unique-code-20261120/REPORT.md`, its `recovered-fixes/REPORT.md`, and the adjacent `PROVENANCE.json` and `BRANCH_CENSUS.json` records.
- On consolidation: `docs/engineering-handoffs/CURRENT.md`, `docs/engineering-handoffs/completion-20261120/README.md`, `docs/engineering-handoffs/continuous-20261119/README.md`, `docs/engineering-handoffs/continuous-20261119/generation-5-remaining-uniqueness/`, `docs/consolidation/feature-completion-20261119/FEATURE_MATRIX.md`, and `docs/release/RELEASE_BLOCKERS.md`.
- On quick-hide: `docs/engineering-handoffs/privacy-quick-hide-20261120/README.md`.
- On Tor: `docs/specs/TOR_HOSTING_COMPLETION.md`.

## Establish the consolidation and feature ledgers

Create or continue a single current coordination directory under `docs/engineering-handoffs/`, with a clear pointer from the relevant current handoff. Record exact source identities and task ownership before edits. Maintain:

1. A branch disposition ledger: ref and SHA, merge bases, unique production/test/documentation changes, active owner, dependencies, chosen disposition and evidence.
2. A feature matrix: accepted requirement, reachable implementation, missing behavior, selected source, dependencies, acceptance criteria, tests and remaining blockers.
3. An integration provenance ledger: donor commit/path/blob, selected change, receiving commit, authorship and verification.
4. A validation record: exact tested head or source tree, commands, exit codes, outcomes, skips, environment failures and required checks still pending.
5. A fresh-worker handoff naming the next bounded tasks.

Keep **source-corrected**, **integrated**, **automatically verified**, **externally verified**, **blocked**, and **deferred** distinct. Preserve `UNKNOWN` for incomplete comparisons; a missing result is not evidence of duplication or completion.

Determine unique behavior using merge bases, full diffs, patch equivalence, final blobs, tests and semantics. Handle multiple best merge bases and truncated comparison APIs explicitly. Ancestry does not prove that later edits retained a behavior, and a unique commit does not prove that the behavior is missing from main. Recover valuable current-scope work from older branches where needed; preserve genuinely future or superseded work without importing it. Avoid whole-file replacement that erases newer fixes. Keep donor tests, shared fixtures and authorship with the code that requires them.

## First implementation and reconciliation priorities

**No audited snapshot contains every prepared correction.** Reconcile the source-status matrix before implementing competing fixes.

1. **Bring the four Medium corrections into one candidate.** Integrate receipt identity/status checks, synchronous suspension of ordinary authority on lock, revocation of wrapper-owned outstanding key copies, and invalidation of stale sweep review context. The recovered-fixes branch has the receipt repair but retains the older session and sweep behavior. Preserve sole-copy encrypted recovery and durable transaction results after a real handoff.
2. **Carry related small corrections and their consumers.** Reconcile canonical ERC-20 simulation results, QR idle deadlines, TRON range completeness, runtime input validation and receipt fixtures. In particular, retain the shared policy receipt fixture correction with wallet validation; do not weaken production checks to make old fixtures pass.
3. **Finish privacy integration coherently.** The backup clipboard component fix was present only in privacy-snapshot/quick-hide among the audited refs. The branch named `clipboard-guard` and the later integration branches were insufficient. Reconcile against the active privacy owner's newest qualified source. Check `SecretBackup.tsx`, shared clipboard ownership, masking/history and lock/cancellation together.
4. **Resolve the recorded quick-hide integration gap if still present.** At the pinned quick-hide head, `WalletAttempts` required wallet context that both Pay instances and RegistryView omitted. Its journal controls and broader buyer journey were not qualified by the focused shortcut tests. Repair current wallet/account/chain wiring while preserving uncertain-attempt records and duplicate-send protection. Recheck live PR state first; another owner may already have repaired it.
5. **Address unresolved current browser findings.** These include stale wallet-connection continuations, selected TRON network binding, the remaining match-conditioned TRON token lookup, configured indexer input budgets, and accurate recipient-binding assurance for minimal receipts where that feature is integrated. Preserve intentional formats and honest privacy limits. Consult the full finding prerequisites instead of treating all entries as the same severity or reachability.
6. **Complete current static-hosting work.** Reconcile the Tor implementation and correct generated origin-isolation guidance, path-containment handling and failed-rollback backup retention in the hosting kit. Use controlled local fixtures; retain recovery bytes on failure. Source pins, mock origins and offline checks are not live Tor/browser qualification.
7. **Continue other accepted unfinished features from the refreshed feature matrix.** Close actual behavior gaps and integration regressions. Keep supporting signer/vault/policy findings separate where no current browser consumer exists; do not silently add such a consumer or change an immutable contract to claim a Pages release is finished.

A historical patch, `fix/remediation-f95457fd-22ecf9` at `6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a`, was explicitly rejected/superseded because its broad journal guard blocked legitimate different-scope payments. Reassess against current source if necessary; do not restore it merely because it is nonancestor or named a fix.

## Work in bounded parallel rounds

Use isolated branches/worktrees and nonoverlapping ownership. Record worker, branch, base SHA, paths, dependencies and acceptance criteria in `docs/ai/ACTIVE_WORK.md` before editing. Recheck claims in other branches and open PRs; preserve active work.

Delegate independent implementation and discovery scopes, and use fresh reviewers for code quality, ordinary functional bugs and defensive security invariants. With limited concurrency, run these roles in successive rounds. One coordinator owns shared integration, manifests, lockfiles and final evidence reconciliation. Do not have multiple workers change the same shared files without an explicit integration owner.

Prefer small coherent commits and complete dependent feature groups. Recheck source/receiving heads before each integration. Preserve original branches and open PRs until their unique content has a verified disposition; do not delete branches, close others' PRs or rewrite shared history to manufacture a clean inventory.

## Verification and promotion

For behavioral changes, add or retain meaningful regression tests and positive controls for the intended invariant. Use synthetic data and local fixtures. This is defensive engineering; do not probe third-party targets or create exploit demonstrations.

Run the relevant targeted tests first, then the applicable combined typecheck, lint, build, coverage, browser, artifact and required security gates. Inspect project scripts and CI to choose commands. Do not relax assertions, coverage thresholds, allowlists, provenance checks or security gates to obtain green results. Distinguish environment failure from product failure, and an intentionally skipped check from a pass.

The historical recovered-fixes report recorded successful general CI for broad candidate #278 alongside unresolved CodeQL and strict Mythril results. Retrieve current findings and required checks on the selected source; general CI or clearance on another head does not settle those gates.

Qualify the actual combined source. Donor CI and old handoff test counts are supporting history. Cover the supported payment/receipt/import/export journeys, lock and cancellation boundaries, uncertain transaction outcomes, recovery portability, selected wallet/network behavior, privacy disclosures, full/lean profiles where supported, subpath delivery, origin/storage boundaries and accessibility.

Use normal reviewed PR/integration workflow and required CI. If the session's existing authorization permits main integration, promote only after current-head review and required checks pass. Otherwise finish the concrete, reviewed candidate and report the exact remaining merge step. Keep deployment, release signing, fee activation, funds movement and new product/protocol decisions within their separately established permissions. Do not infer those permissions from audit publication.

Record physical-wallet/device, public-network, signing-identity, dedicated-origin and real Tor requirements separately when unavailable. Do not mark their acceptance complete based on mocks. Continue independent local engineering while external acceptance is blocked.

## Fresh-worker continuation and completion

Before a context limit or worker retirement, save the handoff in the repo and commit completed work. Include:

- Objective, accepted decisions, scope and outstanding acceptance criteria.
- Repository/worktree, branch, exact base/head/tree SHAs and owned paths.
- Selected donors, integrated commits, preserved branches and unresolved uniqueness.
- Commands actually executed, their results, evidence paths and unrun checks.
- Known findings, incomplete changes, active owners and concrete blockers.
- The next bounded task, dependencies and verification needed to finish it.

Give the next worker fresh, self-contained instructions containing those facts and required source paths. Require it to verify current heads and read the handoff before editing. Resume from the last verified checkpoint; do not restart a completed audit or claim retired workers are still working. Rotate independent reviewers for new changes and final integration.

The cycle is complete when every in-scope feature and branch contribution has an evidence-backed disposition, all actionable accepted gaps are implemented and reviewed, and the combined candidate passes its applicable required checks. Remaining external or product blockers must name what is missing, who or what can resolve it, and the next action. End with exact candidate/merged SHAs, feature changes, branch dispositions, test evidence, remaining blockers and the next handoff path.
