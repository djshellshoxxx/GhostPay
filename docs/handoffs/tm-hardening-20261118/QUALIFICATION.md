# TM1–TM15 qualification record

## Source

Task branch: `chatgpt/ghostpay-tm-hardening-20261118`.
Base: PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec`.
The initial implementation is under review; final commit identity and hosted results are pending and will be recorded below before handoff. No release, deployment or main merge is authorized.

## Executed implementation evidence

- Full workspace library build: `NODE_OPTIONS=--max-old-space-size=1536 npm run build:libs`, exit 0. Node v24.22.3, npm 11.9.0.
- CSP regressions: original 22 cases failed 20/passed 2; two added generation/order cases failed 2/passed22. Independent malformed-HTML probes drove further corrections. Final current 30-case script suite passes 30/30 using the already-installed JSDOM parser, with no scripts or resource loading enabled.
- Browser settings/network selection: stable seven-file selection 98/98; final export-only extension 38/38 in the affected helper selection. Failing-first and independent review details are preserved in browser-review.md and metadata-browser-cross-review.md.
- Metadata: full scan-source80/80 with original coverage gates; padding/range33/33, targeted receipt/finite14/14, invoice red3failed/1control before correction; all invoice/session/profile cases passed in the subsequent combined selection, with the one old Infinity expectation corrected and affected42/42 rerun. Exact overlap and source bounds are in metadata-review.md.
- Relayer/chain: privacy/config125/125, web client35/35, BTC47/47, TRON/Solana91/91; each behavior correction had failing-first evidence. See relayer-chain-review.md.
- Independent peer review: settings46/46; scan-source33/33; invoice/receipt8passed with5filtered; separate metadata18/18; CSP30/30 plus9 direct probes. Repeated executions overlap and are not extra unique coverage.
- Active web TM15 scheduler: regression-first16failed/7passed; intermediate20passed/3failed because the new budget assertions omitted the standard error-code prefix. Corrected final attempt logged62assertions passed across4files, but fork-worker termination timed out and the process was interrupted with exit130. This is incomplete process qualification, not a clean pass. The fourth reviewer independently verified runtime/callsite/budget logic and all five source hashes.
- Prepublication light checks: secret scan,113 pinned action references and proxy/meta header consistency all exit0. These limited checks do not replace full hosted qualification.
- Locale validation: four catalogs, zero errors; existing fallback warnings retained. Native-language review is not claimed.
- Initial whole-web typechecks and scoped typed lint attempts were killed with exit137 without source diagnostics. These are incomplete checks, not passes. A sequential final gate and hosted CI remain necessary.
- System Chromium launch attempted using Playwright and `/usr/bin/chromium`; it aborted before application assertions with `socket() failed: Operation not permitted`. Actual full/lean acceptance is not inferred from component tests or this launch attempt.

## Inherited source-pinned gates

PR #238 head198aa5baff22272453733a0f3dcfcac0e0994eec, CI run44342340615:

- Web job135045140902:2958passed,1failed,1skipped and one unhandled error. Failure is `src/lib/paymentKeyExport.test.ts`, the key-wipe/sealing race; Spec18 ownership remains unchanged.
- Lint job135045141025: TM12 `payments.bulkCancellation.test.ts` had `require-await` on its rejecting mock. This continuation replaces the mock with the equivalent rejected Promise and preserves all cancellation assertions.
- Full/lean browser jobs135045141007/135045141456 failed on that inherited head only at `e2e/app.spec.ts:115`, whose fresh-load helper aborted navigation to `about:blank`: full83passed/1failed/1skipped; lean71passed/1failed/3skipped. The continuation now corrects only that test's dialog lifecycle: one explicitly expected beforeunload is accepted while leaving the seller page; all other dialogs remain unexpected and the allowance ends before invoice loading. Runtime custody and global helpers are unchanged. This is plaintext compatibility/XSS acceptance, not an encrypted-default defect. Final-source hosted results must still be examined independently.
- Rest0 job135045140851 had three inherited failures: a stale generated package map and two dependency-closure owner-review allowlists missing the existing `hygiene`/`metadata-hardening` dependencies. A fresh local `package-map.mjs --check` reproduced exit1; factual regeneration passed all12 unchanged workspace-map tests. The allowlists expressly require owner acceptance for lean-core release scope. They are unchanged and remain separate failed gates; agent component review is not relabeled as owner approval.
- The strict contract-analysis/Mythril failure remains a separate inherited gate; no contract/analyzer/release-policy files changed.

## Baseline refresh

PR #238 remains at the chosen base. During this task, #241 merged to main as `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`; subsequently observed main `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` also includes #237. The bounded PR continues to target #238 and does not silently import other ownership lanes. No result on those separate commits is treated as qualification of this tree.

## Remaining qualification at this checkpoint

Final exact-source typecheck/lint, complete web and affected package coverage, full/lean Chromium, Pages/CSP artifacts, secret/egress scans, final hosted checks and fourth coverage/integration review are pending. This document deliberately does not mark the work merge-ready while those results are unknown or failed.
