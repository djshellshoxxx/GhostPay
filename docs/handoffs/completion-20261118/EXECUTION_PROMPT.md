# GhostPay — cooperative completion, audit and security-closure run

Paste everything below the line into a new Claude Code session that has push access to `djshellshoxxx/GhostPay`.
Written 2026-11-18 against `main` = `5467c158` (merge of PR #203). Every SHA, count and path below is a starting point
recorded on that date, not a guarantee. Re-verify each one before you act on it.

---

## 0. Mission and the one rule that overrides everything else

You are the **lead coordinator** of a multi-agent engineering run on GhostPay
(<https://github.com/djshellshoxxx/GhostPay>). Your job:

1. Finish every unfinished feature that can be finished without the owner.
2. Merge every branch that still holds unique, valuable work.
3. Close every finding from every security scan and review that engineering can close.
4. Run independent audits, bug hunts, security checks and a missing-code audit, and fix what they find.
5. Deliver everything as **one integration PR** that merges cleanly with the other sessions working in this
   repository at the same time.

**Cooperation overrides speed.** Other Claude, Codex and ChatGPT sessions are writing to this repository while you
run. You must never overwrite, rewrite, force-push, duplicate or race their work. When you are unsure who owns
something, treat it as owned by someone else: read it, never write it, and record the question.

Read `CLAUDE.md`, `AGENTS.md`, `docs/ai/WORKFLOW.md` and `docs/ai/HANDOFF.md` first, and follow them where they are
stricter than this prompt.

## 1. Phase 0 — recover the live state (read-only, before any write)

Run `git fetch --all --prune`, then establish and write down the following:

1. The current `origin/main` SHA and its last 20 commits.
2. Every open PR (`gh api 'repos/djshellshoxxx/GhostPay/pulls?state=open&per_page=100' --paginate`): head, base,
   draft state, last update, CI conclusion **on its exact head SHA**.
3. Every remote branch with commits that are not in `origin/main`, its last commit time and author, and whether it
   maps to an open PR.
4. **Active-work detection.** Treat a branch as ACTIVE and owned by another session if any of these hold:
   - it has commits in the last 24 hours;
   - it is claimed in `docs/ai/ACTIVE_WORK.md`, on `main` or on any open PR head;
   - it belongs to a known automated writer: `chatgpt/zero-codex/*`, `chatgpt/*`, `codex/*`, `dependabot/*`, or
     `automation/*`;
   - an open PR on it was updated in the last 24 hours.

   ACTIVE branches are **read-only inputs** for the whole run. You re-check their heads before you depend on them.
5. Sessions known to be active when this prompt was written. Verify each one; do not assume:

   | Ref | What it is | How to cooperate |
   |---|---|---|
   | `nodata/zealous-hopper-lr0nxe` | Post-consolidation audit of the #203 candidate, WIP. It writes `docs/handoffs/post-consolidation-20261118/**`: `POST_CONSOLIDATION_AUDIT.md`, `FEATURE_COMPLETION_MATRIX.md` (192 features), `BRANCH_RECOVERY_MATRIX.md` (234 refs), `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md` (49 SEC rows), `BLOCKERS_AND_DECISIONS.md` (OD-01..19, OA-01..07, TB-01..03), and later its own strategy, plan and execution prompt | Treat its documents as the **primary backlog**: read them from that branch or from `main` once they merge. Never edit its directory. If its execution prompt or plan has landed, adopt its task IDs and lane split. Use this prompt only for the cooperation rules and for the extra audits it lacks. If it has started executing, claim only lanes it has not claimed. |
   | `claude/ghostpay-consolidation-9xhtxg` | Merging PR #204 (agent guide, package map, `affected-checks` and `security-invariants` skills) into the consolidated tree | Do not touch `CLAUDE.md`, `AGENTS.md`, `docs/ai/**` tooling files, `.github/workflows/ci.yml` or the package map until it lands. Afterwards, merge `main` and **use** its skills. |
   | `chatgpt/zero-codex/*` | External rotation automation (Pages fixes, audits) | Read-only. Integrate a branch only per the disposition ledger, after re-checking its head and CI. |

6. Read, in this order:
   1. `docs/handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md`
   2. `docs/handoffs/consolidation-20261118/` (`NEXT_PHASE_QUEUE.md`, `REVIEW_FINDINGS.md`,
      `BRANCH_DISPOSITION_LEDGER.md`, `RETIREMENT_PLAN.md`, `PROMOTION_PACKET.md`, `VALIDATION_MATRIX.md`)
   3. the post-consolidation audit package (item 5)
   4. `docs/audits/**` dispositions
   5. `docs/ai/ACTIVE_WORK.md`
7. Produce the **task ledger** (§4) from those sources before planning any implementation. Do not mistake code on an
   unmerged branch for missing code, and do not mistake an open PR for validated work.

## 2. Phase 1 — claim your scope before you write

1. Create the integration branch `claude/completion-<YYYYMMDD>-<short-slug>` from the current `origin/main`. If your
   session has a designated branch, use that name instead. Never reuse a branch whose PR has already merged.
2. Make the first commit a **claim**. Add a dated section at the top of `docs/ai/ACTIVE_WORK.md` naming:
   - the coordinator session;
   - the integration branch;
   - each worker lane, with its branch and its **exact owned paths**;
   - the acceptance condition for each lane;
   - what is out of scope.

   Mark every path owned by an ACTIVE session (Phase 0) as **excluded**.
3. Push and immediately open a **draft PR** to `main` titled `Completion run <date>: claims + integration`, so that
   other sessions can see your claim. Subscribe to its activity.
4. Before each lane starts, and again before each lane is integrated, re-fetch and check that no other open PR or
   ACTIVE branch has touched the lane's paths since the claim. If one has, stop that lane. Then either rebase the
   lane's plan on that work or hand the overlap to its owner, and record which you did.

## 3. Phase 2 — workers

Use as many parallel workers as the environment reliably supports, and no more than the tasks need. Each worker gets:

- its own branch, `claude/completion-<date>/<lane>`, created from the integration branch, in its own worktree;
- exclusive owned paths;
- a bounded brief with these sections: TASK | SCOPE | CONSTRAINTS | RESULT | EVIDENCE | BLOCKERS;
- explicit completion criteria.

Workers commit only inside their owned paths. Only the coordinator integrates: it merges lane branches into the
integration branch with `--no-ff` merge commits, after independent review. Use cheaper models for mechanical work
(docs, test scaffolding, string extraction). Use the strongest model for cryptography, contracts, security and
integration.

| Lane | Responsibility | Primary sources |
|---|---|---|
| **A — Consolidation** | Merge or port every branch that still needs disposition: the 4 "integrate" refs and 1 "selectively port" ref in `BRANCH_DISPOSITION_LEDGER.md`, plus everything the post-consolidation `BRANCH_RECOVERY_MATRIX.md` marks recoverable, plus every ref created after those censuses. Use ancestry, `git cherry` patch identity, tree comparison and semantic reading, never names or titles alone. Reproduce red CI before you port (for example, #202's e2e failures). Preserve provenance with `cherry-pick -x` or merge commits. | `docs/handoffs/consolidation-20261118/`, post-consolidation `BRANCH_RECOVERY_MATRIX.md` |
| **B — Security-finding closure** | Close every security-scan and review note that engineering can close (§5). | `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md` (SEC-01..49), `REVIEW_FINDINGS.md` (R-*, FR-*), `docs/audits/**`, scanner outputs |
| **C — Feature completion** | Finish every decision-independent unfinished feature: spec 18 K01–K06 and KC (apply the OD-10 recommendation, and ship the fail-closed defaults for OD-01, OD-02 and OD-09: no secret export in a vault-less session, no clipboard path, the stricter passphrase floor); the code-side preparation for B01–B06 (doc/script drift such as `validate:deployments`, the origin-gate hardening TB-03, the local-proxy scan path TB-02); any feature the completion matrix rates partial without an owner gate. Split C into sub-lanes by package. | `NEXT_PHASE_QUEUE.md`, `FEATURE_COMPLETION_MATRIX.md`, `docs/specs/**` |
| **D — Bug hunt** | One finder per subsystem (`core-crypto`, `chain-adapters`, `invoice-schema`, `scan`/`reconciliation`, `relayer`/`pool-relayer`, contracts, web views/session/keystore, CLI, `ops-monitor`, BTC/SOL/TRON experimental). Every candidate bug needs a concrete failing input and must survive an adversarial verifier before it is fixed. Loop until two consecutive rounds find nothing new. | the code |
| **E — Security check (fresh)** | An independent security pass that does **not** read lane B's or the audit's conclusions first. It covers: key and secret handling, signature and replay, chain/asset/amount binding, payment-status spoofing, malicious RPC, reorgs, cross-origin messaging and embed, XSS and injection, CSP, storage and metadata leaks, dependency and supply chain, workflow permissions and secrets, and contract invariants. Compare its results with lane B's afterwards; disagreements go to a third reviewer. | the code, threat models |
| **F — Missing-code and integrity audit** | Find every place where the repository claims something the code does not do, or where code is incomplete: stubs, TODO/FIXME/XXX, `throw new Error('not implemented')`, empty handlers, unreachable feature flags, docs or README commands with no matching script, specs with no implementation and no "proposed" label, exported APIs with no callers or no tests, tests that are skipped or assert nothing, i18n keys used but missing (and the reverse), locale selector entries with no catalog, CI jobs that silently skip, release-gate steps that cannot pass (TB-01). Rank each item; fix it or record it with evidence. | the whole tree |
| **G — Independent review** | Reviews every lane diff before integration, never its own. Includes a final combined-tree review. | lane diffs |
| **H — CI, tests and release qualification** | Keeps the integration branch green; reproduces each CI failure locally first; fixes root causes, never by skipping a test; owns `release.yml` verify parity (TB-01) once lane C does not hold it. | `.github/workflows/**`, test configuration |

Reassign a worker as soon as it finishes. When no implementation task remains, move workers to testing, review,
bug hunting or missing-code work.

## 4. Task ledger (the coordinator owns it; keep it in the integration branch)

Write it to `docs/handoffs/completion-<date>/LEDGER.md`. Record one row per item with these columns:

| Column | Contents |
|---|---|
| ID | Use the source ID where one exists: SEC-, R-, FR-, K, B, D, OD-, TB-, F-* |
| Requirement | What must be true when the item is done |
| Status | done / in progress / blocked / not started |
| Branch | Branch that holds the work, or the branch it came from |
| Owner | Lane that owns it |
| Evidence | Test names, commands and the SHA they ran at |
| Human needed | Yes or no, and why |

Every completion percentage you report must be computed from this ledger. Never estimate it.

## 5. Security closure — "every scan note fixed" means this, exactly

Build `docs/handoffs/completion-<date>/SECURITY_CLOSURE.md` with one row for **every** note from each of these
sources:

- SEC-01..49 (post-consolidation audit), R-* and FR-* (consolidation review), and the dispositions in
  `docs/audits/**`;
- CodeQL: read open alerts with `gh api repos/djshellshoxxx/GhostPay/code-scanning/alerts?state=open --paginate` if
  the API allows it; otherwise use PR check-run annotations;
- Dependabot alerts and `npm audit --omit=dev`, plus the full `npm audit` for dev tooling;
- secret scanning, plus the repository's own `npm run ci:scan-secrets`, `ci:check-actions` and `ci:check-tx-origin`;
- Slither, Mythril and Echidna results and their disposition files;
- Snyk and SonarCloud. SonarCloud has failed "Security Rating on New Code" on several past PRs. Its issue list cannot
  be read from cloud sessions (sonarcloud.io returns a proxy 403). Try once. If it is blocked, record exactly what the
  owner must open or allow.
- every finding this run produces (lanes D, E and F).

Each row ends in exactly one state:

| State | When to use it |
|---|---|
| **Fixed** | You have a RED-first regression test (fails before, passes after), the fix commit, and passing affected suites on the integration head. |
| **False positive / intended** | You record the code-path evidence and a second reviewer agrees. |
| **Owner-gated** | The fail-closed default is shipped and tested, and the decision row names the exact owner action (OD- or OA-). |
| **Access-blocked** | You record the exact command and its error, and the owner action that unblocks it. |

Never mark a row Fixed because a scanner job is green; a passing scanner job is not issue closure. Never lower a
severity. The run is not done while any row is still open and engineering could close it.

## 6. How the work is tested and integrated (TDD and evidence)

For every change:

1. Reproduce the behaviour or defect.
2. Write a failing test.
3. Confirm it fails for the expected reason.
4. Fix it.
5. Confirm it passes.
6. Run adjacent suites, typecheck and lint.
7. Commit, quoting the evidence in the commit message.

Use the affected-checks skill from #204 once it is on `main`. Before every lane merge, and again before marking the
PR ready, run at the integration head:

- `npm ci --ignore-scripts`;
- `npm run build:libs`;
- root `npm run typecheck` and `npm run lint`;
- the i18n check and extract;
- every workspace test suite;
- web Playwright in both the lean and full profiles;
- forge build and test;
- the relayer anvil e2e;
- the secret scan and the actions check.

Blocked tools: pinned Foundry and solc can be fetched from their GitHub releases (verify the checksum against the
repository pins). Chromium is pre-installed. A suite that cannot run because the network policy blocks it is recorded
as **blocked**, with the error. It is never recorded as passed.

A green CI run on an older head does not qualify a newer head. Do not rerun identical failures: diagnose, change
something, then retry.

## 7. How your work joins everyone else's

- Merge `origin/main` into the integration branch at least at every lane integration, and immediately when `main`
  moves. Use merge commits; never rebase or force-push a shared branch.
- If another session's integration PR is still open and touches the same files, sequence the two: whichever was
  claimed first goes first, and the other merges `main` after it lands. Record the order in both PR descriptions.
  Where the overlap is a few files, open a small PR against *their* branch only when their claim allows it. Otherwise
  hand them the patch file and the reason.
- When the post-consolidation audit's plan lands, map every ledger row to its task IDs. Mark rows it owns as
  `owned by <their session>`, and do not implement them twice.
- Never close a PR, delete a branch or tag, or retire anything. RETIREMENT_PLAN and OD-19 belong to the owner. Produce
  the disposition evidence the owner needs.
- Never merge into `main` yourself, never bypass branch protection, and never self-approve. The owner merges the
  integration PR.

## 8. Hard product constraints (never violate)

- static, client-only lean bundle; noncustodial; no telemetry; no silent or fallback network requests;
  user-selected providers only;
- no automatic clipboard, no secret in logs, URLs, storage or errors; fail-closed private-required mode;
- a seller signature is never proof of payment, and an invoice is never paid because a transaction was submitted;
- trust-model labels stay honest: trusted-server, header-chain, SPV and full validation are different things;
  never call header sync SPV;
- the lean/full profile boundary holds: the lean bundle imports no relayer, operator or CLI runtime;
- no real funds, no mainnet, no deployment, signing or release publication, no new custody or authority surface,
  and no invented owner decisions.

## 9. Checkpoints, handoff and stopping

- Every 2–3 hours, or after each integration, update the PR description and `LEDGER.md` with:
  - the starting SHA and the current integration SHA;
  - which lanes are active, done or blocked;
  - which items are done and which remain;
  - test results with commands and the SHAs they ran at;
  - security-closure counts by state;
  - the next actions.
- Stop when one of these holds:
  - **A:** every engineering-closable ledger and security row is closed and integrated, and the integration head is
    green on every check engineering controls;
  - **B:** you reach a hard time, context or quota limit;
  - **C:** everything left needs owner action.
- Before you stop:
  1. push everything;
  2. write `docs/handoffs/completion-<date>/HANDOFF.md` containing the exact resume commands, the unfinished rows with
     their dependencies, and the owner checklist (OD-/OA- items with recommendations);
  3. remove or close your claim section in `docs/ai/ACTIVE_WORK.md`;
  4. mark the PR ready only when its head is green.
- Never report a test as passed, a finding as fixed, or worker activity unless it actually happened. This is an
  AI-assisted review, not a professional audit; say so.
