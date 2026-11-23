# GhostPay BUG-ONLY R12 — canonical HTTPS return origin length with explicit port (2026-11-23 UTC)

## Source pins and isolated scope

- Live `main` discovery base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Worker branch: `automation/20261123/bug/ux-flow-origin-port-length-r12`.
- Additive ownership claim commit: `84dae491b1201b0452a9d49dcb51a2efa3af343c`.
- **Failing test committed before repair:** `2c1bc357277ed7aac6b5c4759415b0f35ebe7c2d`. Test-boundary correction (still before repair): `9a53d48c3c876fff35cf37ac0a148bbc57db2a09`.
- Production repair commit: `f0409535dd1f22d9a4ed5ec0416ece759128a575`.
- Source path: `packages/ux-flow/src/ret.ts`; baseline GitHub blob `c5d78bbf35dccb53aae2dd2b25a95647bf0f255f`; fixed blob `6af9eb6ae5f50f4b0e93f01d13e3fd0575a3f9a6`.
- Dedicated test: `packages/ux-flow/src/ret.origin-port.test.ts` (pre-existing `ret.test.ts` untouched), final test blob `de42272285624bf9544df7f8d3c6ec5eaaa2eb86`.
- No dependency, interface, wallet, contract, fund, network, release, deployment, or other-owner source changes.

## Observed existing failure and root cause

`canonicalOrigin()` documents an exact WHATWG URL-origin comparison (`new URL(x).origin === x`) and permits explicit HTTPS ports. The raw input size check `o.length > 253 + 8` counted the 253-character maximum DNS hostname plus the eight characters in `https://`, but **forgot the colon and up to five decimal digits in an explicit TCP port**.

Node v22.16.0 reproduced using the exact control-flow equivalent of the main `canonicalOrigin()` function: a syntactically valid 253-character host built from labels of lengths 63, 63, 63, and 61, with `:65535`, yields a 267-character HTTPS origin. The platform URL parser returns that precise `origin`, but GhostPay returned `null`. As a result, `buildReturnUrl()` incorrectly raises `BAD_ORIGIN` and `isAllowedReturn()` rejects this otherwise legitimate invoice return destination.

The baseline reproduction asserted that the valid explicit-port origin must be accepted and **failed** with actual `null`; WHATWG parser equality, the length assertion, and ordinary short-host behavior passed.

## Test-first repair and executed verification

- New Vitest regression first checks the exact 267-character canonical origin, then its use through `buildReturnUrl` and `isAllowedReturn`, plus shorter origins, scheme, userinfo, query/path and invalid-port safeguards.
- One-expression source fix expands the existing cap to `253 + 8 + 6`. The current origin equality and unsafe-scheme/userinfo protections remain unchanged.
- A source-equivalent Node v22.16.0 replay of the repaired function passed the original failing assertion, and **12 neighboring directed checks** (four valid and eight invalid cases). This is not a full-file TypeScript execution or an actual repository Vitest pass.
- Native `git ls-remote` failed: `Could not resolve host: github.com`. Therefore local repository Vitest, lint, typecheck, full build, and browser E2E are **not run**, not implicitly green.
- Hosted exact-final-head CI and native browser qualification must be polled and recorded after opening the draft PR. No independent verifier was available in this run; do not count self-review as an independent approval.

## Owner and integration constraints

All 250 open GitHub PR changed-file inventories were inspected just before the new branch was created, including broad #238, #246, #262, #264, #278, and #372; neither selected production path nor dedicated regression test was claimed. Existing UX Flow PRs #407 and #472 own different files. Revalidate changed files and heads before any merge.

PR #390 current head: `b655bc273a6704c9c140287b8adcdf4085b91882`, ready for review (not draft), with five exact-head workflow groups succeeding (CI, Hosting kit, Pages, Beta acceptance, CLI qualification) and Snyk success, but **no submitted independent review**. Its branch and files were left untouched.

Integration branch `automation/ghostpay-integration-lock` head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`, reports `status: held`, generation 11, owner `994a0d214fb9-root-r3`. Its metadata expiration time has passed, but it has not been legitimately released; this worker did not take it over or merge.

## Handoff / qualification gates

1. On the draft PR's **exact current head** check every required hosted workflow and job, not a superseded SHA. Repair proven failures only on this branch, with test-first commits as needed.
2. Obtain actual native browser evidence where applicable, project Vitest/lint/typecheck/build, an independent submitted approval, and no dependency/ownership conflict before any integration consideration.
3. Keep PR draft and unmerged until all merge gates and legitimate integration lease ownership are satisfied. Do not release, deploy or change contracts/funds.
4. For subsequent BUG-ONLY rounds choose a different previously unowned runtime module. Avoid returning to these paths or overriding consolidation, security or fuzz owners.

## Additive self-audit correction before qualification (supersedes the earlier fixed-blob pin)

A separate neighboring check revealed a *regression introduced by the first fix*: widening the total-origin cap alone unintentionally admitted canonical-looking URLs with 254-character DNS hostnames when no port was present. The original `253 + 8` cap excluded those URLs. Node v22.16.0 confirmed the interim production fix accepted `https://${LONG_HOST}d` with 254-character hostname; that violated the preserved hostname ceiling.

- Follow-up **failing regression committed before the follow-up fix**: `71049556fc18edfe3e903e01360f8ffcf81031f5` (new invalid hostname case in dedicated test file).
- Minimal secondary source repair: `f31cc20e2685932b0de775afe67b581fb3ccb2d3` adds `if (u.hostname.length > 253) return null;` after URL parsing; no separate-owner files touched.
- **Final repaired `ret.ts` blob:** `568abc306e30d1675e95ff9e56d91fc268a83e49` (supersedes earlier interim `6af9eb6ae5f50f4b0e93f01d13e3fd0575a3f9a6`).
- **Final dedicated regression test blob:** `4c79e96f6e66de3e89c7dc0e9a49e077819d91e2` (supersedes earlier `de42272285624bf9544df7f8d3c6ec5eaaa2eb86`).
- Final source-equivalent Node v22.16.0 replay: **13/13 PASS** (four accepted ordinary / boundary cases; nine refused cases including invalid scheme, canonicalization, userinfo, overlong hostname and invalid port). The failing follow-up case now rejects. This is **not native repository Vitest or full-file source-blob execution**.
- Original reporter's URL-parser baseline bug remains fixed: the 267-character HTTPS origin with a 253-character hostname and five-digit port is accepted, while a 254-character hostname without port is rejected.

**Qualification is pinned to the forthcoming draft PR's final handoff commit, not to the earlier production-only commit.** The first hosted workflow runs may be superseded by later commits; obtain exact-current-head check results. No independent reviewer, integration-lease ownership, deployment or release is claimed.
