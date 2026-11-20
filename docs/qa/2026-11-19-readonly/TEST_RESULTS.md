# Executed checks, stress bounds and qualification limits

All new local execution used source `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Node was `v24.22.3`; the committed selected-web dependency installation used
Vitest `5.0.5`, Vite `8.3.5`, TypeScript `5.9.3`, fast-check `4.10.2` and
Playwright `1.64.1`. Original test deadlines and coverage thresholds were unchanged.

## Environment preparation and build

`npm ci --offline --ignore-scripts --no-audit --no-fund --workspace @ghostpay/web
--include-workspace-root` failed because the Vitest tarball was absent from cache.
The same exact-lock selected installation using the normal registry path succeeded:
305 packages in 15 seconds. The root lockfile and all manifests remain unchanged.
No alternative dependency versions were substituted.

The dependency-aware web build compiled the runtime libraries, then its web
TypeScript pass found a missing test-only `relayer-guard` workspace in that selected
installation. The unchanged local workspace was linked in ignored `node_modules`
and built from this checkout. No application or configuration repair was made.
The subsequent command passed, exit 0:

```text
NODE_OPTIONS=--max-old-space-size=1536 GHOSTPAY_LOCAL_BUILD_PROFILE=lean \
  npm run build -w @ghostpay/web
```

TypeScript, Vite and the postbuild scan passed; the scanner checked 17 emitted
files. Evidence: [lean-web-build.txt](evidence/lean-web-build.txt).
This is the lean build, not a fresh local full-profile build or release artifact.

Nonfatal output included a 1,277.86 kB main minified chunk (394.39 kB gzip), above
the configured 1,200 kB warning, and an ineffective dynamic import for QR readers
because the same module is statically imported. These are build/performance
follow-ups, not a demonstrated device-performance defect or failed build gate.

## Original test suites and targeted selections

| Check | Actual result | Interpretation |
| --- | --- | --- |
| Core-crypto full suite, V8 coverage, one worker | 75/75 tests, 9/9 files, exit 0; 272.78 s | Complete package gate passed. |
| Payment-URI full suite, V8 coverage, one worker, 1,024 MiB heap | 199/199 tests, zero failures/skips, exit 0 | Complete package gate passed. Earlier 23-case selection overlaps this run. |
| UX-vault initial full coverage run | 267 reported completed passes of 284, 17 unfinished; worker SIGKILL; exit 1; 281.32 s | Incomplete. Partial coverage failed. JSON success field was misleading. |
| UX-vault portable parity isolated, 1,024 MiB heap, no coverage | 148/148, exit 0; 49.61 s | Functional isolation pass; not the full gate. |
| UX-vault final full coverage run, one worker, 1,024 MiB heap | 284/284 tests, 7/7 files, exit 0; 206.16 s | Complete original package gate passed after the initial incomplete attempt. |
| QR / invoice / transaction-review original selections | 47 / 27 / 11 passed, no selected failures | Focused results; not full package coverage. |
| Broad ordinary web workflow/component selection | 880 passed, 1 failed, 11 unfinished of 892 collected; exit 1; 639.20 s | Failed/incomplete. Ledger synchronization failure plus SellerKeys worker SIGKILL. |
| Original ledger component file in isolation | 17/17, exit 0; 10.71 s | Confirms the broad failure is timing-sensitive; does not erase it. |
| Original SellerKeys file in isolation | 3 completed passes of 39, worker SIGKILL; exit 1; 15.28 s | Incomplete; worker-kill cause unestablished. No full local pass. |
| Original scanner/protocol and tag-concurrency selection | 31 ordinary cases passed, million-wire worker SIGKILL; exit 1; 54.27 s | Incomplete original stress gate. Separate native workload below passed. |

Final coverage, with original thresholds retained:

| Package | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Core-crypto | 98.50% | 98.16% | 100% | 98.21% |
| Payment-URI | 97.31% | 96.53% | 100% | 99.08% |
| UX-vault final run | 96.37% | 93.30% | 99.68% | 98.66% |

Core-crypto and vault full-package command form, from the respective package
directories:

```text
../../node_modules/.bin/vitest run --maxWorkers=1 --coverage \
  --reporter=default --reporter=json --outputFile.json=<external-result-path>
