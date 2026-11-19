# Browser privacy review (TM1, TM2, TM3, TM4, TM7, TM14)

Baseline: PR #222 `2bc2098298d90928eb1acafad969f28316bb05fc`, compared with PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec` and PRs #228/#231. Working source: `chatgpt/ghostpay-tm-hardening-20261118`, based on #238. This is AI-assisted source review, not an external audit.

## Existing protections and integration owners

| TM | Disposition at source review | Defaults / limitations |
|---|---|---|
| TM1 | #238 contains #231 explicit balance-action and scope/session-version guards. Reads occur only from the action; cached-client creation is checked before the address-bearing read and result publication. | No balance lookup on opening Sweep. Already dispatched network bytes cannot be recalled. Separate signing/status paths remain unchanged. |
| TM2 | Scan, BTC, Solana and TRON display provider-exposure notices at their operation controls. | Notices state IP and request exposure, do not promise anonymity. BTC sign-time outspend recheck remains disclosed. |
| TM3 | EVM default fetch sets `credentials: omit`, `referrerPolicy: no-referrer`, `cache: no-store`, `redirect: error`. | General cancellation/deadline and transport isolation remain #241 ownership. |
| TM4 | New confirmed defects listed below. | Existing credential-bearing URLs must not be deleted silently. Session-only means current page lifetime; transport preferences are not seller keys. Heuristics can miss secrets. |
| TM7 | #222's plaintext destination/source ledger is corrected in #238: in-memory seller-session ledger, reset on lock/session replacement, late completion guard, best-effort legacy cleanup. | Reuse detection only covers current session; unknown addresses have no safety guarantee. No authoritative known-wallet dataset ships; classifier branch remains inactive. |
| TM14 | #238 contains #228 per-dispatch own-node enforcement, including cached clients and retries. New corrupt/pending-storage fail-open found below. | Fresh-install default direct; own-node/Tor remain unverified against real networks. Settings accepts HTTPS/WSS only; service-level explicit loopback HTTP support is not a claim of a working browser/Tor/node deployment. |

## Confirmed findings before correction

1. **TM4: session-only endpoint export.** `buildSettingsExport` exported every explicitly selected primary/secondary URL, ignoring session-only markers and credential heuristics. Export preview displayed only hosts, while the encoded transfer retained path/query credentials. Existing full-URL general warning does not honor session-only retention intent. The source settings must remain intact; exports omit session-only and credential-looking RPC values and describe that exclusion.
2. **TM4: normalization mismatch.** `setRpcSessionOnly` recorded a raw URL but `saveSettings` compared a sanitized URL. Equivalent typed values (whitespace, host case, default port) could lose the exclusion at the storage boundary.
3. **TM4: rejected-form side effect.** Settings changed module-level session-only markers before validating delay, idle-lock bounds, pins or relayer. Clearing a marker in a form rejected later could make a subsequent unrelated preference save persist a previously session-only endpoint.
4. **TM4: heuristic false-negative escape hatch missing.** The session-only checkbox was hidden unless the heuristic flagged a URL. A user who recognized their own provider credential could not opt out of persistence when the heuristic missed it.
5. **TM4: credential path labels.** Explicit `api-key`, `auth`, and percent-encoded `token` path labels followed by short alphabetic values were unrecognized because all paths required a mixed alphanumeric token length threshold and the preceding segment was not decoded.
6. **TM14: malformed/unreadable/pending policy chooses Direct.** `loadNetworkSelection` and `effectiveSelection` converted corrupt, inaccessible or unacknowledged nondefault stored choices into Direct. The existing per-dispatch guard then accepted a cached public provider. New requested behavior is fail-closed for present invalid/unreadable or pending policy, preserving Direct only for a missing fresh-install preference and explicitly saved defaults. No provider is substituted.

## Scope

Owned changes: settings validation/exchange/UI and focused tests; narrow stored-network-selection validation and UI status plus the existing RPC selection gate. No transport primitive rewrite, recovery, signer-pin policy, checkpoint architecture, contracts, custody or relayer runtime changes.

## Verification log

- First TM4 test invocation could not load Vite because the repository's built package entries were not available yet. It executed zero test cases and is **not** red regression evidence. Log: `tm4-red.log`.
- Further failing-first and repaired-source results will be appended after execution.

## Implemented corrections

