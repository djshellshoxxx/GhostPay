# Agent workflow scripts (reference)

These scripts orchestrated the AI-assisted security audit (audit 24) and its fix rounds in Claude Code's Workflow tool. They run only there: the tool provides `agent()`, `parallel()`, `pipeline()`, `phase()` and `args`. They are kept here as a record of the process and its prompts, so that another agent, ChatGPT included, can follow the same method by hand or port it.

## The scripts

| Script | Process |
|---|---|
| `verify-audit-findings.js` | For each batch of lane findings, two agents work in parallel, then a third adjudicates disagreements and every High. One agent tries to refute the finding with a reproduction, and the other judges its real-world impact. |
| `audit-coverage-gaps.js` | A second audit pass over the areas the lanes did not reach. Its findings are then verified the same way. |
| `fix-audit-cluster.js` | For one cluster of findings in a prepared git worktree, the implementer first writes a test that fails on the base, then the smallest fix, then runs the cluster's checks and commits. An independent reviewer then re-runs the tests against the base and tries mutations. Revision rounds follow until the reviewer approves. |

## Arguments

- `args.scratch`: a scratch directory outside the repository.
- `args.trailer`: the commit trailer lines, if the session requires them.
- `args.cluster` (fix script): `{id, title, worktree, branch, base, scratch, ownership[], checks, items[{id, severity, what, fix}], notes}`.
- `args.batches` (verify script), `args.gaps` (gap script): the lists of items to process.

The fix script's result is the JSON that [`scripts/audit/record-cluster.py`](../audit/record-cluster.py) records.

## Rules every prompt carried

- **No changes outside an agent's own work:** read-only agents never edit the repository. Fix agents edit only the files their cluster owns, and always in a separate worktree.
- **Prove the fix with a test:** a fix needs a test that fails before it. The reviewer re-checks that, and mutations of the fix must make the test fail.
- **No shortcuts:** no new dependencies, no skipped or weakened tests, and no secrets in logs or commits.
- **Commit early:** each item is committed as soon as its test passes, because a container restart loses uncommitted work.
