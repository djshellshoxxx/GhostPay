# Generation 1 independent security review

Repository: `djshellshoxxx/GhostPay`. Review baseline: PR #278,
`c993bb2340942c85dbf10303b61f69a91c4944e0`.
Worker branch: `review/ghostpay-continuous-security-20261119`.
Test-first commit: `7abf4e00`; product fix: `84f39e41ef132af88b4ca3280818ed701026d412`.

## Confirmed and repaired: final export UI accepted expired authority

`useExportOperation.current()` checked operation identity, React scope and cancellation,
but did not invoke the existing synchronous session-deadline guard. When the idle deadline
passed after the export service's final check and before the UI resumed, a delayed browser
lock event left the result eligible for download.

The original-source regression has **three behavioral failures and one passing control**.
Two hook cases cover both a loaded seller and an empty-session recovery operation. The
integration case performs the real vault reauthentication, EOA check and private-key
derivation, then advances the modeled idle deadline at the final promise handoff. Original
code starts one plaintext-key download; corrected code starts none and clears the input.
Only the deadline timing is controlled; no cryptography or export result is substituted.

This is a **low-severity local expiry/authorization-boundary defect**. The original export
was explicitly requested and authenticated. No remotely reachable key theft or unauthorized
fund transfer is demonstrated.

The fix captures a session-version guard with each operation and samples it before the UI
accepts a result. Failure cancels the operation and clears the input. If the normal session
subscriber already reset the operation, the error path does not reset it twice. The guard
also preserves recovery started without loaded seller keys.

## Executed checks

| Check | Result |
| --- | --- |
| New regressions on unchanged runtime | 1 passed, 3 failed; exit 1 |
| Fixed boundary + existing Payment, Recovery and Verification suites | 49 passed; exit 0 |
| Existing selection/download suites | 10 passed; exit 0 |
| Typed ESLint of changed source and test | Exit 0 |
| Patch whitespace | Clean |

These 59 passing cases are disjoint test selections, not a complete workspace run. All use
Node 22.23.4, Vitest 5.1.0, the original web configuration and `--maxWorkers=1`.
Focused tests disable coverage; no threshold, timeout or assertion was changed.
Dependencies resolve through a symlink to the coordinator's clean npm10 installation.
Web source and existing invoice/QR aliases resolve in this isolated worktree; the shared
compiled core dependencies retain their baseline source. See [RECEIPT.json](RECEIPT.json)
for source blobs, actual outcomes and log hashes.

Reproduce from a checkout with the unchanged lockfile installed and library prerequisites
built, using Node22 on PATH:

```sh
node node_modules/vitest/vitest.mjs run --root apps/web src/components/StealthExportCommon.expiry.test.tsx src/components/StealthExportPayment.test.tsx src/components/StealthExportRecovery.test.tsx src/components/StealthExportVerification.test.tsx src/components/StealthExportSelection.test.tsx src/components/StealthExportDownload.test.tsx --maxWorkers=1 --coverage=false
node node_modules/eslint/bin/eslint.js --config eslint.config.js apps/web/src/components/StealthExportCommon.tsx apps/web/src/components/StealthExportCommon.expiry.test.tsx
```

The coordinator must independently review and verify the implementation before integration.
The implementing worker does not count this document as independent approval of its own fix.

## Independent review of incoming unique fixes

Source review found no introduced blocker in #280, #281, #282, #285 or #289. Their ten
source/test blobs are identical to the versions consolidated by the coordinator at the
head recorded in [UPSTREAM_PATCH_REVIEW.json](UPSTREAM_PATCH_REVIEW.json).

- #280 narrows every unknown runtime build-profile input to lean.
- #281 correctly marks incomplete 30-day history while preserving genesis and head bounds.
- #282 rejects duplicate saved signer-pin fields through the existing strict bounded parser;
  malformed pins remain unavailable, preventing silent overwrite or removal.
- #285 rejects inherited or absent QR taxonomy names before applying caution flags, while
  keeping secret and bearer handling precedence.
- #289 rejects non-string decoder inputs using the existing fixed public error type.

These are bounded source findings. The coordinator owns their actual regression runs and
combined qualification. Export RPC grants, session guards, vault reauthentication and key
boxing were also inspected; no additional reproducible defect was established in that scope.

## Independent review of #261 metadata coordination helper

[LOCK_261_REVIEW.json](LOCK_261_REVIEW.json) pins the two extracted source/test blobs.
No introduced blocker was found within the documented cooperative-lock model. Each
transition has the exact observed remote lock head as parent; competing transitions
become siblings rejected by an ordinary nonforce push. Remote destinations, immutable
reads, state validation, ownership/expiry checks and explicit tag isolation are intact.
The ten original tests use real bare Git repositories, a simultaneous-push barrier,
main-ref invariants and an annotated-tag side-effect check. Their execution belongs to
the coordinator, not this source review.

This metadata token is coordination identity, not adversarial authentication. The helper
does not automatically prevent an arbitrary writer from updating main; integration must
still assert ownership before shared mutation and check exact target heads, CI and review.
No live remote lock transition was performed by this worker.

## Fresh Mythril evidence: gate remains failed

[Workflow 44539518235](https://github.com/djshellshoxxx/GhostPay/actions/runs/44539518235),
artifact `14552010877`, contains an actual completed scan of exact baseline `c993bb23`.
The full report's SHA-256 matches artifact metadata. All **241** manifest source-file hashes
match this checkout; every report, stderr and completeness hash also matches the manifest.
All five completeness records report instrumentation ready, one report, and no observed
exceptions, error logs or execution/creation timeouts.

The fresh result has **10 records: 3 Medium and 7 Low**, superseding the historical count of
11 for this source. Router and PolicyRouter have zero records, Sweep has one timestamp
record, PolicyAccount has two timestamp records, and Factory has seven records. These are
analyzer findings, not ten independently proven exploits. The strict runner returned 1.

The Factory is already `nonReentrant`; its SafeERC20 transfer-result boolean is explicitly
consumed. Timestamp checks enforce signed expiry. These source observations suggest places
for finding-specific review and trace reproduction; they do **not** close any finding or
authorize an exception. Compiler-generated exception and fee-token failure paths also need
their recorded dispositions assessed against the actual trace. No contract or gate changed,
and this worker did not rerun the native analyzer.

[MYTHRIL_C993_REVIEW.json](MYTHRIL_C993_REVIEW.json) preserves configuration, issue locations,
counts and verification. The exact downloaded archive is retained as
`evidence/mythril-c993.zip`; no signed download URL is persisted.

## Continuation and remaining gates

Integrate the reviewed expiry repair, then run the coordinator's combined original tests,
lint, build and browser acceptance. The existing dedicated-origin requirement, release
approval, external security review and strict finding-level clearance remain open. Hosted
results qualify their exact source; they must not be relabeled as final-source success.
No fees, custody behavior, cryptographic format, dependencies, deployment or remote branches
were modified by this worker.
