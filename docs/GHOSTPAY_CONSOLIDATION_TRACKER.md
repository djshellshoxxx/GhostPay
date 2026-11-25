# GhostPay consolidation tracker

Living record for the testnet-beta consolidation (directive "GhostPay master consolidation and stabilization",
2026-11-25). It does not replace the binding scope in [AGENTS.md](../AGENTS.md) (owner stop-work directive and
shared-core privacy clarification) or the per-worker claims in [docs/ai/ACTIVE_WORK.md](ai/ACTIVE_WORK.md).
Everything below is pinned to the SHAs shown. A merged branch is not proof its feature works; estimated completion
is never verified completion.

Maintainer of this file: cloud session `ghostpay-6a` on branch `nodata/optimistic-maxwell-epuo8f`. Other workers may
append rows; keep the starting baseline unchanged.

## 1. Baselines

| | Value |
|---|---|
| Starting baseline (2026-11-25 12:50 UTC) | `origin/main` = `32ae3977b6026991ae0591daf385d3c536e2132f` (Merge PR #660) |
| Current integration baseline | unchanged: `32ae3977` (no merge to main by this worker yet) |
| Integration lock | `automation/ghostpay-integration-lock` `d1e2e037`: **released**, generation 26, last owner `claude-feature-completion-20261125` (candidate #664 `7b47c3dd` failed e2e lean, main unchanged) |
| Remote heads | 791 (`git ls-remote --heads`), incl. 34 frozen `archive/owner-stop-20261125/*` snapshots |
| Open PRs | 256 (pages 1–3 of the PR list at 13:40 UTC) |

### Baseline validation on `32ae3977` (this worker, Linux, Node 22.23.5, npm 10.9.9, 4 CPU / 15 GB)

| Check | Result |
|---|---|
| `npm ci --ignore-scripts` | pass |
| `npm run build:libs` | pass |
| `npm run typecheck` (all workspaces) | pass |
| `npm run lint` (all workspaces) | pass |
| Lean web build (`GHOSTPAY_LOCAL_BUILD_PROFILE=lean vite build`) | pass, 352 rendered modules |
| `GHOSTPAY_PAGES_DEV=1 bash scripts/pages/build-pages.sh` (with REL-EXCL step) | pass, 17 site files, "DEMO: payments disabled" |
| `node --test scripts/pages/*.test.mjs scripts/tests/*.test.mjs` | 341 pass, 1 skip, 0 fail |
| Full `npm test`, Playwright e2e, forge | **not run here** (no forge/anvil in this container); hosted CI is the gate. Main CI on `aaa71a11` passed 27/27 per W1's record; `32ae3977` hosted result not re-read here |

## 2. Active workers and merge queue (observed 2026-11-25)

Peers on the owner's home PC are not reachable by message from this cloud session; coordination is through
ACTIVE_WORK, the lock ref and PR text. Source: `claude/feature-completion-20261125` CAMPAIGN.md (12:36 UTC),
`claude/w1-coordination-20261125` HOME_TEAM_20261125.md (11:56 UTC), lock-ref history.

| Worker | Owns | PRs |
|---|---|---|
| FC coordinator `claude-feature-completion-20261125` | feature-completion round 1, FC-05b | #664 (candidate: #648 #661 #650 #649 #656 #662 #663), #669, #654 |
| W1 `ghostpay-58` | preservation, sole merger of W2–W4 | #667 (reconciles owner scope #659) |
| W3 | privacy-boundary production fixes | #672 (WIP Settings) |
| W4 | #286 clipboard, #287 minimal invoices | #668 (#553 + #580), #585/#600 |
| W5 (cloud) | independent verification, exclusive `verification/independent-beta/**` | #665 |
| `ghostpay-15` | P0-KEYS independent keystore recovery | #647 |
| `newghostpay-ae` | payment-uri invoice-link fix | #670 |
| `ghostpay-backup-60` | merged #657/#660; test follow-up to #647 | — |
| destination-reuse worker | #287 reuse | branch `claude/w-reuse-287-20261125` (#584 #586 #610) |
| ChatGPT/Codex automation | hourly bug/QA drafts, help containment | `automation/*` (#671 and older drafts) |
| **cloud lead `ghostpay-6a` (this file)** | REL-EXCL, TRACKER, R1 recovery bundle | this branch's PR |

Agreed main-merge queue (CAMPAIGN.md 12:35 UTC): #664 → #647 → #670 → backup-60 follow-up → W3 → FC follow-ups
(#669; W4 PRs via W1). This worker joins at the tail and never takes or renews another holder's lock.

## 3. Branch inventory

Not repeated: the 723-branch mechanical inventory at `c8e131c1`
(`docs/consolidation/feature-completion-20261125/BRANCH_INVENTORY.tsv` on `claude/feature-completion-20261125`:
A ancestor 371, B no non-doc diff 99, H open-PR owner 192, J residual 60, gh-pages 1), the 212 semantic
dispositions in [branch-comparison-20261124-68c82b9](consolidation/branch-comparison-20261124-68c82b9/HISTORICAL_DISPOSITIONS.json)
and the owner archive manifest (`docs/archive/feature-freeze-20261125.json` on #659/#667: 31 feature refs and 3 mixed
compositions frozen, 17 feature-only PRs closed, 4 held). Since `c8e131c1`, 68 new heads exist; those with open PRs are
covered by section 4. Branches without a PR created after 2026-11-24 are owned by the workers in section 2.

## 4. Open PR inventory (256, classified A–K)

Per-PR data (head ref, head SHA, residual file counts against main, historical disposition, reason):
[cloud-lead-20261125/OPEN_PR_CLASSIFICATION.tsv](consolidation/cloud-lead-20261125/OPEN_PR_CLASSIFICATION.tsv).
Method: fetch every open head; files changed since its merge-base whose blob differs from main = residual;
36 heads are ancestors of main; small-residual PRs were read semantically (32 PRs); large ones mapped to the
2026-11-24 historical dispositions. A three-way drift check was used before calling anything unique.

| Class | Count | Meaning here | PRs |
|---|---|---|---|
| A Ready for integration | 4 | recovered on this branch (R1) | #623 #626 #627 #633 |
| B Nearly complete | 2 | small semantic work left | #528 (lock scope review), #595 (test-only manual port) |
| C Partially complete / unreviewed unique source | 78 | old compositions and the #372-based privacy stacks; semantic recovery review needed | see TSV |
| D Superseded | 47 | census/handoff records, history retained in descendants, cherry-picked elsewhere (#583 → #640) | see TSV |
| E Already integrated / patch-equivalent | 44 | 36 heads are ancestors of main; 8 residuals already on main (#250 #384 #405 #409 #416 #419 #616 #617) | see TSV |
| F Useful individual changes | 1 | #442 diagnostic confidential-contracts test (not beta runtime) | #442 |
| G Deferred by release scope | 22 | F05/F10 future-only, subscriptions (#631 #637), hosting/Tor (#308 #320 #363), dependency trains, CI agents | see TSV |
| H Archived/held by owner directive | 4 | owner HOLD comments 2026-11-25 | #371 #592 #614 #621 |
| I Conflicts with current architecture | 2 | obsolete against main | #51 #319 |
| J Actively owned by another worker | 47 | section 2 owners plus FC donors (#219 #244 #252 #254 #271 #272 #310 #376 #534) | see TSV |
| K Owner decision | 5 | scope link to a stopped product or dormant future module | #248 #558 #559 #628 #634 |

**Safe-to-close candidates (owner action; nothing closed by this worker):** the 44 class-E PRs. Their heads are on
main or their only unique code is already on main in an equivalent or stricter form; #616/#617 additionally carry an
owner HOLD whose shared-core code is already on main (`seal.ts`, `qrKinds.ts` strict `=== true`).

## 5. Feature inventory (in-scope, beta)

| Feature | Source PRs/branches | Implementation | Integration | Verification | Est. % | Remaining | Ready |
|---|---|---|---|---|---|---|---|
| Release exclusion of stopped products (REL-EXCL, §11) | this branch | done | this PR | unit 10/10 + 34/34 (red without hook); real lean artifact clean; planted modules fail | 95 | hosted CI, review, merge | after CI |
| Automation fix bundle R1 (i18n quoted literals, QR clock rollback, Swiss amount locale, a11y surrogate) | #623 #626 #627 #633 | done (donor-exact) | this PR | affected suites (section 7) | 90 | hosted CI | after CI |
| F03 signed request file, Sweep consent, Solana/TRON interop, BTC spentness, receipt accessor tests | #650 #649 #648 #656 #663 (+T PRs) | done | FC #664 | hosted 40/40 on `d4bdd022`; `7b47c3dd` failed e2e lean | 85 | FC coordinator | FC |
| Independent keystore recovery (P0-KEYS) | #647, #622 | done/active | queue #2 | owner session | — | ghostpay-15 | owner |
| Invoice-link dot-segment/default-port fix | #670 | done | queue #3 | owner session | — | newghostpay-ae | owner |
| Clipboard cleanup (#286) | #553 #580 → #668 | done | W4/W1 | W4 | — | W1 merge | W1 |
| Privacy-minimal invoices, destination reuse (#287) | #585 #600, #584 #586 #610 | partial | W4 / reuse worker | — | — | owners | owners |
| P14 RPC provider disclosure evidence | #658 | done (test level T) | open | — | — | owner | owner |
| #286/#287 masking, export metadata, retention, wallet disclosure stacks | #569 #570 #571 #587 #589 #598 #606 #609 #612 #613 #619 #630 #632 | on #372 base (519 commits off main) | not started | — | UNVERIFIED | recovery map in progress (section 8) | no |
| GP-PAGES sleep/freeze/signer stacks | #544 #577 #582 #596 | partial (#641 merged GP-PAGES-02 parts) | not started | — | UNVERIFIED | recovery map in progress | no |
| Private seller scan checkpoints (FC-06) | #248 | partial, red | deferred by FC | — | — | Scan.tsx overlap with #635 | owner/FC |

## 6. Excluded products

Permanently archived: F01, F09, F13. Deferred and disabled through v1.0: F02, F04, F08, F11, F12, F14, P07 (owner
clarification). Containment now enforced at build and on the emitted artifact by REL-EXCL
(`apps/web/scripts/stoppedProducts.mjs`, `scripts/release/verify-release-exclusions.mjs`, `build-pages.sh`).
Retained shared-core mechanisms are asserted not to match (MerchantProfilePanel identity verification, Scan
reconciliation, ux-vault, payment-uri, merchant-ledger, quote). The full (non-Pages) profile still imports the
GhostID offline reviewer behind `VITE_GHOSTID_OFFLINE_REVIEW` (default off); the full profile is not the shipped
Pages artifact.

## 7. Test results (this worker)

| Revision | Command | Result |
|---|---|---|
| `32ae3977` | typecheck, lint (all) | pass |
| `a362824a` | `node --test apps/web/scripts/localBuildProfile.test.mjs` | 34/34; new case fails with the hook disabled |
| `a362824a` | `node --test scripts/tests/release-exclusions.test.mjs` | 10/10 |
| `a362824a` | `node --test scripts/pages/*.test.mjs scripts/tests/*.test.mjs` | 341 pass, 1 skip |
| `a362824a` | lean build + verifier; planted GhostID/POS report | clean (352 modules); planted fails with 2 problems |
| `8cb200f1` | `node scripts/agent/affected.mjs --run --checks typecheck,lint,test` | see PR body (filled in when the run completes) |

## 8. Remaining blockers and next units

1. Hosted CI on this branch's PR head; then join the merge queue tail under the lock.
2. Recovery map of the unclaimed #286/#287 and GP-PAGES stacks (C class) — read-only analysis in progress; results
   will be appended here and offered to W1/W3/W4 before any integration, to avoid overlap.
3. Owner decisions: section 9.

## 9. Outstanding owner decisions

| Item | Question |
|---|---|
| Close class-E PRs | 44 PRs are on main or equivalent; close them as integrated? |
| #628 ux-export CSV BOM quoting | payment-history export hardening, or F04 analytics (hold)? |
| #634 ux-links handle confusables | core handle validation, or F08 GhostID (hold)? |
| #558 #559 dormant future modules | accept onto main dormant, or keep on branch? |
| #528 policy journal lock | release the journal lock during the wallet prompt (as proposed)? |
| F02/F04 wording | see #667: "deferred and disabled for beta/v1.0", restartable only by new instruction? |
