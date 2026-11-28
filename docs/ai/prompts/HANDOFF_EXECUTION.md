# Execution prompt: GhostPay handoff run

Use this prompt to run one bounded improvement cycle from [../HANDOFF.md](../HANDOFF.md). It is the procedure. The handoff is the snapshot. Re-verify both before acting.

## Authority and limits

- Repository: djshellshoxxx/GhostPay. Work only on a task branch, never on main.
- Agents: at most five in total. One coordinator plus up to four Haiku workers. Every agent, replacement and reviewer runs on Haiku. Do not create nested workers.
- Scope: the owner stop-work directive in [../STOP_WORK_20261125.md](../STOP_WORK_20261125.md) and [../../../AGENTS.md](../../../AGENTS.md) binds every task. Stopped products stay stopped. Shared-core privacy, payment and recovery behavior is preserved, not reduced.
- Never force-push, rewrite shared history, delete branches or refs, deploy, or use real wallets or funds.
- A merge to main is allowed only at a completed milestone and only through the merge gate below.

## 1. Discover (read-only)

Run these and record the results in the working notes:

```bash
cd /home/user/GhostPay
git fetch origin --quiet
git rev-parse --short origin/main
git rev-list --left-right --count origin/main...HEAD
git log --oneline -5 origin/main
```

Then:

- Open PRs: call `mcp__github__list_pull_requests` with `owner: djshellshoxxx`, `repo: GhostPay`, `state: open`, `perPage: 100`, `fields: ["number","title","draft","updated_at"]`. Treat every open PR as an active claim until verified otherwise. To check one branch, pass `head: djshellshoxxx:<branch>`.
- Main CI: call `mcp__github__actions_list` with `method: list_workflow_runs`, `owner`, `repo`, `workflow_runs_filter: {"branch":"main"}`, `perPage: 6`. Confirm each run's `head_sha` equals `origin/main`, and read its `status` and `conclusion`. A `queued` or `in_progress` run is not green. For a failure, call `mcp__github__get_job_logs` with `run_id` and `failed_only: true`, and record the job and the first error line.
- PR review state: call `mcp__github__pull_request_read` with `method: get_reviews` and `method: get_review_comments`, plus `pullNumber`. The GitHub CLI is not available on this runner; use these MCP tools.
- Read [../ACTIVE_WORK.md](../ACTIVE_WORK.md) for claims on the paths you might touch.
- Read [../STOP_WORK_20261125.md](../STOP_WORK_20261125.md) for stopped and deferred scope.

## 2. Screen (a task must meet every criterion)

A task qualifies only when all of these hold:

1. A real defect, incomplete requirement or objectively stale statement is supported by evidence (a command output, a file line, a CI log).
2. The expected behavior is already documented or established by existing code.
3. The repair follows a local pattern in the repository.
4. Acceptance can be checked by a command or observable result.
5. No open PR or ACTIVE_WORK claim covers the same paths.
6. It does not touch a protected area: cryptography, key handling, signing, vault or session authority, payment state or amounts, transaction journals, storage schemas and migrations, privacy guarantees or disclosure wording, CI or security gates, dependency upgrades, stopped products, or owner-deferred work.

Cheap read-only screens, which need no install:

