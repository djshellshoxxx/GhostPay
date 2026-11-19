# CLI dropped-fix recovery qualification

Base: PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec`.
Recovered source: PR #218 `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e`.
Regression checkpoint: `cb0e2c220290f8c240ddfcc37f24814be597f75d`.
Corrected runtime: `8ab2ca330463abb58c813eb8cc0a94a8e5af28d4`.

## Four restored requirements

| ID | Confirmed baseline behavior | Recovered behavior |
|---|---|---|
| R11-1 | An option value spelling `--help`, `-h` or `--version` can short-circuit verification with exit 0 and `ok:true`. | Parse switches against the command's option specification; preserve genuine help/version forms and terminators. |
| R11-2 | A stored record absent from newly verified observations can be exported as currently verified. | Require fresh evidence for the selected export; carry per-record current verification and an honest aggregate. |
| R11-3 | Malformed local observations can appear as RPC/internal errors. | Validate canonical local positions and translate malformed announcement logs before network calls. |
| R11-4 | Mis-pasted bearer links, sensitive paths or terminal controls can reach output. | Withhold link/document-like paths, print only safe basenames, and escape untrusted display text. |

## Executed evidence

The four recovered suites fail **428 tests and pass 12** on the unchanged runtime baseline;
after recovery all **440 pass**, with no failed or skipped tests. Baseline failures include
actual false success, stale verification and path-disclosure assertions; three missing helper
exports also fail on the old source. Whole CLI typecheck passes. Dependency closure was rebuilt
successfully at the regression checkpoint. Every runtime file changed by this recovery matches
the reviewed #218 source exactly. The newer #238 dependency manifests and receipt-privacy
regressions are retained.

The separate coordinator reviewed the source diff and found no blocking issue. This is
separate-agent source review, not a formal external audit or GitHub approval.

The full original CLI coverage command is still running at this checkpoint. Initial full CLI
lint exited 137 without a source diagnostic; an isolated serialized retry, corrected build and
compiled acceptance are pending. These are not represented as passing. The coordinator may
integrate the regression-backed source while preserving these separate qualification gates.
No main merge, deployment or release is claimed.

Local toolchain: Node 24.22.3, npm 11.9.0, Vitest 5.1.0; memory cap 768 MiB and one Vitest worker.
Offline npm installation exited 137; independent dependency copies used a byte-identical lock
and preserved relative workspace links. This is not evidence of a clean npm-ci pass.

The machine-readable ledger and log hashes are in [workflows-cli.json](workflows-cli.json).
Raw logs are retained in [workflows-evidence/](workflows-evidence/).

## Related completed security helper

The #226 static audit helper and its regression file are already byte-identical in #238.
`node --test docs/audits/poc/static-server.test.mjs` on that base passed 8/8 with zero skips
(3.992s). Copying #224's older helper would regress symlink and malformed-URL protection.