```

The final payment-URI and vault executions used a 1,024 MiB V8 heap cap.
Payment-URI supplied it as `node --max-old-space-size=1024` with the JSON reporter;
vault supplied it through `NODE_OPTIONS`. The exact payment command is recorded
in `evidence/core-commands.json`. The initial vault attempt did not have that
explicit cap. Memory caps are execution bounds, not changes to assertions,
timeouts or coverage requirements. Focused commands and filters appear in
[core command records](evidence/core-commands.json) and BROWSER_QA.md.

Process errors and unfinished assertions take precedence over reporter success
fields. The broad web report had one failed assertion and one worker error; the
scanner JSON said success despite its worker error. No repository code was found
that uses those JSON fields to override the npm exit status. This is an evidence
interpretation caveat, not a demonstrated false-pass GhostPay CI gate.

## Supplemental functional and bounded stress checks

### Core serialization and data-handling properties

Seed **`0x47505141`** (1196446017), xorshift32 for synthetic data. The direct
source harness used a scratch-only TypeScript module loader; it imported this
checkout's real implementation. It did not replace product algorithms.

The **10,229 cases** comprised 5,000 exact decimal roundtrips, 2,000 EVM URI
roundtrips, 1,500 ordinary multichain text roundtrips, three aggregate-length
boundaries, 600 QR transfers, 120 plain/encrypted invoice roundtrips, 1,000 settings
exchanges and six decimal-option cases. **10,223 passed**; six boundary failures
are the three family cases of QA-02 and three option cases of QA-03.

The QR subset processed 10,146,005 payload bytes, 27,949 unique frames plus the
same number of duplicate additions, with shuffled delivery, reset and copy checks.
Payloads were bounded at 32,768 bytes and 64 frames per transfer. Combined-run
peak RSS was 121,270,272 bytes. See CORE_QA.md and the two core result JSON files.

### Vault consistency, queueing and restore

Seed **`0x47505641`** (1196447297). Start with 5,000 synthetic contacts and verify
the capacity refusal. Run 3,000 operations (981 adds, 980 updates, 1,039 removals),
ending with 4,942 contacts. Perform 100 serialization/validation and deterministic
tag-search checks, then a 600-record normal merge. Submit 256 mutation requests in
16 batches of 16; the implementation serializes the writes. Lock/reopen and
backup/restore preserved 256 contacts.

This used unchanged production PBKDF2 defaults of 600,000 iterations and an async
in-memory store with a one-millisecond write delay. Duration: 86,871.55 ms;
process peak RSS: 331,415,552 bytes. The workload is a consistency check, not an
independent state-machine proof. It does not establish search completeness, real
IndexedDB quotas, physical disk behavior or cross-tab coordination. The independent
review in VAULT_STRESS_REVIEW.md reconciles counts and these limits.

### Scanner one-million-entry diagnostic

The original Vitest stress worker was killed and remains incomplete. A separate,
lower-overhead native Node execution imported actual `scannerCore.ts` and retained
the existing generator, seed **`0x47504d31`**, **200 batches of 5,000** entries,
empty-match assertions per batch and final scanned-count assertion.

It completed **1,000,000 entries in 114.980 seconds**, exit 0, under a **384 MiB
V8 heap cap and 180-second outer deadline**. Sampled peak heap was 176,276,456
bytes and sampled peak RSS 318,287,872 bytes. Evidence:
[scanner-native.txt](evidence/scanner-native.txt).

The corpus includes repeated-key records as disclosed in the original fixture.
It is neither one million distinct-key crypto operations nor remote-endpoint load.
This diagnostic adds source execution evidence; it does not qualify the interrupted
Vitest gate, browser worker or sustained device performance.

### Controlled UI state checks

Backup overlap: two desired-behavior assertions failed and two controls passed.
Real component handlers/state were exercised using synthetic data and deferred
public async seams. A single completed export and explicit verification cancel
remained usable. See QA-01 in the browser report.

Ledger timing: one deterministic deferred-readback diagnostic passed, showing
that the initial disabled click is ignored and a later enabled click imports once.
Together with the broad failure and original 17-case isolated pass, this supports
QC-01 as a test synchronization defect rather than product data loss.

## Browser and hosted-evidence boundary

Local Chromium failed before page creation with a process-singleton socket
permission error and SIGABRT. The Cloud Desktop preview navigation returned
`ERR_CONNECTION_REFUSED`; subsequent observation was blocked by browser URL policy.
No workaround was attempted. The temporary preview process was stopped.
No new local browser, responsive, accessibility or cross-engine pass is claimed.

Pre-existing GitHub logs for the pinned baseline show 24 successful main CI jobs,
2,806 passing web tests plus a separate three-test nocov pass, and successful
Chromium full/lean runs. Their exact job URLs, skipped cases, pending newer-head
jobs and manual accessibility incompletes are recorded in QC_REVIEW.md. They are
historical hosted evidence, not newly executed tests in this session. No manual CI rerun, release, deployment, paid job or real transaction was
performed by this review. A documentation PR may receive normal automatic checks;
those do not add new application qualification.

## Integrity and provenance

No production/test/dependency/configuration files were changed. Build output and
installed dependencies are ignored working files. The committed artifacts are
documentation, result data and selected text evidence. Supplemental executable
harnesses remain outside the repository. `evidence/manifest.json` records the
delivered evidence sizes and SHA-256 hashes.

The recorded source refresh proves affected files remain unchanged on the later
heads; it does not claim whole-tree testing of those heads. Repair and release
qualification must use the final actual repaired source.