```bash
# Relative markdown links. Expect known non-defects (vendored OpenZeppelin links,
# and a math-notation string inside backticks, which the naive scanner reports).
python3 - <<'PY'
import os,re,urllib.parse
pat=re.compile(r'\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
bad=[]
for dp,dn,fn in os.walk('.'):
    if '.git' in dp.split(os.sep) or 'node_modules' in dp.split(os.sep): continue
    for f in fn:
        if not f.endswith('.md'): continue
        p=os.path.join(dp,f)
        for ln,line in enumerate(open(p,encoding='utf-8',errors='ignore'),1):
            for m in pat.finditer(line):
                t=m.group(1).strip('<>')
                if re.match(r'^(https?:|mailto:|#|tel:|data:)',t): continue
                path=urllib.parse.unquote(t.split('#')[0].split('?')[0])
                if not path: continue
                tgt=os.path.normpath(os.path.join(dp,path))
                if not os.path.exists(tgt): bad.append((p,ln,t))
print("broken:",len(bad))
for b in bad: print(*b)
PY

# Translation catalogs: errors must be 0. Warnings are translation work, not assignments.
node scripts/i18n/check.mjs

python3 - <<'PY'
import os,re
imp=re.compile(r'''(?:from\s+|import\s*\(|import\s+)(?:'|")(\.{1,2}/[^'"]+)(?:'|")''')
bad=[]
for root in ['scripts','apps/web/scripts','test-vectors','tools']:
    for dp,dn,fn in os.walk(root):
        if 'node_modules' in dp: continue
        for f in fn:
            if not f.endswith(('.mjs','.js','.cjs','.ts')): continue
            p=os.path.join(dp,f)
            for i,l in enumerate(open(p,encoding='utf-8',errors='ignore'),1):
                for m in imp.finditer(l):
                    base=os.path.normpath(os.path.join(dp,m.group(1)))
                    c=[base,base+'.mjs',base+'.js',base+'.ts',base+'.cjs',os.path.join(base,'index.mjs'),os.path.join(base,'index.js'),os.path.join(base,'index.ts')]
                    if not any(os.path.isfile(x) for x in c): bad.append((p,i,m.group(1)))
print("missing relative imports:",len(bad))
for b in bad: print(*b)
PY
```

Flags of `packages/*/dist` imports are expected until `npm run build:libs` has run. Review each flag in source before reporting it.

If a screen reports something new, verify it in source before creating a task. Do not turn a scanner false positive into work.

## 3. Claim

Before any edit, add an entry at the top of [../ACTIVE_WORK.md](../ACTIVE_WORK.md) on the task branch with:

- worker, branch, base SHA;
- owned paths (exact files);
- the evidence and the acceptance command;
- forbidden changes.

## 4. Worker card (one microtask per worker)

Give each Haiku worker only this:

- goal (one behavior);
- base SHA and the evidence;
- owned files and forbidden files;
- an existing pattern or file to follow;
- the exact acceptance command;
- the report format in section 7.

Workers do not start audits or choose other work.

## 5. Implement and verify

- One branch per task. Commit small and coherent changes. Use the repository's commit trailer convention.
- Add a regression test for every behavioral fix. Never weaken an assertion, add a skip, raise a timeout arbitrarily, lower a coverage threshold or regenerate a snapshot blindly.
- Toolchain: `npm ci --ignore-scripts && npm run build:libs` first, then the affected checks from [../../../CLAUDE.md](../../../CLAUDE.md). Use `node scripts/agent/affected.mjs` when it applies. Report skipped checks explicitly.
- Stop the task and return it to the coordinator if: requirements become ambiguous, protected behavior is involved, a failure is unexplained, or two focused repair approaches fail.

## 6. Review and merge gate

A milestone is complete only when these steps pass, in this order:

1. Update the branch from main by merging main into it. Never rebase a shared branch. Do this before the final review.
2. An independent Haiku reviewer, who is not the author, reviews the exact final head against the diff and the evidence. Any push after a review invalidates that review. Review the new head.
3. Every finding is fixed, or answered with evidence that it does not apply. Any fix returns to step 2.
4. CI is green on the exact final head: the run's `head_sha` equals the PR head and its `conclusion` is `success`. A queued, in-progress, cancelled or red run is not green.
5. Mark the PR ready (draft off).
6. Merge manually through the PR. Never enable auto-merge. Do not merge if any step fails, if the review predates the head, or if the change touches a protected area.
7. After the merge, check the main CI runs on the merge commit and record them. Report a failing main run; do not ignore it.

Record the merge commit, the head SHA that was reviewed and tested, and the checks actually run.

## 7. Report

Report in this table. Never claim an unrun check passed.

| Task | Evidence | Files | PR and head SHA | Checks actually run | Status (merged, ready, blocked) |
|---|---|---|---|---|---|

Separately list findings left for a later owner, with path, evidence and the next investigation.

## 8. Update the handoff

When the run ends, replace [../HANDOFF.md](../HANDOFF.md) with the new source-pinned state: base SHA, CI state, screen results, tasks and outcomes, and the next action. Keep it short. Do not carry a stale open-PR census.
