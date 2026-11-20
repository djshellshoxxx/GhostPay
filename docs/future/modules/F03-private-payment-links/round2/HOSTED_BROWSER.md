# F03 original hosted browser investigation

Investigator: `f03_hosted_browser`

Recorded: 2026-11-20 UTC

Scope: original CI run `44692101562`, attempt 1, at PR #310 head
`976d26ee791836c176431c8a5d0b825486f78caf`. This report records the failing
pre-repair run. It does not qualify any later repair.

## Conclusion

Both hosted profiles executed all six new request-file fixtures. In each profile,
two completed and passed; four stopped at exact-text memo assertions. Every
retained failure snapshot shows the expected memo in the payment-review paragraph.
The concrete failure is an introduced F03 test-locator defect: the test searches
for an element whose complete text is the bare memo, while the existing paragraph
contains `Memo:` followed by that memo.

The memo renderer is unchanged from the base branch. No product defect is
established by these failures. No unrelated baseline browser test failed in this
run. The four incomplete fixtures still require execution after the assertion
repair, including all statements that the earlier failures prevented from running.

Evidence: [bounded machine-readable record](evidence/ci44692101562-browser-evidence.json),
[original CI run](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562).

## Source and checkout identity

| Identity | Verified value |
| --- | --- |
| Repository / PR | `djshellshoxxx/GhostPay` / #310 |
| Source head | `976d26ee791836c176431c8a5d0b825486f78caf` |
| Base | `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` |
| Actual hosted checkout | `18c2806e70bb9f1af05edc293e9350bd9c638f2f`, PR merge ref |
| Merge parents | Base `773a94be…`, source head `976d26ee…` |
| Checkout and source-head tree | `91a8610bfd6cb2015f57d7fa32b5dc38d962bdf3` |
| Prior local checkpoint | `30eb81741fa8cdc5683d710000b218d83ca3b4e2`, same tree |
| Workflow | `.github/workflows/ci.yml`, run `44692101562`, attempt 1 |
| Run result | Completed, failure; updated `2026-11-20T11:29:35Z` |

Both job logs, lines 129 and 132, identify the actual checkout:

```text
HEAD is now at 18c2806 Merge 976d26ee791836c176431c8a5d0b825486f78caf into 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5
18c2806e70bb9f1af05edc293e9350bd9c638f2f
```

The GitHub commit API independently confirms the merge parents and tree.
The tree comparison permits the original local checkpoint to be used for source
inspection without assuming a historical handoff identifies the hosted checkout.

## What actually executed

| Profile / job | Suite result | F03 result |
| --- | --- | --- |
| [Full / 136181689920](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562/job/136181689920) | 89 collected; 84 passed, 4 failed, 1 skipped; 3.5m | 6 executed; 2 passed, 4 failed, 0 skipped |
| [Lean / 136181689927](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562/job/136181689927) | 79 collected; 72 passed, 4 failed, 3 skipped; 3.3m | 6 executed; 2 passed, 4 failed, 0 skipped |

The logs contain the actual profile environment values:
full line 445, `GHOSTPAY_LOCAL_BUILD_PROFILE: full`; lean line 446,
`GHOSTPAY_LOCAL_BUILD_PROFILE: lean`. Both invoke
`npm run test:e2e --workspace @ghostpay/web`.
Pinned `apps/web/playwright.config.ts` passes that profile to its build process,
builds and previews the app, and runs one worker. The ten-test collection
difference is consistent with its existing lean exclusion of embed SDK tests.

All F03 result lines identify project `desktop`. This is desktop Chromium
evidence. The device projects select accessibility/device specifications and
therefore do not execute this file. The separate devnet journeys are excluded
from this configuration. There is no real-wallet or real-payment qualification
claim here.

The full log lists the six F03 outcomes at lines 523–528 and the final totals at
678–684. The lean log lists them at 514–519 and 669–675 respectively. The machine
record retains these original lines, including timestamps.

| Fixture in `apps/web/e2e/payment-request-file.spec.ts` | Full | Lean | First failing source assertion |
| --- | --- | --- | --- |
| Plain invoice retains exact envelope without implicit effects, line 74 | Failed | Failed | Line 95, bare `Synthetic invoice file note` |
| Bearer-encrypted invoice retains exact envelope without implicit effects, line 74 | Failed | Failed | Line 95, same memo |
| Passphrase request remains closed until unlock succeeds, line 101 | Failed | Failed | Line 125, bare `Synthetic confidential note` |
| Invalid replacement clears preview; identical valid file can be retried, line 129 | Passed | Passed | None; entire fixture completed |
| Successive files open their own signed terms without refresh, line 154 | Failed | Failed | Line 173, bare `Synthetic request B` |
| Corrupted signed amount remains untrusted and blocks payment, line 185 | Passed | Passed | None; entire fixture completed |

The whole-suite skips are unrelated to F03. Full skips the lean-only backup-panel
case. Lean skips the combined backup panel, Bitcoin native-worker case, and tag
archive retry. Exact names and log lines are retained in the machine record.
The other 22 CI jobs report success; their individual test execution was not
investigated in this lane, so that status is not asserted as per-test evidence.

## Failure, rendered memo, and source cause

All four failures in each profile have `expect(locator).toBeVisible()`,
`Timeout: 10000ms`, and `Error: element(s) not found`. For plain and bearer
cases the actual locator is:

```text
getByText('Synthetic invoice file note', { exact: true })
```

