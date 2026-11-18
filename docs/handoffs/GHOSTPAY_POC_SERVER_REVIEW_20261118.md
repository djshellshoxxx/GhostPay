# PoC static-server security followup

## Source and scope

- Base: PR #224 at `1054daabc5cabe958466ec144582d76137b54910`.
- Branch: `chatgpt/ghostpay-sonar-review-20261118`.
- Product bundles, contracts, deployment behavior, SonarCloud state and release gates are unchanged.
- Owned changes: `docs/audits/poc/static-server.mjs`, its test file, the work claim and this handoff.

This server is an audit helper bound to `127.0.0.1`. The findings below concern the local audit service; they are not
evidence of a deployed GhostPay application vulnerability.

## Findings and corrections

### GP-POC-URL-01 — malformed request target terminates the server

Severity: low, local availability.

`new URL(req.url, 'http://x')` executed outside the existing decoding error handler. Sending the raw request target
`//[` raised `ERR_INVALID_URL` and terminated the server process with exit 1. The correction handles URL parsing and
percent decoding together, returns HTTP 400 and continues serving subsequent valid requests.

### GP-POC-PATH-02 — symlink escapes lexical bundle containment

Severity: low in this loopback audit-helper context; disclosure requires a symlinked bundle entry targeting an
outside readable file or directory.

The path-component check rejected encoded parent traversal but did not resolve symbolic links. A synthetic symlink
inside the bundle pointing at a sibling file returned HTTP 200 and the outside file contents. The correction resolves
the served root and requested file, requires both lexical and resolved containment, and serves only regular files.
Contained symlinks remain supported.

### GP-POC-IO-03 — filesystem errors terminate the server

Severity: low, local availability.

Filesystem lookup and read exceptions escaped the request handler; read success headers were also sent before the
read completed. The correction performs lookup and reading before success headers, returns a fixed HTTP 404 response
for unavailable files, and keeps the server running. Responses do not expose the underlying filesystem error.

## Verification

Environment: Linux, Node.js v24.22.1. Tests use synthetic temporary directories and loopback HTTP only.

- Before source changes, direct reproductions returned outside synthetic contents with HTTP 200 and crashed the
  malformed-URL child process with `ERR_INVALID_URL`, exit 1.
- Added regressions before the fix: `node --test docs/audits/poc/static-server.test.mjs` — 5 passed, 3 failed.
- After the fix, the same command passed 8/8, with zero failures and zero skips.
- New cases exercise file and directory symlink escape, a contained symlink, malformed raw URL handling, and injected
  `statSync`, `readFileSync` and `realpathSync` failures followed by a successful ordinary request.
- Existing percent-decoding and encoded-traversal regressions still pass.
- `git diff --check` passed.

The crash regressions use isolated child processes so the original uncaught exception cannot terminate the test
harness. The helper uses synchronous filesystem operations and assumes the bundle is not adversarially replaced
between canonicalization and reading; this change does not claim a filesystem sandbox against a concurrent local
writer.

## Review of the remaining PR #224 execution changes

The four download commands constrain both initial and redirect protocols to HTTPS while preserving their checksum
checks. The integration test command uses `npx --no -- vitest` to require the locally installed test runner.
These changes add no dependency, hosted service, telemetry, deployment or spending authority. The coordinator owns
the independent comparison of bidirectional-control literal values and current hosted checks.

No SonarCloud finding was marked resolved. The latest project analysis requires separate authenticated access and
confirmation. Final integration and exact-head CI qualification belong to the coordinator.
