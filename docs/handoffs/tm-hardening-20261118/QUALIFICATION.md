# TM1–TM15 qualification record

## Source

Task branch: `chatgpt/ghostpay-tm-hardening-20261118`.
Base: PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec`.
Continuation: [draft PR #249](https://github.com/djshellshoxxx/GhostPay/pull/249), stacked on #238. This committed checkpoint records implementation and artifact evidence before final hosted qualification. The PR description records the final published head/tree, equivalent synthetic merge and live exact-source check results. Results obtained after this checkpoint are recorded there without changing the tested tree merely to copy a CI status into it. No release, deployment or main merge is authorized.

Published implementation `221cfa0df5c28013118bc25fad1549eb794548ae` has tree `f73f1c36bdbf98090ee55349d0cfaf5f47999065`. The one-property Scan test typing correction is published as `f0c15de9b381ac8a13ed3c76781d7fad8b236391`, tree `e7216f1c02d46683394e0488bb35c4958e386374`. Its synthetic merge `b571f65a6febf44fbcdc3e639564cedabaef4a63` has the identical tree and ordered parents #238 then f0c15de9. The final TM5 scanner correction in this checkpoint is pinned by all five source hashes in the two dedicated review reports. Later publication identity belongs to the PR qualification table.

## Executed implementation evidence

- Full workspace library build: `NODE_OPTIONS=--max-old-space-size=1536 npm run build:libs`, exit 0. Node v24.22.3, npm 11.9.0.
- CSP regressions: original 22 cases failed 20/passed 2; two added generation/order cases failed 2/passed22. Independent malformed-HTML probes drove further corrections. The original 30-case script suite passed 30/30 using the already-installed JSDOM parser, with no scripts or resource loading enabled. The subsequent real-artifact scanner integration defect and final 79/79 suite are described below.
- Browser settings/network selection: stable seven-file selection 98/98; final export-only extension 38/38 in the affected helper selection. Failing-first and independent review details are preserved in browser-review.md and metadata-browser-cross-review.md.
- Metadata: full scan-source80/80 with original coverage gates; padding/range33/33, targeted receipt/finite14/14, invoice red3 failed/1control before correction; all invoice/session/profile cases passed in the subsequent combined selection, with the one old Infinity expectation corrected and affected42/42 rerun. Exact overlap and source bounds are in metadata-review.md.
- Relayer/chain: privacy/config125/125, web client35/35, BTC47/47, TRON/Solana91/91; each behavior correction had failing-first evidence. See relayer-chain-review.md.
- Independent peer review: settings 46/46; scan-source 33/33; invoice/receipt 8 passed with 5 filtered; separate metadata 18/18; CSP 30/30 plus 9 direct probes. Repeated executions overlap and are not extra unique coverage.
- Later independent TM1/TM7/TM8 execution on unchanged f0c15de9 runtime/test inputs: **58 passed across six files, 138 deliberately filtered, exit 0 in 21.744 seconds**. Sweep privacy17; selected Sweep integration2; destination privacy10; cursor slots13; checkpoint reconciliation7; scanClient checkpoint/session9. Exact command, per-file counts and before/after hashes are retained in `acceptance-tm1-tm7-tm8.json`. The run covers the owner's current v4 HKDF checkpoint behavior and legacy rescan policy; it does not reintroduce the superseded v3 migration design or qualify whole scanner/browser suites.
- Active web TM15 scheduler: regression-first16 failed/7 passed; intermediate20 passed/3 failed because the new budget assertions omitted the standard error-code prefix. Corrected combined attempt logged62 assertions passed across 4files, but fork-worker termination timed out and the process was interrupted with exit 130. This is incomplete process qualification, not a clean pass. A later focused scheduler/client selection on published221cfa0 completed19/19 with exit 0; it does not turn the earlier combined run into a pass. The fourth reviewer independently verified runtime/callsite/budget logic and all five source hashes.
- Prepublication light checks: secret scan,113 pinned action references and proxy/meta header consistency all exit 0. These limited checks do not replace full hosted qualification.
- Locale validation: four catalogs, zero errors; existing fallback warnings retained. Native-language review is not claimed.
- Initial whole-web typechecks and scoped typed lint attempts were killed with exit 137 without source diagnostics. These are incomplete checks, not passes. A sequential final gate and hosted CI remain necessary.
- System Chromium launch attempted using Playwright and `/usr/bin/chromium`; it aborted before application assertions with `socket() failed: Operation not permitted`. Actual full/lean acceptance is not inferred from component tests or this launch attempt.

## Inherited source-pinned gates

PR #238 head198aa5baff22272453733a0f3dcfcac0e0994eec, CI run44342340615:

- Web job135045140902:2958 passed,1 failed,1skipped and one unhandled error. Failure is `src/lib/paymentKeyExport.test.ts`, the key-wipe/sealing race; Spec18 ownership remains unchanged.
- Lint job135045141025: TM12 `payments.bulkCancellation.test.ts` had `require-await` on its rejecting mock. This continuation replaces the mock with the equivalent rejected Promise and preserves all cancellation assertions.
- Full/lean browser jobs135045141007/135045141456 failed on that inherited head only at `e2e/app.spec.ts:115`, whose fresh-load helper aborted navigation to `about:blank`: full83 passed/1 failed/1skipped; lean71 passed/1 failed/3skipped. The continuation now corrects only that test's dialog lifecycle: one explicitly expected beforeunload is accepted while leaving the seller page; all other dialogs remain unexpected and the allowance ends before invoice loading. Runtime custody and global helpers are unchanged. This is plaintext compatibility/XSS acceptance, not an encrypted-default defect. Final-source hosted results must still be examined independently.
- Rest0 job135045140851 had three inherited failures: a stale generated package map and two dependency-closure owner-review allowlists missing the existing `hygiene`/`metadata-hardening` dependencies. A fresh local `package-map.mjs --check` reproduced exit 1; factual regeneration passed all12 unchanged workspace-map tests. The allowlists expressly require owner acceptance for lean-core release scope. They are unchanged and remain separate failed gates; agent component review is not relabeled as owner approval.
- The strict contract-analysis/Mythril failure remains a separate inherited gate; no contract/analyzer/release-policy files changed.

## Baseline refresh

PR #238 remains at the chosen base. During this task, #241 merged to main as `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`; subsequently observed main `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` also includes #237. The bounded PR continues to target #238 and does not silently import other ownership lanes. No result on those separate commits is treated as qualification of this tree.

The final prepublication refresh fetched main `e454de6abfefda70d82784fafc1d8949b277c334`, which merges #242's owner-qualified idle-lock, invoice-signer and private-checkpoint integration. The core `scanCursorSlot.ts` and invoice `envelope.ts` match this stack byte for byte. The additional AppShell/scanClient integration differences belong to the unchanged #238 base; this continuation does not edit either file or overwrite the new main integration. PR249's remote head and #238 base were unchanged at this refresh.

## Hosted continuation regression and correction

The initial continuation's Pages job135390508109 and qualification job135390508402 failed at TypeScript TS2769 in the new `Scan.privacy.test.tsx`: `ByRoleOptions` does not accept `exact`. This was a new continuation regression, not an inherited failure. Commit f0c15de9 removes that unsupported option only. Installed Testing Library source confirms the retained string `name: 'Cancel'` uses exact equality; all cancellation/window-count assertions remain. The independent source review is `scan-privacy-typefix-review.md`. A clean compiler/build result on the corrected final source remains required.

At221cfa0, Integration, secrets/egress, Linux CLI and macOS CLI jobs passed. Pages ran95 Node assertions successfully before its compiler failure. Those successes are limited to that source and those jobs. The old main CI run44474152570 was superseded but still had queued summary jobs; corrected f0c15de9 CI run44476796458 was pending at this checkpoint. The browser cancellation fallback reached the public run page, which was signed out; no cancellation or account change occurred. These queue states are not test outcomes. Final current runs are linked in PR249.

## Actual CSP artifact qualification

After rebuilding the changed scan-source library successfully on f0c15de9, isolated full and lean Vite outputs were generated with normalized dummy origins from `HTTPS://RPC.Example.invalid:443,wss://rpc.example.invalid` and `GHOSTPAY_REQUIRE_TIGHT_CSP=1`. Bundling and `apply-csp` each exited0. The original bundle gate then rejected those exact configured origins in the actual enforcing `index.html` policy. Both failures are retained in `isolated-artifact-results.json` and their logs.

