# GhostPay: consolidate branches and keep building in parallel (prompt)

Status: prompt only. It grants no merge-to-main, release, deployment or real-funds authority by itself.
Snapshot taken 2026-11-04 against `origin/main` = `0014bc5`. Workers must recompute everything from git; the
tables below are a starting map, not the truth.

## How to launch

1. Start a fresh Claude Code cloud session on `djshellshoxxx/GhostPay` (Opus for the lead).
2. If you want more than ~10 agents in one workflow, raise "Dynamic workflow size" in `/config` first.
3. Paste everything inside the fence below as the first message. The words "use a workflow" in it are the
   explicit opt-in for multi-agent orchestration.

```text
ROLE
You are the integration lead for djshellshoxxx/GhostPay only. Goal: fold as many open branches/PRs as
possible into ONE verified consolidation branch, while independent workers advance the backlog in
parallel. Use a workflow and as many workers as the work needs (fan out; do not serialize independent
lanes). You own integration, conflict resolution and final verification; workers own only their lane.

HARD LIMITS
- Never push to main, never force-push or rewrite any branch you did not create, never delete remote
  branches or tags, never merge a PR to main. Leave the final main PR for the owner.
- Closing a superseded PR is allowed ONLY with proof in the ledger (ancestry or patch-equivalence or
  per-path tree equality) and a short comment linking the consolidation PR. When in doubt, leave it open.
- No releases, deployments, real funds, secrets in logs/commits. No test skipping, no weakened
  assertions, no raised deadlines, no coverage-gate changes to get green.
- Security fixes are never dropped in a conflict. If two sides disagree on security behavior, keep the
  stricter one and record it.
- Commits/PR bodies/docs: normal English. Caveman is ONLY for agent-to-agent traffic and agent reports.

PHASE 0 — LEAD, BEFORE ANY FAN-OUT (sequential, ~10 tool calls)
1. Caveman: try, in order, stopping at first success:
     claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman
     npx skills add JuliusBrussee/caveman -g
   (Apache-2.0; do not vendor it into the repo.) Read its SKILL.md for `caveman` and `cavecrew` before
   use. If install fails or the skill is not loaded in this session, use the inline CAVEMAN RULES in the
   common prefix below. Do not retry the install more than once.
2. git fetch --all --prune. Record BASE=$(git rev-parse origin/main) and every remote branch tip SHA into
   docs/handoffs/consolidation-2026-11-04/LEDGER.md (one table: branch | tip | PR | ahead/behind main |
   in-accepted? | lane | disposition | evidence). This file, not chat, is the shared state.
3. Create branch claude/consolidation-2026-11-04 from origin/integration/ghostpay-accepted-20261102
   (PR #47 head; it already contains autonomous-completion, codex consolidation-20261030, portable kit,
   cool-albattani, adoring-wozniak and the pr30/pr31/pr37 backups). Merge origin/main into it first;
   resolve, run the FAST GATE, push. Every lane merges into this branch only through the lead.
4. Write the COMMON PREFIX below to docs/handoffs/consolidation-2026-11-04/PREFIX.md and commit it once.
   Never edit it during the run (editing it breaks the prompt cache for every worker).

PROMPT CACHING RULES (apply to every agent() / Agent call)
- Every worker prompt = the COMMON PREFIX copied byte-for-byte, then a blank line, then "LANE:" and the
  lane-specific task. All variable data (SHAs, PR numbers, file lists, dates) goes AFTER "LANE:" or in
  the ledger, never in the prefix. No timestamps or random ids in the prefix.
- Workers that need the lead's full context: spawn as subagent_type "fork" (shares the lead's cache).
  Independent workers: fresh agents with the identical prefix (they share the prefix cache with each
  other). Group lanes by model; same-model workers share cache, mixed models do not.
- Do not edit CLAUDE.md, settings or the prefix file mid-run. Keep waves inside the 1-hour cache TTL;
  launch a wave's workers in one message so they hit a warm cache together.
- Workers read files by range (grep first), write bulk output to files under
  docs/handoffs/consolidation-2026-11-04/lanes/<lane>.md, and return only a caveman summary + path.

MODEL ROUTING
- haiku: inventory, patch-equivalence triage, docs dedupe, dependabot rebase checks.
- sonnet: code merges with ordinary conflicts, test fixes, i18n, e2e.
- opus (lead and security lanes): crypto/relayer/secret handling, conflicting security behavior,
  contract changes, final integrated review.
Escalate a lane one tier after one failed attempt with no new evidence; do not retry blindly.

===== COMMON PREFIX (copy verbatim into every worker) =====
You are a worker on djshellshoxxx/GhostPay consolidation. Shared state lives in
docs/handoffs/consolidation-2026-11-04/LEDGER.md; read it first, by range. Integration branch:
claude/consolidation-2026-11-04 (lead merges; you never push to it). Work on your own branch named
claude/cw-<lane> cut from the integration branch tip named in your LANE block. Own only the files your
lane names; if you must touch another lane's file, stop and report a BLOCKER instead.

Rules: no force-push to branches you did not create; no push to main; no PR merges; no deleting
branches; no skipped tests, weakened assertions, raised deadlines or gate changes; no secrets in output.
Keep the stricter behavior in any security conflict and say so. Reproduce a failure before fixing it.
Prefer existing code in the repo over new code. Commits and PR text in normal English, Conventional
Commit style, ending with the session's attribution lines.

Triage method for "is this branch already in?": git merge-base --is-ancestor; then git cherry -v
<target> <branch>; then git range-diff for rewritten stacks; then per-path git diff <target> <branch>
-- <path> for anything still unmatched. Disposition is one of: IN (ancestor), EQUIV (patch-equivalent),
SALVAGE (unique wanted change; list commits/paths), SUPERSEDED (newer code replaces it; cite where),
REJECT (unwanted; give reason), OWNER (needs owner decision). Every disposition cites evidence.

FAST GATE (run on what you changed before reporting done):
  npm ci && npm run typecheck && npm run lint && npm run build:packages
  npm test -w <each touched workspace>
  (cd packages/<touched-contracts-pkg> && forge build && forge test --match-path '<touched tests>')
     only if packages/contracts, pool-contracts or payer-hiding-contracts touched
  bash scripts/scan-secrets.sh && bash scripts/check-actions-pinned.sh
Report exact commands and pass/fail counts. Never claim a check you did not run.

CAVEMAN RULES (if the caveman skill is loaded, use it at default intensity instead): drop articles,
filler and pleasantries; fragments OK; keep every identifier, path, SHA, command, error and number
exact; one fact per line. Report shape:
  TASK | SCOPE | RESULT | EVIDENCE | BLOCKERS | NEXT
Max 25 lines back to the lead; details go in your lane file.
===== END COMMON PREFIX =====

WAVE 1 — CONSOLIDATION LANES (parallel; lead merges results in the order listed)
C0 haiku  Inventory: fill LEDGER.md dispositions for EVERY non-main remote branch using the triage
          method. Output ledger rows only. Do this first; others may start in parallel from the
          snapshot map below and correct when C0 lands.
C1 sonnet ar-* stack onto integration. Base #59 (claude/ar-a0-pr47-green, A0 typecheck fix) first,
          then independent PRs one branch each: #60 C2 qr-pairing, #61 A6 combined-backup,
          #62 B1 core-journey, #63 C7 embed-iframe-e2e, #64 B2' lean-bound-receipts, #65 A7
          policy-send-guard, #70 A5 announcer-budget, #71 C1 reconciliation ADR, #72 B5 feeds (docs),
          #73 C5 device-matrix, #74 A4 btc-headersync. Then the linear i18n stack in order:
          #66 C4a pay -> #67 C4b scan -> #68 C4c create + B4 buffer -> #69 B3' sweep permits
          (merge the top, #69, after confirming it contains the lower three). Split C1 into
          sub-workers (one per PR group) if conflicts are independent; A4/A5/A7 go to opus.
C2 opus   Older security/relayer chain not in accepted: #40 codex/ghostpay-security-audit-20261030
          (relayer secret-file race fix — must land), #39 claude/gifted-planck-115x2k (audit 24
          follow-ups), #44 claude/happy-maxwell-onl4x5, #43 claude/haiku-wave-2-handoff-qepfoe.
          Salvage unique commits onto integration; prove nothing security-relevant was dropped.
C3 haiku  Pre-10-28 recovery branches: ghostpay-cloud-recovery-2026-10-26, ghostpay-offline-deps-
          2026-10-27, ghostpay-sbom-repro-2026-10-27, ghostpay-local-lean-boundary-20261027,
          codex/ghostpay-recovered-lean-checkpoint-20261028, codex/ghostpay-resume-20261028,
          checkpoint/ghostpay-source-reconciliation-20261101, claude/laughing-bardeen-4t20ys,
          claude/remote-extensions-10. Expect mostly EQUIV/SUPERSEDED (see docs/CONSOLIDATION_STATUS.md
          and docs/handoffs/SOURCE_RECONCILIATION_2026-11-02.md); SALVAGE only proven-unique wanted code,
          hand any code salvage to a sonnet sub-worker.
C4 haiku  Docs/research/handoff PRs: #75 deep research, #54-#57 codex research lanes, #58 autonomous
          prompt, #42 sharp-bohr prompts, claude/friendly-turing-1ui0on (autonomous run log). Dedupe
          into docs/research/ and docs/handoffs/; one index entry in docs/INDEX.md; no content loss.
C5 sonnet Dependencies: #45 npm minor/patch, #49 follow-redirects -> rebase-test on integration and
          include if FAST GATE passes. #34 npm-major and #32 foundry-toolchain: re-run; include only
          if fully green, else record reproduced failure as OWNER (they were deferred before).
C6 opus   CI/automation PRs #51 (twice-daily API-funded backlog), #52 (four API-funded QA agents) and
          fix/ghostpay-cloud-api-secret-aliases-20261103: review for secret exposure, permissions:,
          pinning, cost and concurrency. Do NOT merge into consolidation; produce a review in the lane
          file and mark OWNER with a recommendation.

WAVE 1 — PARALLEL BUILD LANES (start at the same time; touch no file a C-lane owns)
Lead: before launch, pick 3-6 items from docs/audits/08-completion-gates.md, the open-item lists in
#75 and docs/handoffs/AUTONOMOUS_COMPLETION_PROMPT_2026-11-04.md (on #58), excluding anything a C-lane
or open PR already covers. Give each a W-lane with an explicit file-ownership list and acceptance
check. Always include:
W1 sonnet CI speed: measure job/step durations of recent CI runs (GitHub MCP actions_list/actions_get,
          or `gh api repos/djshellshoxxx/GhostPay/actions/runs/<id>/jobs` where gh is allowed); fix the
          slowest step first, add concurrency groups (not on release/publish), paths-ignore for docs,
          build once and share via upload/download-artifact, first-party actions only. Report
          before/after timings. Owns .github/workflows/ci.yml, integration.yml, nightly.yml only.
W2 opus   Running security review of the consolidation branch as lanes land: diff vs main, focus on
          key handling, relayer guard, secret loading, scanner cursors, permit fallback, iframe embed
          origin checks. Findings with severity/evidence/fix into lanes/W2.md; fixes go back through
          the owning lane.

INTEGRATION (lead, continuous)
- Merge lane branches into claude/consolidation-2026-11-04 as each reports done, smallest/safest
  first; run FAST GATE after each merge; push; update LEDGER.md. If a merge breaks the gate, revert
  that merge locally, hand the failure (first error line, command) back to the lane, keep going.
- When C-lanes finish: run the full gate (npm test, npm run test:e2e -w @ghostpay/web, and in each
  touched contracts package: forge test, forge fmt --check, scripts/check-natspec.sh, plus any other
  step listed in .github/workflows/ci.yml for that package), open a DRAFT PR
  claude/consolidation-2026-11-04 -> main with the ledger summary, subscribe to it, and fix CI red.
- Retarget or close superseded PRs only per HARD LIMITS. #47 and #59 stay open until the owner
  merges the consolidation PR (note in each that it is superseded by the consolidation PR).
- Run WAVE 2 with any W-lanes still worthwhile and any SALVAGE work discovered, same prefix.

DONE WHEN
- Every remote branch has a ledger disposition with evidence; every IN/EQUIV/SALVAGE branch's wanted
  content is in the consolidation branch; OWNER items listed with a one-line question each.
- Consolidation draft PR is green on hosted CI, or the remaining red is diagnosed with the first error.
- W-lane results are on their own draft PRs or merged into consolidation, with verification stated.
- Final report to the owner (normal English): merged, closed (with proof), deferred, OWNER questions,
  security findings, CI before/after timings, token/agent count used.
```

