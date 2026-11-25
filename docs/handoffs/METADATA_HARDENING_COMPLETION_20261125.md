# Handoff: `@ghostpay/metadata-hardening` standalone completion (2026-11-25)

Source-pinned. Base `main` `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`; branch `nodata/gracious-pascal-vdb581`. Code and tests: commit `97cbaa6f68d7a8b1342be45ea7c2446fc090158e`. Later commits on the branch are documentation only unless stated here. Draft PR: `<PR_URL>`. Nothing is merged; no consumer of the package exists.

## Result

The package's documented pure-logic scope is implemented and hardened. Work was driven by reproduced defects (probe script, then failing tests, then fixes). Details and severities: `docs/remote/privacy-specs/audit-metadata-hardening.md` findings 12-22. API additions: `normalizeHardening`, `parseHardeningJson`, `MAX_MARKUP_LENGTH`, `MAX_SETTINGS_JSON_LENGTH`. No export removed or renamed. Behaviour changes for previously valid inputs are listed in the package README ("Behaviour changes").

## Discovery

- `main` and the task branch were both at `c8e131c1`. 718 remote branches; 137 touch the package, but 133 of them change only a 2-5 line dependency pin in `package.json`. The remaining branches (`integration/ghostpay-additional-reviewed-20261124-68c82b9`, `qualification/pr504-main-package-rollup-20261124`, `automation/20261121/bug/large-amount-noise-bound-r1`) carry the anchor-attribute and 256-bit-noise fixes that are already on `main`; `automation/ghostpay-integration-lock` is a metadata ref that deletes files. No unmerged implementation was reusable.
- No consumer imports the package (`PACKAGE_MAP.md`: Used by `-`). Specs read: `metadata-hardening.md`, its audit and wiring documents, `README.md` of the privacy specs.

## Evidence

| Gate | Result on `97cbaa6f68d7a8b1342be45ea7c2446fc090158e` |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` (package) | clean |
| `npm test` (package) | 27 files, 377 tests passed, 0 skipped (125 before) |
| Coverage | 99.67 % statements, 99.28 % branches, 100 % functions, 100 % lines (before 99.48 / 98.85 / 100 / 100; thresholds 95 / 90 / 95 / 95 untouched) |
| New tests against the old sources | 14 of 14 new files fail, 141 of 250 tests red (run in a temporary detached worktree of `c8e131c1`) |
| `bash scripts/scan-secrets.sh` | OK |
| `node --test scripts/agent/*.test.mjs`, `node scripts/agent/package-map.mjs --check` | 12/12 pass, map current |
| `node scripts/agent/affected.mjs` | affected workspaces: this package only (no dependents) |
| `node scripts/browser-smoke.mjs` (Chromium 158.0.8127.36) | pass: Node/browser parity, anchor lint equals DOMParser on 15 samples, SRI never more permissive than Chromium (17 cases), CSP accepted and enforced, no network request |
| Hosted CI (CodeQL, workflow groups) | **pending**: not available from this session until the PR exists |

Independent review: `<REVIEW_SUMMARY>`

## Not done / blockers

- Firefox and WebKit were not run (not installed here). Real-browser coverage is Chromium only and manual.
- Hosted CI result and a human independent review are outstanding; keep the PR draft until both pass.
- Integration into `apps/web`, `apps/relayer`, `core-crypto`, `chain-adapters`, `invoice-schema`, `btc-silent-payments` is separate work (wiring doc). Follow-ups: CSP `base-uri`/`form-action` decision, CI browser job, PSBT parser round trip, external review of the key derivation.
- The spec header (`metadata-hardening.md` line 3) still says "spec only, nothing built"; it was left untouched as normative text. The package README is the status record.

## Next independent task

Wire `normalizeHardening` and the scan/URL guards into `apps/web` settings (wiring items 1, 10, 11) on its own branch, after this PR merges.
