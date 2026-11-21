# GhostPay QR print-policy runtime guard — 2026-11-21 14:39 UTC

## Identity and exact source
- Cycle: `20261121T1439Z/bug/qr-print-policy-boolean`; one assistant, sequential source/QA/security/consolidation phases, no delegated worker or independent reviewer.
- Isolated branch: `automation/20261121T1439Z/bug/qr-print-policy-boolean`, stacked on existing draft [PR #307](https://github.com/djshellshoxxx/GhostPay/pull/307) head `5a745d4b5fba69b66a9779f88aefc63c253a4f27`. The parent source was reread and its head checked unchanged before/after work. This branch does not own or rewrite PR #307.
- Current `main` observed `eb59d93cffed7848c4aac37d0e9650b87239c6da`; not the source tested. Historical source-only census is not a full semantic review.
- Repository instructions read: `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md` (template), `docs/ai/ACTIVE_WORK.md`, `SECURITY.md`; relevant release workflow `.github/workflows/pages.yml`. The legacy docs handoff is historical, not this cycle's source state.
- Live metadata integration lock: `automation/ghostpay-integration-lock` ref commit `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`; status **held**, generation **11**, owner `994a0d214fb9-root-r3`. This cycle did not acquire, take over, update or release the lock.

## Reproduction and repair
- Finding ID: **GP-QR-PRINT-01**, defensive QR disclosure correctness, low severity until browser reachability is demonstrated. Source: `apps/web/src/lib/qrKinds.ts`, exported `printQrPolicy` on parent SHA above.
- Cause: JavaScript truthiness allowed a non-boolean argument such as the string `'false'` or an object to be treated as confirmed passphrase protection. That selected the SHARE framing and removed the bearer warning even when printing a present invoice link. Input-contract violation is reproduced; no demonstrated exploit, user-controlled entry point, key exposure or funds loss is asserted.
- Red checkpoint: source-equivalent Node 22 script, seven truthy non-boolean cases, **7/7 failed** the desired bearer-warning assertion before the fix. The committed Vitest tests predate the production correction but were **not executed** in this local environment.
- Repair: use `passphraseProtected === true` for both QR kind selection and warning suppression; preserve true/false calls, empty link, and print density cap. No fields, wire format, secret handling or dependencies changed.
- Green checkpoint: Node `v22.16.0` source-equivalent direct assertions on the corrected pure function, **23/23 passed**, including malformed values, normal booleans, missing links, limits and hostile conversion object. **This is not the repository's Vitest, TypeScript, lint or browser test result.**
- Sequence: ownership `e94aa81e50b12137423d2d8a42e9d9b52523629d`, regression test commit `6c645477f8c91d6f0f54b6bb21c6a2710a947b80`, production repair `8ca59c6e1e1b7dc6bcfdf8d24c31fe68214103a1`, precision-only comment `f70614b95ed9c0e14070e9ce29b364f456d903b3`. Exact final head is the commit that creates this handoff (see PR).
- Owned paths: `apps/web/src/lib/qrKinds.ts` (only `printQrPolicy`), `apps/web/src/lib/qrKinds.test.ts` (additive tests), ownership claim in `docs/ai/ACTIVE_WORK.md`, and this handoff.
- Current additional source/ownership checks: inspected first 100 open PR metadata entries, exact path lists for #278/#307/#372/#395/#392/#390/#380/#402/#408 and scoped source patch for #278/#307. PR #307 changes QR classifier logic in the same file, but not `printQrPolicy`. Parent source is preserved; the candidate PR is deliberately stacked for source-based consolidation.

## Scope of verification and gating
- Git checkout and repository test execution unavailable: `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed with `Could not resolve host: github.com`. Do not claim npm dependency installation, Vitest, lint, TypeScript, a browser run, fuzzing, Mythril, Caveman runtime, or independent verification.
- Parent #307's prior checks cannot qualify the additive candidate. The child's exact-head GitHub Actions jobs need review after opening the draft PR.
- Hosted CI for predecessor #405 at `11117b9fff062d859c9db123ff62641cc0479192`: Pages/Hosting/CLI/Beta succeeded while CI remained **queued** during this cycle. PR #384 exact `f3e5540777491559e79565cafe0978f5e8e30003`: all five reported workflow runs completed successful. These statuses are not evidence of this QR repair.
- `pages.yml` checks PRs without automatic deployment; publishing uses explicit `workflow_dispatch` on `main` with `deploy=true`. Other workflow triggers and environment policies not exhaustively verified, so no merge or deployment was attempted.
- An independent reviewer must inspect the final exact patch, test semantics, real browser call-site trust boundary and any conflict with the eventual parent integration. No simulated independent approval.
- Shared `docs/automation/` ledgers and integration/main are coordinator-lock owned; this cycle adds no competing shared ledger and does not make global completion or security-clearance claims.

## Resume
1. Read this handoff and the live PR/source heads. Verify exact-head tests, Pages, Beta and relevant policy/workflow checks, including the new regression at real repository source; repair failures on this owned branch if necessary.
2. Obtain independent verification, including whether callers can supply non-boolean protection state. If no reachability, retain low-risk defensive label rather than asserting exploitable vulnerability. Handle any actual security vulnerability under `SECURITY.md` (private reporting).
3. Recheck PR #307 ownership, evolving consolidation PRs and generation-11 integration lock. Coordinate any source-level adoption into its qualified successor with authorized lock owner, then preserve exact-source evidence.
4. Do not merge into shared integration/main without a valid atomic lock, fresh expected SHAs, required checks/reviews and no-deployment proof. Do not deploy, release, send real transactions or alter security settings.