## Snapshot map (2026-11-04, `main` = `0014bc5`)

| Group | Branches / PRs | State vs `integration/ghostpay-accepted-20261102` (PR #47) |
| --- | --- | --- |
| Already contained | autonomous-completion-y4sk2h, codex/ghostpay-consolidation-20261030, portable-hosting-kit, cool-albattani-xopr89, adoring-wozniak-850ue6, backup/pr30, backup/pr31, backup/codex-observed-pr37, work/consolidation-review-20261025 | Ancestors of PR #47 head |
| Fully in `main` (0 ahead) | remote-extensions-1..9, docs-snapshot-1/2, pages-site-1, inspiring-fermat, readme-and-wiki, seller-ledger-receipt-qr, integration/consolidated-2026-10-21, work/*-10-24, docs/lean-release-handoff, checkpoint/recovery-20261102, automation/api-funded-cloud, automation/parallel-review-wave | Nothing to merge; provenance only |
| ar-* stack | PRs #59-#74 | Stacked on #59 -> #47; 1-30 commits each |
| Older security chain | PRs #39, #40, #41, #43, #44 | #41 contained; #39/#40/#43/#44 have 1-5 unique commits |
| Recovery-era branches | cloud-recovery, offline-deps, sbom-repro, local-lean-boundary, recovered-lean-checkpoint, resume-20261028, source-reconciliation checkpoint, laughing-bardeen, remote-extensions-10 | 2-105 unique commits; likely EQUIV/SUPERSEDED per earlier audits |
| Docs/research | PRs #42, #54-#58, #75, friendly-turing-1ui0on | Docs only, based on `main` |
| Dependencies | PRs #32, #34, #45, #49 | #32/#34 previously deferred with failures |
| CI automation | PRs #51, #52, fix/cloud-api-secret-aliases | Security and cost review; owner decision |

## Notes on the design

- **Prompt caching.** Claude Code caches prompts automatically. A worker gets a cache hit only when its
  prompt starts with the same bytes as an earlier one on the same model. So the prompt keeps one fixed
  common prefix, puts all variable data after it, uses `fork` workers where the lead's context matters,
  and launches each wave's workers together inside the cache TTL.
- **Caveman.** [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) is Apache-2.0. It is
  installed per session and never committed. The prefix includes inline fallback rules in case the
  skill can't be loaded mid-session. It applies only to agent-to-agent messages; commits, PRs and docs
  stay in normal English.
- **Why one consolidation branch on top of PR #47.** PR #47 already contains most of the history (it is
  330 commits ahead of `main`), and the ar-* PRs are stacked on it. Building on it avoids redoing the
  reconciliation recorded in `docs/handoffs/SOURCE_RECONCILIATION_2026-11-02.md`.
