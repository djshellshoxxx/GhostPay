# Hosted timestamp-repair qualification

PR #267 head `c3a693e87053fbe91219f8edfe159a5ec0a37a34` completed Hosting kit run `44497615337`, attempt 1. Raw logs and native Git Data confirm checkout `d97980dd98aa4ba0cb21dccdccf58f5949c63371` has exactly the same full tree `7cfbb2835be8a3c58ccd5dd549fbb2ecabcccfac`. This records existing hosted execution; no local tests or native services ran during this review.

## Executed results

| Scope | Result |
| --- | --- |
| Kit job 135468723862 | 302 tests: 296 passed, 0 failed, 6 skipped; 3 suites |
| Kit lint and TypeScript check | Both successful |
| Native nginx configuration | Generated root/subpath/IPv6/unix/GhostPay-header and container configurations accepted |
| Preview versus native nginx | Root and subpath full differential matrices and normative-semantic checks passed |
| Docker nginx | Actual HTTP headers, full differential matrix and runtime-hardening checks passed |
| Timestamp regression controls | All six boundary/epoch/pre-epoch cases under root and subpath passed |
| Demo/package workflow | Creation, validation, packaging and internal-consistency verification passed |
| Separate web qualification job 135468724333 | Web TypeScript/Vite build, 19-file bundle scan, validation, packaging and verification passed |
| Separate Chromium CSP smoke | 1 passed, 0 failed, 0 skipped |

The differential fixture sets `assets/font.woff2` to fractional-second timestamp `1795078174.9996`. Existing status, kit-header, ETag, Last-Modified and body comparisons remain active. Both native-nginx suites passed rather than skipping. The kit has no separate build script; the real web build belongs to the sibling qualification job. Its library-build action was cache-skipped, so a fresh library compilation is not claimed.

## Explicit limits

Six kit skips remain recorded exactly in receipt.json: i2pd execution without an available network namespace, Java I2P runtime, opt-in Chromium in that job, the unbuilt net-transport comparison, the unbuilt real web artifact in that job, and root-required user-switch validation. The sibling Chromium/artifact execution is separate evidence and does not erase those skips. No Tor Browser, live I2P, wallet or coverage acceptance is claimed.

The overall PR snapshot had 8 successful and 20 queued checks. This closes the focused hosted nginx/differential evidence gap; it is not whole-PR CI success or approval to bypass remaining gates. Main subsequently advanced separately. The broader feature candidate has different application source, and the coordinator's local 286-pass/13-skip kit run remains a distinct run.

The raw logs are losslessly gzip-compressed, preserving the initial BOM, ANSI escapes, timestamps and whitespace. receipt.json records raw/stored byte counts and SHA256 hashes. native-metadata.json retains retrieved source/run/job/check metadata. Archive verification establishes internal consistency, not independently authenticated publisher identity. No product edits, remote mutation, deployment or native execution occurred during this review.
