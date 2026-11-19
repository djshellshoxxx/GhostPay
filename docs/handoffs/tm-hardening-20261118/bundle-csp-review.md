# TM5 configured CSP / bundle scanner integration

Worker: browser_privacy. Coordinator: root. Independent reviewer: acceptance_review.
Branch: `chatgpt/ghostpay-tm-hardening-20261118`.
Source before this fix: `f0c15de9b381ac8a13ed3c76781d7fad8b236391`.
Owned files: `apps/web/scripts/{scan-bundle,apply-csp}.{mjs,d.mts}` and
`scripts/tests/privacy-csp-bundle.test.mjs`. No commit created by this worker.

## Confirmed defect and ownership

The coordinator built actual full and lean artifacts with
`GHOSTPAY_CONNECT_ORIGINS='HTTPS://RPC.Example.invalid:443,wss://rpc.example.invalid'`
and `GHOSTPAY_REQUIRE_TIGHT_CSP=1`. `apply-csp` passed, but the unchanged bundle gate
rejected the normalized HTTPS/WSS origins in the actual `index.html` policy.
Original evidence: `artifact-full-bundle-scan.log`, `artifact-lean-bundle-scan.log`,
and the retained `isolated-full-tight` / `isolated-lean-tight` artifacts.

Read-only comparison of the relevant script/tests between #238
`198aa5baff22272453733a0f3dcfcac0e0994eec` and the cached #241 branch
`origin/codex/ghostpay-browser-isolation-20261118`
(`e8857bfa1ec93fafa9ff83f63f7430ef26a362c2`) found no delta. This fix changes the
artifact validation integration; it introduces no provider or browser transport
behavior and does not duplicate the #241 transport work.

## Implementation and limits

`scanBundle` retains `ownOrigin` behavior and adds optional `connectOrigins`
(validated origin array) and `requireTight` (boolean). When omitted, they use the
same parsed origin list and strict `0` / `1` environment setting as `apply-csp`.
Invalid caller or environment configuration returns a fixed diagnostic without
echoing potentially credential-bearing input. Explicit empty configuration gains
no origin exemption; requiring tight CSP with an empty list fails.

With configured origins or a required tight policy, the scanner calls the
existing artifact validator for `index.html` and `_headers`. Missing, stale,
broadened, duplicated, inert or mismatched policies fail. Static help/privacy
pages retain their existing policy and external-documentation navigation rules.

The existing inert JSDOM policy extraction is shared with the scanner and now
retains source locations. Only a direct head meta that precedes other elements
can qualify. Late duplicate head policies are counted and rejected too. A
content source range is usable only when parsed attribute spans account for the
entire tag with no duplicate/malformed gaps and the literal quoted source value
equals the parsed policy. Entity-encoded or otherwise ambiguous policy source is
conservatively rejected for this generated-artifact exception.

After validating the exact configured `connect-src`, only its origin portion in
that content attribute is blanked for the generic host scan. That source portion
must also tokenize to the configured origins using only ASCII separators; broader
JavaScript whitespace normalization cannot authorize an exemption. Every other source
byte remains visible: the same hostname in `img-src`, `report-uri`, another
attribute, HTML text/comment, JS, CSS, worker or another page receives no new
allowance. Inline-code, remote-resource, source-map, worker-network, preserved-code,
deployment and source-sink gates remain in place. This does not allow a provider
origin to be embedded in application code.

## Executed verification

1. `node --test --test-concurrency=1 scripts/tests/privacy-csp-bundle.test.mjs`
   before implementation: **15 failed / 28 passed**. `bundle-csp-red.log`.
2. `node --test --test-concurrency=1 scripts/tests/privacy-csp.test.mjs scripts/tests/privacy-csp-bundle.test.mjs`
   after initial implementation: **73 passed**, no failures/skips. `bundle-csp-green.log`.
3. `node --test --test-name-pattern='TM5 scanner rejects null' scripts/tests/privacy-csp-bundle.test.mjs`
   exposed explicit null caller configuration being treated as absent: **1 failed**.
   `bundle-csp-null-red.log`. The fallback now applies only to `undefined`.
4. `node --test --test-name-pattern='non-ASCII source separator' scripts/tests/privacy-csp-bundle.test.mjs`
   reproduced NBSP normalization incorrectly authorizing masking: **1 failed**.
   `bundle-csp-separator-red.log`. The source-token guard now requires ASCII separators.
5. Final repeat of the two-file Node command above: **79 passed**, no
   failures/skips. `bundle-csp-final-green.log`.
6. Scoped `git diff --check`: exit 0.

These are focused Node artifact-validation regressions. This worker executed no
build, browser suite, typed lint or full typecheck.

## Independent review

`acceptance_review` independently approved the final frozen source with no
unresolved blocker. Its evidence probe passed **56 checks**: 54 synthetic cases
plus scans of the existing actual full/lean artifacts. The unchanged
`apps/web/e2e/devnet/scan-dist.mjs` entrypoint was also run separately on each
artifact with the strict environment; both exited 0. The reviewer reused the
coordinator's existing artifacts and did not rebuild either profile. These
counts overlap and are not additional unique application/browser test coverage.

Report: `tm5-scanner-acceptance-review.md`. Logs:
`acceptance-csp-bundle-probes.log`, `acceptance-artifact-full-bundle-scan.log`,
`acceptance-artifact-lean-bundle-scan.log`. One initial reviewer-harness diagnostic
matcher was corrected without product-source changes; its initial log is
preserved and is not a product regression. Fresh artifact rebuilds and final
hosted qualification remain coordinator-owned.

## Frozen source SHA-256

```text
26736f6b00fc1933ed491c575803f6bc1b5a96739f02e3b11f49bf6b788fcec1  apps/web/scripts/scan-bundle.mjs
86903d7a3a577f7fb4f501079de7f93976111516d8af3bc341b878427d11e560  apps/web/scripts/scan-bundle.d.mts
914a80cab61dbe0a3f203a6cd2b6b305de63ebe224a0dd2979c969e52dea7139  apps/web/scripts/apply-csp.mjs
80305a634d1cbe1863d35b4e46df6243ff2fbaaafe35e0f2563e5475b0ee65b5  apps/web/scripts/apply-csp.d.mts
0d184d94dd418d5b897e1436815f1e1859c152ab3cc888dd5e6e45dd442418a8  scripts/tests/privacy-csp-bundle.test.mjs
```
