# GP-BUG — Rendered invoice text marker-expansion bound

Date: 2026-11-21
Base: `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`
Branch: `automation/20261121/bug/display-text-expansion-bound-r1`
Owned source: `apps/web/src/lib/displayText.ts`
New regression: `apps/web/src/lib/displayText.boundary.test.ts`

## Reproduction and root cause

The existing `safeText` implementation clips the untrusted input to `MAX=4096` UTF-16 units before calling the address-safety sanitizer. On rejected text it replaces invisible/control Unicode with visible `⟦U+XXXX⟧` markers. On accepted mixed-script text the sanitizer adds visible `⚠` markers. Both branches can expand the result after the input-size check, defeating the documented overlong-text truncation in invoice memos, line-item descriptions, and printable bills.

Source-equivalent Node v22.16.0 execution of the baseline implementation returned:

| Input | UTF-16 input units | Baseline output units |
| --- | ---: | ---: |
| U+200B repeated | 4096 | 32768 |
| `aа ` repeated 1365 times | 4095 | 5460 |
| ASCII 4090 units followed by six U+200B | 4096 | 4138 |
| Mixed-script token + ASCII + terminal emoji | 4096 | 4097 |

A `<=4096` assertion failed on the original implementation. The reproduction used locally copied GhostPay source logic and a minimal module shim; it was **not** a repository checkout or a Vitest run. No network calls, wallets, secrets or transactions were involved.

## Test-first changes

- Initial branch coordination claim: `48b4b07498bddb00d59aaffc8510fc2fb2d68dea`.
- Failing regression committed first: `0130e19a83b7fc9d355eeaa6c0bec84e980cc7cc`.
- Core source repair: `be820a259efaa01654b1fa98b77f3868e3c1d4ff`.
- Source format-separation correction: `df5ad9a761bc01f5d2f342aaa003ab40908b322c`.
- Source Git blob at final commit: `7b5977b8cc0af0efca85bfb8fee71486cd5b8c6b`; same blob hash was independently calculated for the locally executed `displayText.ts`.

The repair walks UTF-8-independent JavaScript Unicode code points when expanding hostile code points, stops before an entire `⟦U+...⟧` marker would exceed the display bound, and caps mixed-script output without splitting a surrogate pair. Existing handling of control/newline/tab characters and normal short inputs is retained. The new Vitest file adds four focused tests; the original `displayText.test.ts` is untouched because broad active PRs #278 and #372 modify it.

## Verification (actual versus pending)

- Node v22.16.0 with `--experimental-strip-types`: 11 source-equivalent assertions passed after the fix; baseline failed for the output-bound case.
- Source equality: exact SHA above confirmed via local `git hash-object`.
- Repository Vitest, coverage, workspace typecheck, lint, full/lean build, browser E2E: **not executed locally** (native container cannot resolve `github.com`).
- Hosted exact-head CI and a separate independent code review: **pending**. Do not infer they passed from the Node assertions.

## Ownership and merge gates

Current main and active PRs remain under a separate externally held generation-11 integration lock. This branch does not touch payment contracts, custody, fees, network calls, deployments or product features. No deployment, main update, force push, CI threshold change or existing PR edit is authorized by this handoff. Recheck exact main/PR heads, overlapping paths, held lock, hosted checks and qualified reviewer approval before promotion.
