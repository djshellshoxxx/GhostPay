# Static analysis report

Branch `claude/remote-extensions-1` @ `dea46be` (working tree as of 2026-10-21). Scratch: `/tmp/claude-0/assure-static/`. Nothing in the repo was modified except this file. All tools ran on a scratch copy of the tracked sources (`src/` = apps, packages minus contracts, scripts, docs/audits/poc, docs/tools; 349 files incl. tests) or a copy of `packages/contracts/{src,lib,remappings.txt,foundry.toml}` (`c/`).

## Summary

| Tool | Scope | Raw | Real issues |
|---|---|---|---|
| Slither 0.11.6, all 102 detectors, `--filter-paths lib/` | 5 contracts + interfaces | 21 | 0 (all FP/accepted-by-design) |
| Semgrep 1.182.0 + semgrep-rules (javascript, typescript, generic/secrets, solidity), trailofbits generic, 10 local rules | 339 files / 5 sol | 537 JS + 8 sol | 0 exploitable; 2 hardening items |
| CodeQL CLI (latest bundle) + 42 security queries from github/codeql main (cloned) | JS/TS 349 files | 3 (2 in tests/PoC) | 0 exploitable; 1 hardening item |
| eslint 9 + eslint-plugin-security + eslint-plugin-no-secrets | apps, packages, scripts | 148 prod + 78 test | 0 exploitable; 1 hardening item |
| `npm audit` (full and `--omit=dev`) | lockfile, 279 deps (48 prod) | 0 | 0 |
| `scripts/scan-secrets.sh` | repo | OK | 0 |

No High or Medium findings. Three Low/Info hardening items (F1-F3).

## Findings

### F1 Low (hardening): response bodies read without a byte cap in browser/client code
Evidence (Semgrep local rule `local-unbounded-body`, then manual read):
- `apps/web/src/lib/relayerClient.ts:41`: `const text = await res.text(); if (text.length > MAX_RESPONSE) throw ...` caps after the whole body is buffered, so the cap does not bound memory.
- `packages/btc-silent-payments/src/scan/blindbit.ts:118`: `await res.json()` with no size bound; `MAX_ENTRIES` (200_000) is checked only after parse (lines 167, 184).
- `apps/web/src/lib/manifest.ts:30` (`res.text()`, same-origin static file, `redirect:'error'`) and `apps/web/src/lib/release.ts:17` (`arrayBuffer()`, same-origin): trusted origin, negligible.
- Server side is fine: `apps/relayer/src/server.ts:59-84` `readBody` enforces Content-Length and a running cap, removes the listener on overflow.
Impact: a hostile or compromised user-configured relayer / BlindBit backend can stream a very large body and exhaust tab memory (availability only; no key or fund impact; endpoints are user-chosen and HTTPS-only per `settings.ts`/`blindbit.ts` URL checks).
Repro: serve `application/json` of several GB from a configured BlindBit URL and call `getTweakIndex`-type method; observe heap growth before `INVALID_RESPONSE`.
Fix: check `Content-Length` first and read `res.body` with a counting `ReadableStream` reader that aborts at the cap (apply to relayerClient and blindbit; optional for same-origin).

### F2 Info: `apps/web/scripts/scan-bundle.mjs` regexes (build-time gate)
- CodeQL `js/bad-tag-filter` at line 108: `/<script\b([^>]*)>([\s\S]*?)<\/script>/gi` does not match `</script >`; an inline script closed that way would evade the "inline script" check.
- Quadratic backtracking at line 116, `/<link\b[^>]*\bhref\s*=.../i`: measured `'<link '.repeat(n)`: 30 KB 0.42 s, 60 KB 0.77 s, 120 KB 3.0 s (`/tmp/claude-0/assure-static/t.js`). Same pattern family at line 111 (`src=`) and 89.
Impact: input is Vite build output of this repo, not attacker-controlled; CSP is the actual enforcement. Gate weakness only.
Repro: `node /tmp/claude-0/assure-static/t.js`.
Fix: parse `dist/index.html` with an HTML parser (e.g. parse5) or use `<\/script\s*>` and `<link\b[^>]*?` with bounded alternation.

### F3 Info: documentation-only: nothing else
Semgrep/ESLint secret rules produced no real secret. See triage.

## Triage

