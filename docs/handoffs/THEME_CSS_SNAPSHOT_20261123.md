# GhostPay — isolate untrusted theme values before CSS generation (2026-11-23 UTC)

## Exact source and ownership
- One ChatGPT coordinator, sequential audit → regression → repair → self-check. No native parallel worker or independent reviewer available.
- Branch: `automation/20261123T0032Z/bug/theme-css-snapshot` from exact `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Pre-change `packages/ux-core/src/theme.ts` blob `920c6d6d9ba185d7e25fdf36ae1dc6e0e170e293`; pre-change `theme.test.ts` blob `e5187b1e340e29476f9a6a9e27d080aa2aaea33a` (left unchanged).
- Ownership claim `a5d87557748c1dd86810fab2589b7577aba3d879` before source edits. New test-first `theme.snapshot.test.ts` commit `9c1da732b3929397c90db8317fc778bacc6e85e0`; production correction `67762b76932877609b7a62eb4042aa7e8bc3d755`, resulting source blob `5b776652a44cdef0c520af0d1f762b4c423f1a52`.
- Owned paths only `packages/ux-core/src/theme.ts`, new `packages/ux-core/src/theme.snapshot.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim and this new handoff. No parent/other worker branch modified.

## Confirmed source-boundary defect
`cssFor(theme)` first calls `validateTheme(theme)`, then rereads `theme.id`, `theme.scheme`, and `theme.tokens[name]` to render CSS. Direct JavaScript callers can pass accessor-backed or Proxy-backed objects whose validated fields change before interpolation, producing unvalidated CSS after the purported injection-proof validation. A throwing getter can also bypass `cssFor`'s typed refusal contract. This is a programmatic defensive correctness boundary; **no remotely reachable browser exploit is established**, and `parseThemeJson` yields inert parsed values.

## Test-first correction
- The new Vitest regression tests require only one read of an accessor-backed colour and id, safe output rather than CSS-injected `body{`, a typed refusal for throwing token getters, and byte-compatible CSS for a normal registered light theme. Regression was committed before production correction. No existing tests or validation thresholds removed.
- `snapshotTheme` reads relevant top-level fields once and copies the complete own token-key set into ordinary data properties. `cssFor` validates and renders exclusively from that detached snapshot, preserves unrecognized token keys for the existing validator to reject, and catches malformed accessor/Proxy reads with `{ok:false, violations:[{code:'NOT_OBJECT',path:''}]}`. All existing color/contrast, theme-id, CSS text, built-in defaults and JSON-import behavior remain governed by existing validators.
- No new dependencies, CSS policy, scripts, release logic, wallet functions, network calls, contracts or secret handling.

## Executed evidence, accurately scoped
- Local Node v22.16.0 **source-equivalent control-flow demonstration** (copied validation/read lifecycle, not repository code/tests): original double-read behavior produced injected output in 2/2 getter cases; a detached-copy implementation satisfied 4/4 demonstration controls (changing colour, changing id, throwing getter, ordinary theme). This is **not** execution of the committed Vitest file or a complete CSS/theme test suite.
- Local Git repository checkout remains unavailable because `git ls-remote https://github.com/djshellshoxxx/GhostPay.git` fails DNS resolution `Could not resolve host: github.com`. Therefore local repository typecheck/lint/build/Vitest/browser cannot be claimed; these require **new exact-head hosted CI**. No independent third-party/security review was performed.
- Before this change, parent independent PR #485 at `fe1c59a3d5aa25dbdcdf30db38ec869566fa0f5f` finished all five hosted workflow groups SUCCESS (CI [45078470544](https://github.com/djshellshoxxx/GhostPay/actions/runs/45078470544) with all 24 jobs successful; Pages 45078470606; Beta 45078470589; Hosting 45078470593; CLI 45078470581), but **has no submitted reviews** and remains draft/unmerged. This does not qualify the new theme source.
- Source overlap checked in PR changed-file sets for #238/#262/#264/#278/#293/#307/#372/#418/#437/#471/#479/#482/#485/#487; no exact `theme.ts`/new test path overlap in that bounded sample. Full historical source/branch ancestry census was not executed.

## Lock, security and integration policy
- Durable integration ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, JSON blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: `held`, generation 11, owner `994a0d214fb9-root-r3`; recorded expiry alone is NOT authorization to steal/release. No shared-ledger updates or merge into shared integration/main.
- `.github/workflows/pages.yml` on main: pull requests are validation-only; publish requires explicit main `workflow_dispatch` with `deploy=true`. Fresh deployment trigger and policy checks still required before any eventual merge. Never change workflow, settings, branch protection or release policy to clear a gate.
- Prior strict Mythril reports ten findings (three Medium, seven Low) whose final disposition and external security clearance remain open. This isolated theme change does not resolve them. Follow repository `SECURITY.md` for confirmed vulnerabilities.
- No deployment, tag, release, fee activation, contract edit, funds, private keys, force-push, paid coding agent, ownership takeover or security suppression.

## Next invocation
1. Fetch draft PR and its exact-head GitHub Actions Core CI, Pages and Beta jobs; inspect failures and repair actual failures on an owned isolated follow-up, preserving this branch's provenance.
2. Obtain **genuinely independent verification** of the final source, test assertions, accessibility/injection implications, compatibility and exact SHA. Self-check cannot replace approval.
3. Confirm live lock ownership and current main/branch heads, branch protections and downstream deployment triggers. Leave draft unmerged while the other coordinator holds lock.
4. Continue priority fund recovery and finding-specific Mythril qualification on their existing owner-held workstreams; avoid duplicating them. Do not claim beta readiness from this bounded fix.