- `settings.ts` (TM4): canonicalizes session-only endpoint markers before saving/comparing, tolerates invalid comparison input, decodes path context segments and recognizes explicit credential labels even with short alphabetic values. Does not delete existing saved settings.
- `settingsExchange.ts` (TM4): excludes session-only primary/secondary RPC URLs and heuristic-detected credential-bearing RPC/relayer URLs from both availability and actual payload. An omitted relayer is absent, not the empty-string instruction to clear the receiving device's configuration. The source settings remain unchanged. Ordinary explicit empty-relayer export keeps its historical meaning.
- `Settings.tsx` (TM4): session-only is offered for every nonempty endpoint, allowing users to protect heuristic false negatives. Retention markers change only after the whole form validates.
- `networkSelection.ts`, `defaultServices.ts`, `Settings.tsx` (TM14): strict browser storage accepts complete four-field v1 selections only. Corrupt, partial, unknown-value, null, inaccessible or unacknowledged nondefault policies block RPC instead of choosing Direct. A fresh absent preference retains the established Direct/single default. Per-dispatch failures use a fixed nonretryable `RPC_URL_REJECTED` error so cached clients/retries cannot bypass the boundary. UI distinguishes invalid/pending from active policy, preserves the previous saved choice while a form is edited or a save fails, and refreshes displayed policy on storage events without replacing unsaved edits.
- `e2e/privacy-settings.spec.ts` (TM4/TM14): two deterministic full/lean browser cases cover session-only reload/exchange, retained original credential settings, denied provider dispatch under invalid/pending/own-node choices, and explicit recovery to Direct. **Added, not executed by this worker.** Coordinator owns actual full/lean execution.
- Root owns translated notices and the final documentation matrix. No external wallet dataset was invented or added. No new transport, checkpoint, recovery, custody or contract implementation was introduced by this worker.

## Verification results

Runtime: Node `v24.22.3`, Vitest `5.1.0`, installed repository dependency graph. Commands ran from the named workspace. No coverage thresholds, security gates, test excludes or configuration were changed.

| Command | Source stage | Actual result / log |
|---|---|---|
| `../../node_modules/.bin/vitest run src/lib/settingsPrivacy.test.ts src/views/Settings.test.tsx -t 'TM4\|RPC secrets' --maxWorkers=1` (web) | Test-first attempt before dist setup | Vite could not resolve built chain-adapters; 0 tests. `tm4-red.log` |
| `../../node_modules/.bin/vitest run src/lib/settingsPrivacy.test.ts src/lib/defaultServices.privacySelection.test.ts src/views/Settings.test.tsx -t 'TM4\|RPC secrets\|TM14\|corrupt profile' --maxWorkers=1` (web) | TM4 test-first | New helper suite: **4 failed**. Other two suites could not collect because net-transport was not built; no assertions attributed to them. `browser-red.log` |
| `../../node_modules/.bin/vitest run src/lib/settingsPrivacy.test.ts src/lib/settings.test.ts src/lib/settingsExchange.test.ts --maxWorkers=1` (web) | Initial TM4 helper repair | **37 passed**, 3 files. `tm4-helper-green.log` |
| `../../node_modules/.bin/vitest run src/lib/defaultServices.privacySelection.test.ts src/views/Settings.test.tsx -t 'RPC secrets\|TM14\|corrupt profile' --maxWorkers=1` (web) | TM14 test-first | Policy suite **11 failed / 1 control passed**. Settings could not collect until optional-chain dist finished. `browser-policy-red.log` |
| `../../node_modules/.bin/vitest run src/lib/defaultServices.privacySelection.test.ts -t 'null.*instead' --maxWorkers=1` (web) | Added malformed-null coverage | Three null-valued fields incorrectly resolved and failed assertions; one additional failure was a missing new catalog key during concurrent catalog setup. **Not four independent product defects.** `network-null-red.log` |
| `../../node_modules/.bin/vitest run src/views/Settings.test.tsx -t 'RPC secrets\|corrupt profile' --maxWorkers=1` (web) | UI test-first | **3 failed / 3 control passes / 19 filtered**. All three confirmed UI mechanisms reproduced before modifying Settings runtime. `settings-ui-red.log` |
| `../../node_modules/.bin/vitest run src/lib/defaultServices.test.ts src/lib/defaultServices.networkGuard.test.ts src/lib/defaultServices.privacySelection.test.ts --maxWorkers=1` (web) | Initial TM14 repair | **28 passed**, 3 files. `network-policy-green.log` |
| `../../node_modules/.bin/vitest run src/lib/defaultServices.privacySelection.test.ts -t 'truncated\|incomplete' --maxWorkers=1` (web) | Independent-review follow-up | **6 failed / 15 filtered** before requiring every canonical persisted field. `network-partial-red.log` |
| Seven-file settings/defaultServices/Settings selection listed below | Interim run overlapping new partial-policy regressions | **90 passed / 6 failed**; the six new partial-policy tests ran against the prior in-memory module load before the correction. Not final acceptance. `browser-privacy-green.log` |
| Same seven-file selection, stable corrected runtime | Strict four-field policy and UI final | **98 passed**, 7 files, exit 0. `browser-privacy-final-green.log` |
| `../../node_modules/.bin/vitest run src/lib/settingsPrivacy.test.ts -t 'relayer path' --maxWorkers=1` (web) | Final relayer export test-first | **1 failed / 4 filtered**, confirming sensitive path was exported. `relayer-export-red.log` |
| `../../node_modules/.bin/vitest run src/lib/settingsPrivacy.test.ts src/lib/settingsExchange.test.ts src/lib/settings.test.ts --maxWorkers=1` (web) | Final export extension | **38 passed**, 3 files. `settings-export-final-green.log` |
| Scoped typed ESLint, heap 1536 MiB, ten owned files | Qualification attempt | **Exit 137**, no ESLint source diagnostic. Not a lint pass. Coordinator will run final full typed qualification sequentially; no rules/config were changed. `browser-privacy-lint.log` |
| `git diff --check` on owned changed paths | Final edited source | Exit 0. Whole-checkout check separately noted a coordinator-owned ACTIVE_WORK trailing blank line. |

