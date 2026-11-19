# Combined remaining-work qualification — 2026-11-19

This receipt preserves actual execution on the coordinator candidate. It does not
substitute for the complete hosted matrix or a main-merge confirmation.

| Source | Command or selection | Result |
|---|---|---|
| `cbed997a1fd8398975feac8fa23f9162a65f7e73` | `npm run build:libs` | PASS, 358.603 seconds, Node 22.23.4, 768 MiB heap cap; source unchanged throughout |
| `fe7a598d589057c139ef0f823fa02b7c0cc38e04` | Relayer-guard build after the later relayer integration | PASS, 4.466 seconds |
| `fe7a598d589057c139ef0f823fa02b7c0cc38e04` | Seven selected web payment/policy/relayer-client test files | PASS, 111/111 tests, zero skips, 48.780 seconds |
| `fe7a598d589057c139ef0f823fa02b7c0cc38e04` | `playwright test e2e/focus-scope.spec.ts --list` | PASS discovery only, 3.539 seconds; browser assertions NOT EXECUTED |
| `fe7a598d589057c139ef0f823fa02b7c0cc38e04` | Typed ESLint on Pay.supported and focus-scope, 512 MiB heap | FAILED, exit -6, JavaScript heap exhaustion after 18.278 seconds |
| `fe7a598d589057c139ef0f823fa02b7c0cc38e04` | Same typed ESLint command, bounded 768 MiB retry | PASS, 24.072 seconds; source unchanged throughout |
| `fe7a598d589057c139ef0f823fa02b7c0cc38e04` | `node scripts/i18n/check.mjs` | PASS, 1.076 seconds; draft/native-review limitations remain |
| `fe7a598d589057c139ef0f823fa02b7c0cc38e04` | `node scripts/i18n/extract.mjs` | PASS, 0.760 seconds; unused keys remain reported |

The web selection covers `Pay.supported`, `pay.permitNonce`, `pay.quoteAge`,
`relayerClient`, `PolicyAssetCoverage`, policy `send` and policy `pay.selfcheck`.
It includes the two new full/lean v1-buffer cases: unchecked at entry, explicit
opt-in before the amount appears, visible public-linkage disclosure and no wallet
discovery during those checks.

The restored focus acceptance test checks rejected-paste focus and successful
navigation focus using the actual active element. The test was discovered and
independently source-reviewed; it has not been executed in a local browser. The
previously recorded Chromium socket/startup restriction is not a test pass.

Independent review of the coordinator documentation is recorded in
[the security cross-review](../../handoffs/agents/SECURITY_CROSS_REVIEW_20261119.md).
The acceptance-test changes have their own
[focus/buffer source review](../../handoffs/agents/WEB_SCOPE_REVIEW_20261119.md).
The [machine receipt](COMBINED_QUALIFICATION_20261119.json) records exact commands,
tool versions, source identities, outcomes and SHA-256 hashes of every raw log.
No coverage threshold, timeout, security gate or assertion was weakened.
