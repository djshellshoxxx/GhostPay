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

- Read the live open-PR list (GitHub PR list, sorted by updated). Treat every open PR as an active claim until verified otherwise.
- Read the main CI runs for the current main head (`CI`, `Hosting kit`, `Push on main`). Record any failure with its job and the first error line. Do not assume a queued run is green.
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

# Relative imports in helper scripts (flags for imports of unbuilt dist/ are expected).
# Run only after reviewing the flags.
```

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

A milestone is complete only when all of these hold:

1. Each change has an independent Haiku review of the exact diff and its evidence. The reviewer is not the author.
2. Every review finding is fixed, or answered with evidence that it does not apply.
3. The branch is updated from main by merging main into it. Never rebase a shared branch.
4. CI is green on the exact head. A queued or red run is not green.
5. The PR is a draft until gates 1 to 4 pass. Then it may be marked ready.
6. Merge only through the PR. Do not merge if any gate fails, or if the change touches a protected area.

Record the merge commit, the head SHA that was tested, and the checks actually run.

## 7. Report

Report in this table. Never claim an unrun check passed.

| Task | Evidence | Files | PR and head SHA | Checks actually run | Status (merged, ready, blocked) |
|---|---|---|---|---|---|

Separately list findings left for a later owner, with path, evidence and the next investigation.

## 8. Update the handoff

When the run ends, replace [../HANDOFF.md](../HANDOFF.md) with the new source-pinned state: base SHA, CI state, screen results, tasks and outcomes, and the next action. Keep it short. Do not carry a stale open-PR census.