### Slither (21 results, 3 detectors; every other detector reported nothing, incl. reentrancy-*, unchecked-*, arbitrary-send-eth, controlled-delegatecall, low-level-calls, missing-zero-check, calls-loop, divide-before-multiply, incorrect-equality [suppressed with justification in-source])
- `timestamp` x9 (GhostPayRouter L99, L211; GhostPaySweepRelayer L83; PolicyAccount L146, L194, L245, L270, plus L249, L282, L349, L353): false positive / accepted. Deadlines and timelocks are inherently timestamp-based; validator drift (~seconds) is far below the timelock/deadline scale. Entries `pendingEffectiveAt != 0`, `pendingProposalId != id`, `bucket != s.bucket`, `bucket == s.bucket + 1` are plain integer comparisons tainted by the timestamp-derived `bucket`; bucket arithmetic is monotonic with no overflow for uint64 timestamps.
- `assembly` x2 (`GhostPayRouter._sendNative` L245-247, `PolicyAccount.executeWithdraw` L206-208): true positive in the literal sense, benign by design. `call(gas(), to, amount, 0,0,0,0)` copies no return data (return-bomb defence), `memory-safe` tagged, success checked, state updated before the call, both paths `nonReentrant`; destination is validated (`stealth != 0/this/FEE_RECIPIENT`) or owner-timelocked state.
- `naming-convention` x10 (`ANNOUNCER`, `FEE_RECIPIENT`, `IMPLEMENTATION`, `FEE_TOKEN`, `FLAT_FEE`, `_IMPLEMENTATION` immutables; `DOMAIN_SEPARATOR()` x3): false positive. Uppercase immutables are repo convention; `DOMAIN_SEPARATOR` is the name mandated by EIP-2612/5267 interfaces.
- Semgrep solidity pack: `non-payable-constructor` x5 and `use-nested-if` x3 are gas micro-optimisations, no security impact: false positive for security purposes.