The bounded TM5 correction shares inert DOM/source-location extraction and exempts only the exact configured origin tokens in a single early enforcing head meta's validated `connect-src`. All other original bytes still reach the host gate. Duplicate/late/inert policies, duplicate attributes, encoded or ambiguous source and non-ASCII source separators receive no exemption. No global URL allowlist, runtime transport, workflow, dependency or release gate was changed.

- Failing-first integration selection:15 failed/28 passed. Additional explicit-null and NBSP separator regressions each failed before their correction.
- Final existing CSP plus scanner Node suites:79 passed, no failures/skips, exit 0.
- Independent review:54 synthetic probes plus both previously generated full/lean artifacts,56/56, exit 0. The unchanged `e2e/devnet/scan-dist.mjs` entrypoint also passed for each artifact, including app source, deployment and Vite checks.
- Fresh full and lean outputs were then rebuilt with the frozen correction. Vite, `apply-csp`, and unchanged `scan-dist` all exited0 in both profiles: six successful stages. The result record pins f0c15de9 plus the exact five uncommitted correction hashes. Only documentation/evidence changed afterwards. Build identification is deliberately `unknown`: these are intermediate artifact checks, not releases.

| Fresh artifact | File count | `index.html` SHA-256 |
|---|---:|---|
| Full tight CSP |19| `3f4d435b0cf4fb9107a06486760b1c40ae66b7efc36d4ef433a11bf65efb5f3d` |
| Lean tight CSP |17| `b14e0bb0121fc1aa3b161ac36f15fc3cc1f6afb5b16c04d97798e76d1f86f9be` |

