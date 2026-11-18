# Developer and audit tools

These are the tools the 2026-10-28/29 Claude Code sessions built to check, integrate and audit GhostPay. They are committed so that the next person or agent does not have to rebuild them. All of them are plain Bash, Python 3 (standard library) or Node, and none adds a dependency.

| Tool | What it does |
|---|---|
| [`scripts/dev/local-ci.sh`](local-ci.sh) | Runs the CI gates locally, one step at a time, and writes a log per step. Prints `PASS`/`FAIL` with each step's duration. |
| [`scripts/dev/nonroot-run.sh`](nonroot-run.sh) | Runs a command as an unprivileged user on a clean `git archive HEAD` copy, as GitHub's runners do. |
| [`scripts/audit/gen-audit24-report.py`](../audit/gen-audit24-report.py) | Regenerates [audit 24](../../docs/audits/24-ai-assisted-security-audit-2026-10-28.md) from [`docs/audits/data/24/`](../../docs/audits/data/24/). |
| [`scripts/audit/record-cluster.py`](../audit/record-cluster.py) | Records a fix round's result (items, commits, review issues) into `docs/audits/data/24/status.json`. |
| [`scripts/agents/`](../agents/) | Reference copies of the Claude Code Workflow scripts that ran the audit and the fix rounds. See [their README](../agents/README.md). |

## local-ci.sh

```bash
scripts/dev/local-ci.sh --list
```

```bash
scripts/dev/local-ci.sh --log /tmp/ci-logs
```

```bash
scripts/dev/local-ci.sh --only build-libs,typecheck,pkg-chain-adapters --web-tests "src/views/Scan.test.tsx src/lib/sweep.test.ts"
```

The steps are the same as in `.github/workflows/ci.yml`:

1. Build and static checks: `build:libs`, then typecheck and lint for every workspace.
2. Every package's tests.
3. Script and recipe checks: the secret scan, the header check, `deploy/selftest.sh`, the script tests and the PHP plugin tests.
4. The hosting kit.
5. The web build, then the web suite with coverage and the no-coverage config.

The exit status is 0 only when every selected step passed. Run `npm ci` first.

Timings on a 4-vCPU container (Node 22):

| Step | Time |
|---|---|
| `build-libs` | 1 to 1.5 min |
| `typecheck` | 3 to 7 min |
| `lint` | 10 to 13 min |
| `pkg-invoice-schema` | about 4 min (production scrypt cost) |
| `web-coverage` | about 16 min |
| All steps | about 45 min |

### Known flakes in small containers

These tests pass in GitHub CI. Locally they fail only under load, and their code is unchanged from a CI-green base.

- **`apps/web/src/lib/scannerCore.fuzz.test.ts`, the one-million-log fuzz:** it needs about 207 s against its 180 s limit on 4 vCPUs, even when run alone.
- **`apps/web/src/components/ReconciliationLedger.test.tsx`, "saturated backup":** it fails in about 2 of 3 coverage runs here. It passes alone without coverage.
- **`packages/invoice-schema` passphrase tests:** they can time out when another heavy job runs at the same time. They pass alone.

Vitest prints no coverage summary when any test fails. `web-coverage` therefore passes `--coverage.reportOnFailure`, so that you can still read the thresholds (90/85/90/90).

## nonroot-run.sh

Root ignores file modes, so a check can pass in a root container and still fail in CI. For example, `deploy/selftest.sh` built a tarball fixture with directories of mode 0644, and only a non-root extract refuses that (fixed in `915d710`). Run it as root:

```bash
scripts/dev/nonroot-run.sh -- bash deploy/selftest.sh
```

It creates the `ghosttest` user if that user is missing. The command runs in a temporary export of `HEAD` in that user's home: only committed files, and no `node_modules`.

## Audit data and report

- **Data:** `docs/audits/data/24/` holds the audit 24 data set:
  - the verified findings (`all-verified.json`) and their full text (`full-text.json`)
  - the titles (`titles.tsv`)
  - which commits fixed each finding (`commit-map.json`)
  - every fix round's per-item outcome and review issues (`status.json`, under `_clusters`)
- **To change a status:** add the fix commits to `commit-map.json`, or move an id between `DEFERRED` and `ACCEPTED` in the generator. Then run the command below and review the diff before committing.

```bash
python3 scripts/audit/gen-audit24-report.py
```

## Integration checks used for the audit 24 merges

- **Each fix branch:** the fix-round reviewer ran its area's checks. The integrator then ran `local-ci.sh` (all steps) on the merge.
- **When a test fails:** re-run its file alone with `--coverage.enabled=false` before you treat the failure as real.
- **Known flakes:** compare a failure with the known-flake list above.