### Semgrep JS/TS (537 findings; summary by rule)
- `generic-api-key` x197: 196 in `packages/btc-silent-payments/test-vectors/send_and_receive_test_vectors.json` (BIP-352 public vectors), 1 in a prose comment `apps/web/src/lib/tags.ts:7` ("HKDF-SHA-256 over the viewing key ..."): false positive. No 32-byte-hex literal exists in non-test, non-lib source (grep) and `scripts/scan-secrets.sh` passes.
- `jsx-not-internationalized` x195, `i18next-key-format` x10: i18n lint, not security; not applicable (app is intentionally English-only).
- `local-timing-compare-secret` x76 (my deliberately broad rule: names matching mac/tag/token/secret/signature/password/auth): all false positives on manual read of every production hit: comparisons are `=== undefined`, URL `username/password !== ''` checks, token allow-list address lookup (`service.ts:300`, public data), public address equality (`sweep.ts:37,55,177`), passphrase confirm in local UI (`SellerKeys.tsx:48`, user's own input in own tab). The one real MAC check, `apps/relayer/src/quoteToken.ts:76`, uses `crypto.timingSafeEqual` with a length pre-check: correct.
- `local-unbounded-body` x15: see F1 (5 production hits; rest tests).
- `html-in-template-string` x8: `apps/web/src/lib/qr.ts:45` builds an SVG string from integers via `String(n)` only: false positive; the rest are Playwright specs. `unknown-value-with-script-tag` x3, `unsafe-dynamic-method` x2, `unsafe-formatstring` x1, `react-insecure-request` x1, `detect-insecure-websocket` x1, `incomplete-sanitization` x1, `no-stringify-keys` x1, `local-innerhtml` x1: all in test/e2e/PoC files (the `ws://`/`http://` are test literals); false positives for production. `local-math-random` x2: only in comments stating "never Math.random" (`jitter.ts:8`, `secretBox.ts:111`): false positive.
- `detect-non-literal-regexp` x3 / `local-dynamic-regexp` x4: `scan-bundle.mjs:55` builds a regex from a constant regex's `.source`; others in tests: false positive.
- `useless-ternary` x2 (`docs/tools/third-party-table.mjs:91`, `btc-silent-payments/src/tx.ts:86`): first is a genuine redundant ternary (`? '' : ''`), cosmetic; second is a 3-way chain flagged wrongly. `no-replaceall` x5, `missing-template-string-indicator` x8 (`third-party-table.mjs:205`, intentional `${...}` strings in docs tooling): not security.
- Local rules with zero hits: hardcoded-secret in prod beyond above, weak-hash (md5/sha1/ecb), key-in-log, eval/exec/spawn(shell), `innerHTML`/`dangerouslySetInnerHTML` in prod, nested-quantifier ReDoS.
- Parse limits: 3 syntax errors (`.d.ts`-style `type` re-exports/generics unsupported by Semgrep's TS grammar, e.g. `btc-silent-payments/src/index.ts:3`) and 1 rule timeout on `api.test.ts`; those files are covered by CodeQL/ESLint.

### CodeQL (42 queries: redos, polynomial-redos, path-injection, xss*, prototype-pollution*, insecure-randomness, hardcoded-credentials, clear-text-logging/storage, request-forgery, cert validation, bad-tag-filter, incomplete-sanitization, command/code injection, weak crypto, resource-exhaustion, missing-rate-limiting, remote-property-injection, log-injection, regex-injection, stack-trace-exposure, CORS, etc.)
- `js/bad-tag-filter` `scan-bundle.mjs:108`: true positive, F2.
- `js/incomplete-sanitization` `packages/chain-adapters/src/deployments.test.ts:94`: `.replace('{', ...)` first-occurrence is intentional in a test to inject `__proto__`: false positive.
- `js/log-injection` `docs/audits/poc/poc-05-relayer-http.mjs:29`: PoC console output of local values: false positive.
- 0 results for ReDoS, XSS, path injection, prototype pollution, insecure randomness, credentials, SSRF, missing rate limiting, resource exhaustion in production code.

### ESLint security / no-secrets (config `/tmp/claude-0/assure-static/es/eslint.config.mjs`, run from `src/eslint.sec.mjs`)
- `security/detect-object-injection` x67 prod: false positive class. Bracket access with keys from typed unions/numeric indices; prototype-pollution-sensitive paths use `Object.hasOwn` (e.g. `relayer/server.ts:55`) and CodeQL prototype-pollution queries found nothing.
- `security/detect-unsafe-regex` x20 prod: false positives. All are anchored, fixed-width-group repeats over a single character class (`(?:[0-9a-fA-F]{2})*`, `{0,29}` decimals, RFC3339, `application/json` media type). Measured on 4 MB inputs: 5-100 ms (linear). Exceptions are the `scan-bundle.mjs` ones (F2).
- `security/detect-non-literal-fs-filename` x23: `relayer/config.ts:320,333`, `secrets.ts:47,56` read operator-supplied config/secret file paths (intended; `secrets.ts` stats mode/size); rest are build scripts (`scan-bundle.mjs`, `gen-release-manifest.mjs`, `normalize-sbom.mjs`) over repo paths: false positives.
- `security/detect-possible-timing-attacks` x9: same set as above, false positives (undefined checks, public addresses, local passphrase confirm).
- `no-secrets/no-secrets` x6: base64url alphabet (`base64url.ts:3`), EIP-712 typehash doc strings, doc path, embed snippet in `ghostpay-embed-v1.js`: false positives.
- `security/detect-non-literal-regexp` x1: `scan-bundle.mjs:55`, false positive.
- 2 "unused eslint-disable no-control-regex" directives (`wallet.ts:36`, `schema.ts:149`): hygiene only.

### npm audit
`npm audit --json`: 0 vulnerabilities (info/low/moderate/high/critical all 0) over 279 dependencies (48 prod, 232 dev, 27 optional); `npm audit --omit=dev`: 0. Registry reachable, so this is a live result.

## What could not be run / limits
- CodeQL: the bundle downloaded from GitHub releases (`codeql-linux64.zip`), but the query packs on ghcr.io (`pkg-containers.githubusercontent.com`) are proxy-blocked. Workaround: cloned `github/codeql` and ran queries from source with `--additional-packs`. Query compile took ~2 h on 4 cores, so the full `javascript-security-and-quality` suite (105 queries, killed at 37/105) was replaced by a 42-query security selection (`/tmp/claude-0/assure-static/sel.qls`). Code-quality queries and the remaining security queries were not run. No Solidity CodeQL exists.
- Semgrep: registry packs (`p/...`) not tried beyond the failing registry fetch; used cloned `semgrep/semgrep-rules` (javascript, typescript, generic/secrets, solidity). `trailofbits/semgrep-rules` has no JS/TS or Solidity rules at its current head (only `generic/`, shell/container rules); they ran with no relevant hits. Semgrep line text is hidden without login, so triage read source lines directly. Taint-mode "pro" rules are unavailable.
- Slither ran on `src/` only (`lib/` filtered); tests/scripts excluded by `forge build --skip`. Used the repo's local static solc, not 0.8.28 from CI.
- No Echidna/Medusa/Mythril/Halmos (out of scope for this task).
- ESLint security was run with `typescript-eslint` parser without type information; test files included in counts but excluded from triage.
- Hardening items F1/F2 were verified by reading code and the timing repro for F2; F1's memory-growth repro was not executed.
