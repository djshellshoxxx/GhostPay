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

The initial source was independently reviewed at `d2e61d2c96128ae6f9c97fc3f347518e5d38a079`;
the later readiness correction is recorded below. Normal startup requires the
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
real Tor Browser acceptance needs a suitable isolated environment. The hosted
feasibility review found official signed browser/driver artifacts, but matching
release launcher/profile source access was blocked. The pinned design and exact
source/activation gates are documented in
[the live acceptance plan](../../../deploy/tor-static/LIVE_ACCEPTANCE.md). No
executable harness, live workflow or live Tor result is claimed.

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

## First hosted attempt and diagnostic follow-up

Published source `313cea93d727a4ed620a69de6733a2bdff433400` was tested as merge
`916b64ef8d0d5b1036fde122bf2dd94b7dee80c3`; both trees are
`82cedbd99df01af68a979b0a27b8c4585b42440f`. Run `44868708242` passed the
extended ordinary browser suite, both generated Compose models and actual Tor
image compilation. Its first explicit offline initialization exited 1. No
identity lifecycle pass is claimed; private-volume cleanup passed. The artifact
ZIP checksum was independently rechecked before retaining its JSON evidence in
`evidence/hosted-313cea93/`.

The diagnostic follow-up emits only fixed, exact-message codes, its authored
stage and numeric exit status. Unknown process output remains redacted. Its ten
regressions pass; this provides evidence for diagnosis and does not claim to fix
the as-yet-unproven initialization cause. No production guard was relaxed.


## Offline startup readiness correction

Integrated source checkpoint: `7aa8a278` (a descendant of published
`313cea93`). The worker contribution is `2239f5b21a1a173c59feb404cc3407633fb7e91c`.
A deterministic process regression established that the helper could terminate
Tor after hostname creation but before its signal handler was ready. It now waits
for both a valid hostname and Tor's fixed private startup notice before requesting
shutdown. It still requires exit status zero, private files, the configured pin
and byte-identical copied keys. Networking remains disabled during verification.

The final regressions failed against the original helper and passed with the
correction. A fresh independent reviewer approved product blob
`a7b0c89e2d9d062ca1468c3f283e4050d076d771` and test blob
`b90969ae249d25188969e4ba963e8448800cd050`, then independently reran the new
regression groups (5 passed). The integrated identity/diagnostics/recipe/config/
adapter/header selection passed **85 tests, zero failures, two capability skips**;
workflow checks passed 6/6. Secret and Actions-pin scans, shell/Node syntax and
new-change whitespace checks passed. The application/package/lockfile bytes are
unchanged from the existing functional baseline.

The original hosted initialization failure remains consistent with, but not proven
to have been caused by, this race. The inspected official source documentation
reports Tor 0.5.0.0-alpha-dev; the next hosted run must test the actual pinned
0.4.9.17 image. Bounded diagnostics accompany the fix. Raw RED/GREEN/integrated
logs are retained byte-for-byte under `evidence/readiness-*.log`, including
whitespace in the RED assertion traceback; source whitespace checks exclude raw
evidence logs. The detailed independent
review and source basis are in
[the readiness handoff](../TOR_IDENTITY_READINESS_20261121.md).


## Acceptance-report value redaction

Source correction: `3758a6cce3705c374b988018b1cb54b0e44726ed`. Three synthetic
Docker regressions demonstrated that native assertion messages could export
unexpected verification stdout or a compared hostname, and that image-inspection
stdout was not validated before entering the report. No actual private identity
was used in these tests.

The runner now validates the image digest before assigning it to evidence and
records only authored stage/code fields plus a fixed failure message. Existing
refusals, identity comparisons, network isolation and cleanup remain unchanged.
The three new cases failed before the repair; all **13 diagnostics cases pass**
afterward, with no skips. Node syntax, source whitespace and the secret scan pass.
Raw evidence is retained in `evidence/assertion-redaction-{red,green}.log`.
This reporting correction does not change the production identity helper and
does not substitute for actual container acceptance. A fresh independent reviewer
approved both exact blobs and independently reran all 13 diagnostics tests with
zero failures/skips; see [ASSERTION_REDACTION_REVIEW.md](ASSERTION_REDACTION_REVIEW.md).
Final published-source hosted execution remains required.
