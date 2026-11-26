# Hosting export timestamp precision qualification

## Reviewed source

Base: `74e3111f994481e7c9201ddb0494cf4a8405eadd`.
Product: `38fe7fdaf151ef433be9721af8fea7cbcdea89c4`.
Branch: `codex/ghostpay-hosting-timestamp-20261119`.
Worker: `branch_recon`; independent source reviewer: `recovery_completion`.

The product changes only the static exporter and two focused test files. The earlier
claim commit is additive. Web runtime, dependencies, build configuration, hosting
policy, request matrix, preview, router and all existing assertions are unchanged.
Exact blobs, commands, log hashes and review attribution are in `receipt.json`.

## Cause and repair

PR #260's hosting-kit job reported one validator mismatch for `GET /assets/font.woff2`:
preview ETag `"6afeb81e-8"` and Last-Modified `Thu, 19 Nov 2026 08:49:34 GMT`, versus
nginx ETag `"6afeb81f-8"` and Last-Modified one second later. The privacy worker
retrieved that job's logs and confirmed the relevant exporter, differential test and
helper blobs match this base. Job: https://github.com/djshellshoxxx/GhostPay/actions/runs/44485361026/job/135427352070 .

Installed Node 22.23.4's `internal/fs/utils` constructs `Stats.mtime` with
`new Date(MathRound(Number(ms)))`. The preview calculates its HTTP timestamp from
`Math.floor(st.mtimeMs / 1000)`, but the old exporter passed the rounded `Date` to
`fs.utimes`. A source timestamp in the last half millisecond of a second therefore
advances the exported HTTP second. This is deterministic at `1795078174.9996`.
Both the root and subpath regressions reproduced exactly `1795078175` versus
expected `1795078174` before the source change.

The exporter now carries raw `mtimeMs` and passes `String(mtimeMs / 1000)` to
`fs.utimes`. Numeric strings are deliberate: Node interprets a negative numeric
time argument as the current time, while a negative numeric string retains its
value. The explicit null check preserves epoch zero. Destination atime still equals
the copied mtime, matching prior behavior; overlays still receive no supplied time.
All no-follow, file identity/type, exclusive creation, cleanup and rename behavior
stays intact.

Six new focused cases cover the fractional boundary, epoch and pre-epoch timestamps
under both root and subpath exports. Each checks actual fixture precision, exact
whole-second preservation, submillisecond preservation within 0.01 ms and file bytes.
The existing nginx differential fixture now sets the font to the same adversarial
fractional boundary. Every existing validator, URL, status, header and body assertion
is preserved, so hosted nginx qualification exercises this defect on every run.

## Executed verification

All commands used the installed Node 22.23.4 executable. Commands and current-working
directories are recorded exactly in `receipt.json`.

| Check | Actual result |
| --- | --- |
| New focused regression against original exporter | Exit 1: 9 passed, 2 failed; both failures are the expected one-second rollover |
| Focused regression after repair | Exit 0: 11 passed, 0 failed, 0 skipped; 420 ms |
| Original full kit test command, concurrency 4 | Exit 0: 299 tests, 285 passed, 0 failed, 14 skipped; 7.894 s |
| Kit TypeScript check, original tsconfig | Exit 0 |
| Full kit ESLint, original kit config | Exit 0 |
| Whitespace check | Exit 0 |

The full kit's skips are recorded verbatim in its log. They include absent nginx,
Tor, i2pd, Docker Compose and Java I2P; existing browser/container opt-ins; and the
real-web-artifact case because this isolated checkout has no `apps/web/dist`.
**No real nginx, browser, container, transport runtime or new web-artifact pass is
claimed.** In particular, the four real nginx differential cases remain for hosted
CI. No skip condition or test configuration was changed.

An initial `/usr/bin/time` wrapper attempt exited 127 because that optional binary
is absent; it started no tests. The unchanged full kit command then completed as
reported above. This launch error is retained in the evidence.

## Independent review

`recovery_completion` reviewed the exact product commit and independently read the
raw red and green logs. Verdict: **no introduced blocker**. The reviewer checked the
negative-number/string distinction, epoch handling, byte and precision assertions,
unchanged security/atomic-export behavior, unchanged request/validator assertions,
and unchanged runtime/configuration blobs. The reviewer did not run another runtime
replay. This receipt attributes execution to the author and review to the reviewer.

The root coordinator owns integration, publication and hosted qualification. This
worker performed no remote mutation or deployment.
