# Scoped cookie dependency repair — 2026-11-21 UTC

## Result and scope

Candidate branch: `repair/ghostpay-cookie-dependency-20261121-5ceb`.
Base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Product commit: `8519a14c41e473b712df427f8ea4924247bb0f95`.
Product tree: `f80cab6cb8d4d9ad9a96be81e5a7121fd524c825`.
Worker: `/root/dependency_cookie_repair`; publication coordinator: `/root`.

A version-scoped root override pins `cookie@0.7.2` below `@sentry/node@5.30.0`.
This removes the cookie advisory from the existing development-only Hardhat diagnostics
dependency graph while preserving Hardhat, fhEVM, application and cryptographic versions.
The installed consumer uses `cookie.parse` through `@sentry/utils`; the added compatibility
case exercises that actual consumer with ordinary encoded, empty, quoted and duplicate
cookies, absent headers, and existing middleware values. It does not initialize Sentry or
transmit any request. All five prior dependency-tooling tests are byte-for-byte preserved.

Exactly **one of 815 lock records** changes: `node_modules/cookie`, from `0.4.2` to `0.7.2`.
The other **814 records**, including all **222 non-development, non-link package records**,
are identical to main. The new archive integrity matches the registry metadata. No other
version, manifest dependency, source guard, application, contract, workflow, threshold,
telemetry setting or deployment behavior changes. The override is deliberately scoped to
the current Sentry version and must be reevaluated when that parent is upgraded.

## Actual qualification at the product commit

Runtime: Node `24.22.3`, npm `11.19.1`; private dependency directory in this worktree.
All listed commands ran at the product SHA above unless explicitly described as baseline.

| Command | Actual result |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=512 npm_config_maxsockets=1 npm ci --ignore-scripts --no-audit --no-fund` | Exit 0; clean install of 722 packages in 12.318 s; lock hash unchanged. |
| `npm run test:dependency-tooling` | **6 passed, 0 failed, 0 skipped**, including existing Mocha/solc integration tests and the new Sentry parser compatibility case. |
| `npm run typecheck --workspace @ghostpay/confidential-contracts` | Exit 0. |
| `HARDHAT_DISABLE_TELEMETRY_PROMPT=true npm run compile --workspace @ghostpay/confidential-contracts` | Exit 0; **36 Solidity files** compiled with the unchanged native solc `0.8.28`, Cancun target. |
| `HARDHAT_DISABLE_TELEMETRY_PROMPT=true npm test --workspace @ghostpay/confidential-contracts -- test/router.test.ts` | **30 passed, 0 failed, 0 skipped**. Local existing Hardhat/mock suite; no public network or real-funds action. |
| `npm ls cookie @sentry/node --all --json` | Exit 0; Sentry `5.30.0` resolves overridden cookie `0.7.2` below Hardhat `2.29.2`. |
| `npm run ci:scan-secrets` | Exit 0. |
| `node --check scripts/tests/dependency-tooling.test.mjs` | Exit 0. |
| `git diff --check eb59d93cffed7848c4aac37d0e9650b87239c6da HEAD` | Exit 0. |
| `npm audit --json` before / after | **17 low -> 15 low**; both exit **1**, zero moderate/high/critical. Full audit is not clean. |
| `npm audit --omit=dev --json` before / after | **0 findings**, both exit 0. |
| `npm audit --omit=dev --audit-level=high` | Exit 0; original repository CI audit policy, unchanged. |

There are **36 executed suite cases** across the two disjoint test suites. No full-application,
browser, mobile, Tor, native-Anvil or full FHE fuzz result is asserted by this worker.
Anvil is absent from this environment. Those additional applicable integration/CI gates
remain the coordinator's responsibility; no assertion or threshold was reduced.

## Lock resolution and audit limits

An initial npm 11 `install --package-lock-only --ignore-scripts --no-audit --no-fund`
returned exit 0 but left the stale cookie resolution unchanged. Its receipt is retained and
it is not counted as remediation. The documented npm 10 targeted update resolved precisely
one record:

```sh
NODE_OPTIONS=--max-old-space-size=512 npm_config_maxsockets=1 \
  npx --yes npm@10.9.8 update cookie --package-lock-only --ignore-scripts --no-audit --no-fund
```

The final npm 11 clean install succeeded. No broad unlocked resolution or `audit fix --force`
was used. Final lock SHA-256: `beadafcce959f301fb812ae96e62ffc8f07440a9f0d8cbaaa9e8b05d36f59660`.

The removed audit nodes are `cookie` and its dependent `@sentry/node`; this is one advisory
root, not two independently demonstrated vulnerabilities. The remaining 15 low audit nodes
all derive from the existing Elliptic advisory. Published metadata observed by the coordinator
still lists Elliptic `6.6.1` as current; the advisory reports no patched version. The current
fhEVM plugin `0.4.2` requires Hardhat `^2.0.0`, so the suggested Hardhat 3 ecosystem migration
is a separate compatibility task. These development-only findings are retained as unresolved,
not waived or represented as unreachable. Registry audit data is a dated advisory snapshot.

Primary sources consulted:

- [Cookie upstream advisory and patched range](https://github.com/jshttp/cookie/security/advisories/GHSA-pxg6-pf52-xh8x).
- [Unpatched Elliptic advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84).
- Pinned npm package metadata and installed Sentry consumer source; exact metadata and lock records are in the worker evidence packet.

## Ownership, preservation and next steps

The original main history and all existing PR branches are preserved. Current minor dependency
PR #210 retains cookie `0.4.2`; broader major dependency candidates #87/#253 remove its graph
through substantially wider migrations. This isolated patch does not overwrite either lane.
The existing integration lease remains held by its previous owner; expiration never authorizes
takeover. This worker changed no remote ref, PR, lock, deployment or release.

The coordinator receives `cookie-dependency-evidence/`: command receipts with times, exit codes,
source/tree pins and raw-log hashes; baseline/final full and production audits; lock-preservation
proof; source patch; exact metadata; and a verified Git bundle. Capture that packet into the
single authoritative engineering ledger. Independently review the exact final source, run
hosted required checks, and only then consider integration after the existing lease is
reconciled. This handoff is not an independent approval, merge qualification or release claim.
