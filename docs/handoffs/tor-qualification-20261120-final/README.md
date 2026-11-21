# Static Tor qualification continuation — 2026-11-20 Pacific

## Verdict and source

**NOT READY for a claim of fully qualified real-Tor operation.** Source integration
and deterministic checks have advanced; real Tor Browser, onion connectivity,
final image identity lifecycle and final-head hosted qualification remain separate
requirements. No deployment or real-fund transaction was performed.

The machine-readable record is [LEDGER.json](LEDGER.json). Logs retain their
original source checkpoint; later documentation or hosting changes do not change
the source those logs exercised.

- Starting main: `aec179910c39081d820396409ff3139ff2264132`.
- Donor #320: `e8010bbe002331ee0cb37dc6b16dfd91c8b8647d`.
- Included #308: `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`, an ancestor of #320.
- Reconciled baseline: `e5457a4aa8ff7a4cb7c7635a060be5b3003a0103`.
- Working branch: `integration/ghostpay-tor-qualified-20261121`.
- Reconciliation evidence: [BRANCH_RECONCILIATION.json](BRANCH_RECONCILIATION.json).

Both donor histories and all intervening main runtime changes are preserved. The
sole conflict was additive `docs/ai/ACTIVE_WORK.md` material; both sides were kept.
Historical hosting/transport/canonicalization from #36, #189 and #134 is already in
main. The future P01 branch contains specifications, not a missing runtime.

## Existing hosted results

The old #320 handoff listed CI as pending. Its actual tree
`cfd7bd5fada083bef9e6148c4b55a1b49f135757` now has 31 successful checks plus Snyk.
The synthetic merge checked by the Tor workflow has the same tree.
[Run 44772760709](https://github.com/djshellshoxxx/GhostPay/actions/runs/44772760709)
completed workspace preparation, whole-web TypeScript/Vite/postbuild scan,
ordinary Chromium at two origins, Docker construction, Tor 0.4.9.17 runtime and
configuration validation. It did not bootstrap Tor. These results qualify the
donor tree, not the new composition.

## Executed local verification

Environment: Debian 13, Node 24.22.3, npm 11.19.1. Hosted Node 22 remains separate.
The unchanged lockfile was installed with lifecycle scripts disabled.

| Check | Result | Evidence |
|---|---|---|
| `npm ci --ignore-scripts --no-fund --no-audit` | Passed, 722 packages | Local preparation |
| `npm run build:libs` with 2048 MiB Node heap | Passed | `evidence/build-libs.log` |
| Final full hosting kit and Tor identity/recipe checks | 314 passed, 15 explicit skips | `evidence/hosting-final.log` |
| Hosting-kit lint/typecheck | Passed | `evidence/hosting-lint.log`, `hosting-types.log` |
| Whole-web lean build and postbuild scan | Passed, 17 scanned files | `evidence/web-lean-build.log` |
| Static-artifact validation | Passed | `evidence/artifact-validation.json` |
| Web production and complete dependency audits | Zero known vulnerabilities reported | `evidence/npm-audit-*.json` |
| Secret and Actions pin scans | Passed at baseline | `evidence/*baseline.log` |
| Independent functional selection | 389 passed, 54 deliberately deselected Pay cases | [FUNCTIONAL_REVIEW.md](FUNCTIONAL_REVIEW.md) |
| Extended browser fixture | Blocked before assertions | `evidence/browser-extended-initial.log` |

`evidence/functionals/INDEX.json` records exact commands, exits, blob identities and
log hashes. Focused web selections are not a full-web coverage run. Net-transport
passed its unchanged full-package coverage thresholds.

## New identity safeguard

Production source is frozen at `d2e61d2c96128ae6f9c97fc3f347518e5d38a079`. Normal startup now requires the
configured canonical onion hostname and a complete private identity. Tor loads
private copies offline, recomputes the hostname, and must leave both key files
unchanged. Explicit first initialization refuses an existing identity. Missing,
wrong or partial volumes cannot silently create a replacement. Operator docs now
include encrypted backup/restore, restart/upgrade and stale-operation recovery.
The new container acceptance checks those paths using actual Tor with Docker
`--network none`; that execution is still pending hosted CI. Generated offline
Compose isolation is also parsed/asserted by CI, preserving normal gates.

## Privacy and recovery boundaries

Browser fetch uses the browser's ambient route. `tor-browser` records the user's
scan choice; it cannot prove that browser or an external wallet uses Tor. Private
scan no-fallback behavior is tested; actual routing, DNS, extensions and
browser-wide leakage remain unverified. Native network inventory/isolation review
ran 4 and 19 checks, covering redirect refusal, stalled-body deadlines, redacted
errors and no silent fetch fallback. Those are controlled HTTP tests, not Tor.

The journals use tab-scoped `sessionStorage`. Reload tests do not establish
protection across other tabs/origins/profiles, storage clearing, browser closure or
Tor Browser New Identity. Ambiguous wallet submissions remain unknown and do not
automatically expire. Expiry is client-side policy: it cannot revoke a submitted
transaction or create an automatic blockchain refund.

New actual-artifact browser assertions cover encrypted backup/restore and signed
invoice-link transfer. The narrow viewport is mobile-layout coverage, not a
physical mobile or mobile Tor Browser result. The broader unmerged invoice-file
UI was not recreated. Evidence excludes private keys, ciphertext backups, real
passphrases, wallet request bodies and onion identity files.

## Environment and integration blockers

Chromium's process singleton Unix socket is denied: `socket() failed: Operation
not permitted`. It exits before assertions; no sandbox workaround was used.
Ordinary loopback HTTP works and is a different capability. Docker/Tor/Tor Browser
are absent. The official pinned Tor source download returned HTTP 403 with
`x-openai-site-blocked`. Final image/offline identity checks need hosted CI;
real Tor Browser acceptance needs a suitable isolated operator host.

The integration lock was last observed at
`c196151daf8233f96045fd205b2d899c9e8cc97d`, held generation 11 by
`994a0d214fb9-root-r3`. Expiry does not permit takeover. Its helper rejects every
held lease, and release requires matching ownership after stopped-writer
verification. No authoritative stopped/released handoff was found.

The user has already authorized merging completed work. No additional generic
merge approval is requested. Finish exact-source CI/review, resolve the existing
owner handoff under its protocol, recheck heads, then merge qualified source.
Preserve the shared lock and deployment controls. Do not import unrelated failing
broad integration work to finish this isolated candidate.
