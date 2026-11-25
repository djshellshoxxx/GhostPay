# Housekeeping inventory, docs/ (2026-11-25)

Scope: read-only inventory of `docs/` at origin/main c8e131c (worktree branch `docs/maintenance-haiku-20261125`). Nothing listed here was deleted or moved. Fixes were limited to the allowed files; see the last section.

Method: shell checks run in the worktree on 2026-11-25. Counts are from `find`, `ls`, `md5sum`, `diff` and `grep`. Link checks used a local script that resolves each relative Markdown link against its own file's directory. Path references were checked by plain existence on disk (`[ -e ]`). Items not checked are marked **unverified**.

Totals: 1264 tracked files under `docs/` (37 MB). 1721 unique repo-path strings referenced from docs, of which 354 do not exist on disk (see the broken-references section).

## 1. Empty or obsolete directories

Empty directories: **none** (`find docs -type d -empty` returned nothing).

Directories that look historical. None is empty; these are candidates for archival review, not deletion.

| Path | Files | Evidence |
|---|---|---|
| `docs/consolidation/` (16 dated subdirs, e.g. `20261118-*`, `20261120-*`, `hosting-timestamp-*`, `master-20261118`) | 183 | Dated consolidation snapshots. Their own READMEs/handoffs describe them as superseded (not re-verified line by line). |
| `docs/handoffs/` (11 subdirs, 299 top-level files) | 404 | Dated handoffs from 2026-10 to 2026-11. Several are referenced by `docs/INDEX.md` as predecessor evidence. |
| `docs/handoffs/pr70-wip/` | 6 | Six `.patch` files plus a README for PR #70 work-in-progress. Patch subjects are `fix(web/scan): ...`. Status of PR #70 not verified here. |
| `docs/handoffs/agents/` | 57 | Per-team handoffs (TEAM_A..TEAM_J) and dated artifacts. Several are "UNIFIED" or "FINAL" variants of the same team (naming pattern only; contents not compared). |
| `docs/remote/` | 312 | Remote-extension branch work (`claude/remote-extensions-1`, per `docs/INDEX.md`). `docs/INDEX.md` says many files are unverified static reviews. |
| `docs/future/` | not counted | Future-only proposals. `docs/INDEX.md` has a section for them. |

## 2. Duplicates

Byte-identical content under two names (`md5sum`, all `.md` files):

| Paths | Evidence |
|---|---|
| `docs/consolidation/all-branch-followups-20261124/evidence/additional-compatibility-review.md` and `docs/consolidation/all-branch-followups-20261124/evidence/compatibility/independent-review.md` | Same md5. Only pair of identical `.md` files in `docs/`. |

Same basename, different content (not byte duplicates). Checked with `diff`:

| Paths | Evidence |
|---|---|
| `docs/specs/ideas/01-sweep-and-link-hygiene.md` vs `docs/remote/plans/ideas/01-sweep-and-link-hygiene.md` | Different content; `diff` gives 377 lines. Same pattern for ideas `02`..`07` (see the basename scan). Likely forks; not merged. |
| `docs/HANDOFF.md` vs `docs/ai/HANDOFF.md` (also `docs/consolidation/20261121-r22/HANDOFF.md`, `.../20261121-r23/HANDOFF.md`) | Different content; `diff` gives 290 lines. Two of these are the lead's active handoff files, so they are not touched here. |
| `docs/consolidation/.../compatibility/independent-review.md` vs `.../cookie/independent-review.md` | Different content (`diff -q`). |
| `docs/chains/bitcoin.md`, `docs/audits/05/bitcoin.md`, `docs/remote/chain-ports/bitcoin.md` (and `chain-adapters.md`, `tron.md`, `solana.md`, `relayer.md`, `core-crypto.md`, ...) | Same basename in audit, chain, and remote folders. Not compared byte by byte (unverified whether they overlap in content). |

## 3. Outdated temporary files

Filename scan for `.tmp`, `.bak`, `.orig`, `.swp`, `~`, `.DS_Store`: **none found**.

Name-based suspects (not proof of being temporary). Listed for a human to judge:

