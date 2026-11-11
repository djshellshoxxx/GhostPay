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
  npm ci && npm run build:packages && npm run typecheck && npm run lint
  npm test -w <each touched workspace>
  (cd packages/<touched-contracts-pkg> && forge build && forge test --match-path '<touched tests>')
     only if packages/contracts, pool-contracts or payer-hiding-contracts touched
  bash scripts/scan-secrets.sh && bash scripts/check-actions-pinned.sh
Report exact commands and pass/fail counts. Never claim a check you did not run.
(build:packages runs before typecheck because workspace typechecks resolve built library output, as the
CI setup-node-libs action does. Root lint takes about 10 minutes; lint only touched workspaces with
npm run lint -w <ws> while iterating, run root lint once before reporting.)

CAVEMAN RULES (if the caveman skill is loaded, use it at default intensity instead): drop articles,
filler and pleasantries; fragments OK; keep every identifier, path, SHA, command, error and number
exact; one fact per line. Report shape:
  TASK | SCOPE | RESULT | EVIDENCE | BLOCKERS | NEXT
Max 25 lines back to the lead; details go in your lane file.