Seven-file command from `apps/web`:

```text
../../node_modules/.bin/vitest run src/lib/settings.test.ts src/lib/settingsExchange.test.ts src/lib/settingsPrivacy.test.ts src/lib/defaultServices.test.ts src/lib/defaultServices.networkGuard.test.ts src/lib/defaultServices.privacySelection.test.ts src/views/Settings.test.tsx --maxWorkers=1
```

The later export-only change does not modify the validated network/UI runtime. Repeated executions overlap; their test counts must not be added as unique coverage. Exact final owned source hashes are in `browser-final-source.sha256`. Coordinator owns commit pinning, full-workspace coverage, lint/typecheck, Pages/browser builds, hosted checks and publication.

## Independent review of the metadata workstream

Read the complete diffs for ReceiptPanel consent reset, CreateInvoice seller-session keyed remount and stale-result handling, scan-source cancellation checks/budget preflight, and scanPrivacy nonfinite defaults. No material blocker found in these changes. They preserve the existing invoice protocol, receipt schema and checkpoint ownership.

Executed independently:

- From `packages/scan-source`: `node ../../node_modules/vitest/vitest.mjs run src/padded.test.ts src/range.test.ts --maxWorkers=1` — **33 passed**, 2 files, exit 0. Log `browser-metadata-scan-review.log`.
- From `apps/web`: `../../node_modules/.bin/vitest run src/components/ReceiptPanel.test.tsx src/views/CreateInvoice.privacy.test.tsx -t 'TM9|TM10' --maxWorkers=1` — **8 passed / 5 deliberately filtered**, 2 files, exit 0. Log `browser-metadata-consent-review.log`.

The root and metadata reviewer independently identified the incomplete-policy-object issue in this worker's first strict-reader version; six failing regressions reproduced it before correction. Final re-review is requested separately. These are AI-assisted engineering reviews, not an external audit.

## Explicit residual limits

- Session-only endpoint lifetime is this page/tab instance and ends on reload/close. Connection preferences are intentionally tab/browser configuration, not seller-key material. Sensitive seller destination history remains separately session-scoped by the existing TM7 fix.
- Credential detection is heuristic. Unknown credential patterns can still be exported in explicitly selected endpoint sections; the user can keep any RPC endpoint session-only, and disclosure text describes the limit. No full endpoint URL is sent to a validation service.
- Removing site data or the preference key resets preferences to the documented fresh-install default. No policy tombstone, encrypted policy store, cross-tab locking or tamper-resistance infrastructure was added. The UI storage event updates status; every RPC dispatch independently reads current policy. Broader browser transport isolation stays with #241/integration ownership.
- Tor Browser is ambient user configuration. Neither the profile selector nor local/fake RPC tests prove Tor routing, public-network privacy, or real own-node compatibility. The Settings URL validator continues to require HTTPS/WSS; the existing service-level loopback HTTP capability is not exposed as a new UI/network deployment feature.
- RPC requests already dispatched before a policy change cannot be recalled. New requests, retries and reconnects consult the new policy. General transport deadline/abort behavior is not reimplemented here.
- Known-wallet classification remains inactive because no authoritative dataset ships. Local reuse warnings cover current seller-session history and do not certify an unknown address as safe.