- `docs/handoffs/LOCALE_DRAFT_COMPLETION_2026-11-02.md` (name says draft).
- `docs/handoffs/pr70-wip/*.patch` (six patches, work-in-progress for PR #70).
- `docs/handoffs/agents/team-j-analyzer-evidence/*.partial.log.gz` and `*.raw.log.gz` (raw tool logs, binary).
- `docs/ai/PAGES_BROWSER_FIXES_COMBINED_2026-11-14.md` (dated integration handoff for an isolated branch whose base is PR #157; its own text says no combined-branch tests were run locally). Its owner branch is named in the file. Relocation candidate, see section 6.

## 4. Broken or stale references found but NOT fixed

### 4a. Relative Markdown links in the allowed files

Result: **0 broken relative links** in `docs/ai/WORKFLOW.md`, `docs/ai/PAGES_BROWSER_FIXES_COMBINED_2026-11-14.md`, `docs/INDEX.md`, or any `docs/*.md`. 387 relative links were checked in those files. Anchor links (`#...`) in the same files were also checked: 0 unresolved.

One non-link false positive, outside the allowed scope: `docs/remote/chain-ports/solana-impl.md:8` contains math notation `[8](r·V)` that the checker reads as a link. Not a real link; no action.

### 4b. Path references that do not exist (backtick or plain text), in files I may not edit

Each row is a repo path referenced in a file outside my edit scope or in a file where the correct replacement is not verifiable. Lines are from the current file.

| File:line | Reference | Reason not fixed |
|---|---|---|
| `docs/HANDOFF.md:64` | `scripts/scan-bundle.mjs` | Real file is `apps/web/scripts/scan-bundle.mjs` (`apps/web/package.json` `postbuild` uses it correctly). Wrong path, but `docs/HANDOFF.md` is lead-owned. |
| `docs/HANDOFF.md:104` | `apps/web/public/deployments/31337.json` | Correctly described as git-ignored (`.gitignore:14`). Not broken; not a stale reference. |
| `docs/HANDOFF.md:129`, `docs/COMPLETION_PLAN.md:19` | `docs/audits/05-p0-fixes.md` | Missing. Lead-owned / top-level plan; no replacement file verified. |
| `docs/HANDOFF.md:131` | `docs/audits/05-ux-foundation-review.md` | Missing; no replacement verified. Lead-owned. |
| `docs/COMPLETION_PLAN.md:23` | `apps/web/public/deployments/31337.json` | Git-ignored (see above). Not broken. |
| `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md:153` | `scripts/validate-chain-config.sh` | Not in `scripts/` (verified). No replacement verified. |
| `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md:170` | `scripts/verify-release-artifact.sh` | Not present. `scripts/verify-release.sh` exists; whether it is the renamed successor is **unverified**. Rename would change meaning. |
| `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md:171` | `scripts/pin-ipfs.sh` | Not present (verified). No replacement. |
| `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md:183` | `scripts/deploy-onion-static.sh` | Not present (verified). No replacement. |
| `docs/DEVELOPER_SPECIFICATION.md:32-51`, `:252`, `:397`, `:432-433` | `packages/relayer-adapter`, `@ghostpay/relayer-adapter`, `@ghostpay/ui`, `apps/ui`, `@ghostpay/contracts` (named differently or absent) | Spec text; the file's own corrections table (lines 47-51) already records the renames. Rewriting the spec is out of scope. |
| `docs/APP_AND_RELAYER_SPEC.md:62,66` | `@ghostpay/relayer-adapter` (absent; spec says so explicitly) | Historical correction note; left. |
| `docs/DEPLOYMENT_MANIFEST.md:90,108` | `@ghostpay/chain-adapters` (exists), `npm run validate:deployments -w @ghostpay/web` | Command name exists in `apps/web/scripts/validate-deployments.mjs`; root-level name not verified. |
| `docs/MULTICHAIN_SPEC.md:7` | `@ghostpay/chain-adapters` | Exists. No fix. |
| `docs/COMPLEMENTARY_WORKSTREAM_2026-11.md:27` | `@ghostpay/confidential-contracts` | Exists; the sentence is a recorded test failure (historical). |

Mass references from `docs/remote/**`, `docs/consolidation/**`, `docs/handoffs/**`, `docs/research/**`, `docs/specs/ideas/**` (outside my scope). From the full scan of 1721 unique path strings, 354 are missing. Top areas by count:

- `apps/web/**`: 149 missing. 140 of the `apps/web/src/*.ts` paths exist on disk as `.tsx` with the same stem (verified with a `.ts`-to-`.tsx` probe, e.g. `App.ts` vs `App.tsx`). The remaining `apps/web/` misses were not individually classified.
- `apps/relayer/src/breaker.ts`, `apps/relayer/src/hardening.test.ts`, `apps/relayer/src/netsafety.test.ts`, `apps/relayer/src/secrets.test.ts`: missing (verified). `breaker.ts` is still cited by `docs/developer/api/apps.md`, `docs/audits/11-relayer-migration.md`, `docs/audits/01-completeness-audit.md` and `docs/handoffs/consolidation-2026-11-04/lanes/C3.md`. Whether the module was removed or renamed is not verified.
- `apps/manifest/index.md`, `apps/secrets.md`, `apps/payer-sponsor/DEVIATIONS.md`: missing (verified). `packages/payer-sponsor` exists; `apps/payer-sponsor` does not.
- `docs/audits/05-p0-fixes.md` and `docs/audits/05-ux-foundation-review.md`: missing (verified). `docs/audits/05-full-audit.md` exists.
- `packages/contracts/**` (14), `packages/sdk/**` (7), `packages/ensjs/**` (6), `docs/main/**` (22, meaning not verified), `docs/notes/**` (6, meaning not verified).

### 4c. Stale package names

`@ghostpay/` names referenced from docs that match no `package.json` `name` in `packages/*` or `apps/*` (verified): 40+ distinct names, e.g. `shielded-pool`, `ux-glossary`, `ux-errors`, `signer-abstraction`, `request-kit`, `payer-hiding`, `onboarding`, `net-status`, `mode-guard`, `local-store`, `ledger-export`, `receipts`, `pwa-shell`, `wallet-connect-adapter`, `wallet-compat`, `ui`, `theme-pack`, `sweep-guide`, `shielded-pool-prover`, `share-safe`, `relayer-adapter`, `recurring-invoices`, `profiles`, `policy-ui-kit`, `pay-reconcile`, `notify-local`, `ledger-query`, `invoice-templates`, `i18n-core`, `fiat-display`, `embed-return`, `embed-kit`, `contacts`, `command-palette`, `backup-bundle`, `a11y-kit`, `contracts`, `verify`, `testkit`. Most occur in `docs/remote/**` and `docs/future/**` (proposal or design-era names). Not fixed: renaming in prose changes meaning.

## 5. Proposed cleanup needing human approval

Nothing below was done. Each needs a decision by the owner.

1. Move `docs/ai/PAGES_BROWSER_FIXES_COMBINED_2026-11-14.md` to `docs/handoffs/` and update its inbound references (verified: `docs/INDEX.md` does not link it; `docs/consolidation/ledger-code-branches.json`, `docs/handoffs/BRANCH_COMPARE_R7_*.json` mention it as a string). Owner: the lead, since `docs/ai/` is the active-worker area.
2. Delete or consolidate the identical pair in section 2: keep `docs/consolidation/all-branch-followups-20261124/evidence/compatibility/independent-review.md` and remove `additional-compatibility-review.md`, after confirming nothing links to it (not checked).
3. Archive `docs/handoffs/pr70-wip/` (six patches) once PR #70 status is confirmed closed or merged. Status not verified.
4. Decide whether the dated consolidation snapshots under `docs/consolidation/` (16 dirs, 183 files) move under one `archive/` folder. Requires checking inbound links from `docs/INDEX.md` and `docs/HANDOFF.md` first.
5. Decide whether `docs/specs/ideas/` and `docs/remote/plans/ideas/` (eight same-named pairs) are both needed; they differ in content.
6. Review `docs/handoffs/agents/` (57 files) for superseded variants. Not done: contents not compared.
7. Give the top-level docs missing from `docs/INDEX.md` an index row or move them (verified: `grep` for each basename in `docs/INDEX.md` finds no match): `AUTHORITATIVE_DEVELOPMENT_REPOSITORY.md`, `CHATGPT_ZERO_CODEX_CONTINUATION.md`, `CI_REMEDIATION_2026-10-21.md`, `CONSOLIDATION_PROGRESS.md`, `CONSOLIDATION_STATUS.md`, `FEATURE-ASSESSMENT-2026-10-23.md`, `HANDOFF-2026-10-23.md`, `HANDOFF-2026-10-24-PR26-CAS.md`, `LEAN_CANDIDATE_QUALIFICATION.md`, `RECONSTRUCTION-2026-10-23.md`, `WORK-PLAN-2026-10-24.md`, plus `INDEX.md` itself.
8. Resolve the `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` script references (4b). Either restore the scripts or mark the lines as planned.

## 6. Engineering defects noticed (for the engineering worker, not fixed here)

- `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` names four `scripts/*.sh` files that do not exist (`validate-chain-config.sh`, `verify-release-artifact.sh`, `pin-ipfs.sh`, `deploy-onion-static.sh`). If the playbook is meant to describe current release gates, those gates are either missing or documented incorrectly. Needs a decision.
- `docs/HANDOFF.md:64` says `npm run build -w @ghostpay/web` includes `scripts/scan-bundle.mjs`. The `postbuild` in `apps/web/package.json` runs `node scripts/scan-bundle.mjs` from the workspace, which resolves to `apps/web/scripts/scan-bundle.mjs` (exists). The doc path is wrong; the build is not.
- `apps/relayer` has no `breaker.ts`, `hardening.test.ts`, `netsafety.test.ts` or `secrets.test.ts`, but several docs cite them (section 4b). Either the modules were removed or the docs are stale. Not verified which.
- `apps/web/src/*.ts` paths quoted in docs (140 of them) are `.tsx` on disk for the same stem. Docs drift only; no build issue found.

## 7. Edits made in this task

Allowed-file fixes: **0 links fixed, 0 filenames changed, 0 formatting changes.** Reason: every relative Markdown link in the allowed files resolves, every heading-level sequence is valid, and every table row has matching pipes (`fmt` check). Nothing met the "verifiably broken" bar.

Non-blocking formatting note: three top-level files (`docs/DEVELOPER_SPECIFICATION.md:3`, `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md:5`, `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md:5`) end a `**Status:**` line with two trailing spaces. In Markdown that is a deliberate hard line break. Left as is.

Verification commands and results are described in the final report; no files outside `docs/maintenance/` and the allowed set were changed.