Both generated `_headers` files have SHA-256 `6f3c7e83c3d110c4996d705b606b68946d8d6a78cb649f34d096f0d6acc99873`. Exact commands, environments, file inventories and logs are in the evidence archive. The original nginx renderer also generated both standard/embed artifacts successfully at 221cfa0; content inspection retained framing restrictions. No server was started or deployed, and no HTTP-header enforcement is inferred from generation. GitHub Pages does not enforce `_headers`.

These artifact-specific Vite/postbuild checks do not replace the complete TypeScript-gated web build, canonical Pages builder, full/lean Chromium or live hosting checks. The original canonical tight web build at 221cfa0 exited137 at TypeScript; canonical Pages exited1 after its compiler was killed. Their cause is not established by those exits.

## Incomplete local execution and remaining gates

The whole-web coverage run at 221cfa0 produced only the RUN/coverage header before its execution session became unavailable. No assertion totals or completion result were recovered; its exit and termination cause are unknown. The subsequent separate nocov suite was not confirmed executed. The result is explicitly inconclusive in `full-web-inconclusive.json`. The final scoped TM12 typed-lint attempt exited with signal 9 without diagnostics. Neither is a pass.

After the hosted fixture typing correction and final scanner source freeze, the web typecheck was retried with a 512 MB Node heap. It exited 134 with an explicit JavaScript heap-out-of-memory diagnostic before completion, not a TypeScript success. This identified limit applies to that retry; it does not establish the cause of the earlier exit 137 attempts.

One bounded retry with `--max-old-space-size=768 --max-semi-space-size=4` also exited 134 with a JavaScript heap-out-of-memory diagnostic, after 60.046 seconds. It produced no TypeScript success or source diagnostic. Both corrected-source attempts and exact source hashes are retained; further broad local compiler retries were stopped. Hosted compilation remains required.

All four independent roles have reported their bounded source findings. Acceptance findings about the active scheduler path and overly broad network-profile wording were corrected and independently re-reviewed. The later fixture typing and actual CSP scanner defects also received independent source review. No unresolved confirmed feature-specific source blocker was identified at this checkpoint; this does not constitute clean execution or owner approval of inherited release-scope gates.

Final exact-source typecheck/lint, complete web and applicable package coverage, full/lean Chromium, canonical Pages build/artifacts and final hosted security gates still determine qualification. The completion matrix distinguishes local passed selections, existing test definitions and unverified environments for every TM row. Real Tor/public networks, browser certificate/private-network behavior, live proxy/hosting logs and native-language review remain unverified. The PR remains draft and is not declared merge-ready while required checks are unknown or failed.
