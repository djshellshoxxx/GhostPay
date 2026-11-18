# SonarCloud exact-head triage — 2026-11-09

## Evidence recovered

The [Sonar check run](https://github.com/djshellshoxxx/GhostPay/runs/128302927200) for PR #84 head `48b6bc20108079bb7fbf89997249734bf9f41646` is completed/failure: **D Security Rating on New Code, required A**. GitHub's public check-run API supplied the following 12 annotations even though the Sonar service could not be queried directly.

Source: `GET https://api.github.com/repos/djshellshoxxx/GhostPay/check-runs/128302927200/annotations?per_page=100`, retrieved 2026-11-09 08:29 UTC. These are annotation levels, **not** Sonar severity, rule type, vulnerability status or quality-gate causality. The payload omits those fields. The 12 annotations cannot establish which issue caused the D rating, or that there are no additional issues in Sonar's project inventory.

| Sonar issue ID | File / line on the checked head | Annotation level | Message |
|---|---|---|---|
| `AaG0MXJNWrHHQUT4Ukgk` | `apps/web/src/features/btc/BtcView.headers.test.tsx:353` | failure | Add at least one assertion to this test case. |
| `AaG0MXQfWrHHQUT4Ukgn` | `apps/web/e2e/flowMocks.ts:81` | warning | Prefer `Number.parseInt` over `parseInt`. |
| `AaG0MXQfWrHHQUT4Ukgq` | `apps/web/e2e/flowMocks.ts:99` | warning | Prefer `Number.parseInt` over `parseInt`. |
| `AaG0MXJNWrHHQUT4Ukgl` | `apps/web/src/features/btc/BtcView.headers.test.tsx:606` | failure | Add at least one assertion to this test case. |
| `AaG0MXQfWrHHQUT4Ukgo` | `apps/web/e2e/flowMocks.ts:92` | warning | Prefer `Number.parseInt` over `parseInt`. |
| `AaG0MWyTWrHHQUT4Ukgi` | `packages/btc-silent-payments/src/header.ts:68` | failure | Use `Math.trunc` instead of `\| 0`. |
| `AaG0MXTNWrHHQUT4Ukgs` | `tools/portable-hosting-kit/src/wizard.mjs:94` | warning | Using http protocol is insecure. Use https instead. |
| `AaG0MXIuWrHHQUT4Ukgj` | `apps/web/src/views/Pay.tsx:1001` | warning | `tabIndex` should only be declared on interactive elements. |
| `AaG0MXQfWrHHQUT4Ukgp` | `apps/web/e2e/flowMocks.ts:93` | warning | Prefer `Number.parseInt` over `parseInt`. |
| `AaG0MXN_WrHHQUT4Ukgm` | `apps/web/src/components/Disclosure.tsx:89` | warning | `tabIndex` should only be declared on interactive elements. |
| `AaG0MXTNWrHHQUT4Ukgr` | `tools/portable-hosting-kit/src/wizard.mjs:94` | warning | Using http protocol is insecure. Use https instead. |
| `AaG0MXYDWrHHQUT4Ukgt` | `scripts/audit/gen-audit24-report.py:90` | failure | Make sure publicly writable directories are used safely here. |

## Source-level triage

- **Audit script public-directory annotation (`Ukgt`).** Line 90 compiles a regular expression that redacts historical scratch path strings from report text. `clean()` calls `SCRATCH.sub`; the match is not used as an I/O path. Actual report I/O is confined to `docs/audits`, uses a staged file in the destination directory, checks regular files and preserves constrained permissions. The marked line does not demonstrate unsafe public-directory use. Existing path, symlink, mode and interrupted-write tests were run below. No suppression or issue-state change was made.
- **Wizard HTTP annotations (`Ukgr`, `Ukgs`).** Line 94 supplies illustrative `.onion` / `.b32.i2p` origin text to a CLI prompt; it performs no request. Its clearnet hint is HTTPS. `src/config/host-config.mjs:141` requires HTTPS for clearnet and separately validates the chosen transport; the Tor/I2P examples do not introduce a clearnet downgrade. Actual live Tor/I2P hosting is not exercised by this inspection.
- **Header integer annotation (`Ukgi`).** `u32le(raw, 0) | 0` converts an unsigned 32-bit header version to a signed 32-bit value. Replacing it with `Math.trunc` would preserve positive values above `2**31 - 1` and change semantics. Do not apply that suggestion mechanically.
- **Test assertions (`Ukgk`, `Ukgl`).** The loading/Forget test asserts through `updateTo`, while the deletion-refusal test awaits `screen.findByText`, which rejects if the expected message is absent. The annotations do not show that these tests cannot fail. Explicit assertion style can be considered separately, without weakening their behavior.
- **Other annotations.** Four `Number.parseInt` preferences and two `tabIndex` findings need ordinary style/accessibility review if selected; they are not identified by this payload as the cause of the security rating. No code was changed merely to silence them.

This is a bounded source review, not an external audit or a claim that the Sonar gate is a false positive.

## Remaining blocker

Both direct ordinary HTTPS calls returned HTTP 403 with a CloudFront HTML `Request blocked` response:

- `https://sonarcloud.io/api/issues/search?componentKeys=djshellshoxxx_GhostPay&pullRequest=84&resolved=false&types=VULNERABILITY&ps=100`
- `https://sonarcloud.io/api/qualitygates/project_status?projectKey=djshellshoxxx_GhostPay&pullRequest=84`

The web retrieval tool also could not access the issues endpoint. The observed response was from CloudFront; this run does **not** attribute it to an explicit environment-policy denial. GitHub API reads were successful. `gh api` was unavailable without GitHub CLI authentication; public `curl` supplied the read-only data instead.

To close the blocker, retrieve the PR84 issue inventory with rule IDs, vulnerability/security-hotspot classification, severity and new-code status through an authorized Sonar session, then reproduce any actual finding. Keep the gate unchanged and retain it as failing until a later exact-head analysis establishes otherwise. #88's narrow green checks do not requalify #84's full diff.

## Executed validation

On parent source `0a68a57b77a70d3bcf4635ccbc5190d735e71f40` (same inspected script behavior as #84), Node 24.22.1:

| Command | Result |
|---|---|
| `node --test scripts/tests/audit-report-paths.test.mjs` | 4 passed, 0 failed, 0 skipped; exit 0 |
| `python3 scripts/tests/audit-cli.test.py` | 13 passed; exit 0 |
| `python3 scripts/tests/audit-permissions.test.py` | 16 passed; exit 0; includes the previous 13 inherited base cases |

No Sonar scanner, browser/wallet/chain flow or full application suite was run for this documentation-only audit. The coordinator records final product validation separately.