The preceding `Review payment` and `Fixed: 0.5 ETH` assertions completed.
The passphrase case also completed its decrypted confidential-item assertion.
The successive-file case completed `Fixed: 0.75 ETH`.

The retained browser snapshot contradicts a missing-memo interpretation:

```yaml
- paragraph:
  - strong: "Memo:"
  - text: Synthetic invoice file note
```

All four full-profile contexts show `strong: "Memo:"` at line 114 and the memo
text at line 115. All four lean contexts show the same structure at lines
107–108. The passphrase context contains `Synthetic confidential note`; the
successive-file context contains `Synthetic request B`. Thus all eight failed
contexts contain their expected memo.

At the pinned source head, `apps/web/src/views/Pay.tsx`, lines 1106–1110,
renders:

```tsx
{inv.memo !== undefined && (
  <p className="wrap">
    <strong>{t('pay.memo.label')}</strong> {safeText(inv.memo).text}{safeText(inv.memo).flagged ? ` ${t('pay.memo.flagged')}` : ''}
  </p>
)}
```

The same five-line block occurs at base revision `773a94be…`, lines 1094–1098.
The complete paragraph text includes the label; there is no child element whose
complete text is just the memo. The new exact bare-text locator therefore cannot
match this existing rendered structure.

### Completed assertions versus completed fixtures

These are sequential-source interpretations of the observed failure location,
not substitute reruns of the failed fixture:

- **Plain and bearer cases:** the downloaded wrapper equality, staged preview,
  unchanged URL/storage/wallet snapshot, no new requests, explicit open,
  payment-review heading, and fixed amount were reached successfully
  (lines 78–94). The memo assertion at 95 failed. Post-open wallet equality
  and absence of the final-check heading at 96–97 were not reached.
- **Passphrase case:** wrapper identity and passphrase absence from the file,
  passphrase preview, confidential-item absence, wrong-passphrase rejection,
  and correct unlock to the review/item completed before line 125 failed.
  The final wallet-methods check at 126 was not reached. The earlier memo-absence
  assertion at 114 used the same defective bare exact locator: its execution
  passed, but it is not reliable evidence that a labeled memo would be absent.
- **Successive-file case:** first-file staging, replacement with the second file,
  and opening the second fixed amount completed before line 173 failed.
  The old-memo absence at 174, forget/reopen of request A at 175–180, and final
  URL/wallet checks at 181–182 were not reached.
- **Invalid-replacement fixture:** completed in both profiles. Malformed,
  oversized, and invalid-UTF-8 selections cleared the staged preview; identical
  valid-file retries and explicit clear worked; the final wallet-methods
  assertion completed.
- **Corrupted-signature fixture:** completed in both profiles. The invalid
  signature remained visible, Continue was disabled, Prepare payment was absent,
  and the final wallet-methods assertion completed.

## Retained artifact provenance

| Artifact | ID | Bytes | Verified ZIP SHA-256 |
| --- | --- | ---: | --- |
| [Full failure results](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562/artifacts/14617959493) | `14617959493` | 56,492 | `6d7c34372a3c53c5ea03f48b7f15e54559e6376ef93b04af5900e936da6e8096` |
| [Lean failure results](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562/artifacts/14618107784) | `14618107784` | 56,263 | `a2395728ca3dc4ef0d3489273519ad480dde94f1ea305fdf1c3d7b7d8d65d8e3` |

The downloaded byte hashes match GitHub's artifact metadata. Each ZIP has
50 members and four relevant error contexts. They expire November 27, 2026.
The inspected member paths are:

- `payment-request-file-reque-79024-ce-without-implicit-effects-desktop/error-context.md`
- `payment-request-file-reque-f1610-ce-without-implicit-effects-desktop/error-context.md`
- `payment-request-file-passp-32f2b-isting-unlock-flow-succeeds-desktop/error-context.md`
- `payment-request-file-succe-aaa7c-erms-without-a-page-refresh-desktop/error-context.md`

The machine record keeps only bounded review/amount/memo snapshot excerpts,
literal failure/result log excerpts, source references, identifiers, and digests.
Generated invoice envelopes, passphrases, keys, storage snapshots, unrelated
fixture data, full logs, screenshots, ZIPs, and temporary download URLs are not
retained in this report's files.

The workflow's successful-browser build record and artifact steps, numbers 8
and 9, were skipped after the failed test step. This run therefore provides
failure-context artifacts, not a successful browser-tested-build record.

## Minimal repair and remaining qualification

The coordinator owns the test repair. Match the full rendered memo paragraph
while preserving exact positive text checks; scoping it to the existing
`Review payment` region is suitable. Correct positive lines 95, 125, 173, and
the latent line 180. Correct the negative checks at 114 and 174 too: the current
bare exact locator can falsely report absence for a present labeled memo.
A broad page-text absence check is suitable for the pre-unlock confidentiality
assertion; exact full memo text can check stale request A.

After independent review, execute all six fixtures in both full and lean at the
repaired head and preserve the actual hosted results. The post-failure statements
listed above remain pending until that execution completes. Keep the original
checks, timeouts, profile gates, and product rendering intact unless new evidence
establishes a separate defect.

This investigator performed read-only GitHub/source inspection, hashed and read
the two ZIPs in memory, and wrote only this report and its bounded evidence.
No local browser suite, product edit, dependency change, staging, commit,
workflow rerun, merge, or deployment was performed by this lane.
