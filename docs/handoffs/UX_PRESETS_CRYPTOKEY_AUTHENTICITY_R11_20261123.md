# GhostPay BUG-ONLY R11 — Native preset key boundary (2026-11-23)

## Verified source and ownership
- Current live `main` at discovery: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Source selected: `packages/ux-presets/src/seal.ts`, baseline Git blob `4f444ee01734d4135887d0a45c401c67b02295da`; dedicated NEW regression: `packages/ux-presets/src/seal.cryptokey-boundary.test.ts`.
- All **263** currently open PR changed-file inventories (GitHub REST 100+100+63, through #508) were inspected; none touches either selected path. All other PRs, the release and other worker branches and existing `seal.test.ts` are untouched. This is not a claim about unmerged inactive branches; recheck before integration.
- Unique task branch: `automation/20261123/bug/ux-presets-real-cryptokey-r11`.
- Branch ownership claim commit: `4dbad24893bba1d284ef4937970bfc74d0ce8bb0` (additive `docs/ai/ACTIVE_WORK.md`).

## Observed defect, regression-before-fix, correction
- Baseline `resolveKey()` treated metadata fields `{ type: 'secret', algorithm: { name: 'AES-GCM', length: 256 }, usages: ['encrypt','decrypt'] }` as sufficient to return `ok(CryptoKey)`. Executing the baseline GitHub source-extracted function body (TypeScript annotations removed) yielded `ok: true` for that **ordinary object**; it lacks a browser-native key and cannot be used for crypto.
- First regression committed before source fix: `bb4933fe36d6f147af17ed0eb392d0d5c5d680a8`. First fix `8924d428be87c00902585fb4998b9fc5ef69a61f` used `instanceof CryptoKey`, rejecting plain fabricated records.
- Follow-up local Node 22.16.0 reproduction found `Object.create(CryptoKey.prototype)` with own key-looking properties passes `instanceof` but fails native `crypto.subtle.encrypt`, and the native `CryptoKey.prototype.type` accessor rejects it. This showed the initial fix was incomplete; the follow-up failing regression was committed **before** correction as `bffde74c91b6be8e0948b5d2028cda1ca60acbe8`.
- Final minimal fix `7eb2a99db56b2b513fa70639db1e346c3651a10d` checks the native type getter brand before metadata inspection. The fixed `seal.ts` Git blob is `c42a35c9131e41d262df21c56b8053bd144574eb`. Existing `bad-key` response and 32-byte-key import remain unchanged; no dependencies, new features, protocol, API, fund or contract changes.

## Verification and limitations
- Baseline exact-source-derived V8 function reproduction: key-shaped ordinary object incorrectly accepted (`ok=true`).
- After final correction: **10/10** extracted source-body V8 checks passed, with an injected native-brand-equivalent key class, including plain and toStringTag fakes, prototype spoof, authentic branded object, wrong algorithm/length/usages/type, 32-byte material and wrong-size bytes.
- Node 22.16.0 native WebCrypto probe: `CryptoKey.prototype.type` descriptor getter accepts an actual key and rejects a forged prototype; the forged prototype fails native subtle encryption. This was a separate proof, **not** a full module/test runner execution.
- The dedicated Vitest regression is committed but **not run locally**. Full checkout failed `Could not resolve host: github.com`; no full repo Vitest, lint, typecheck, build or native-browser execution is claimed. Await hosted GitHub Actions exact-head results, including Pages browser checks where applicable. Confirm any CodeQL/lint/type issues and repair on **this** isolated branch if they arise.
- No genuine independent verifier/reviewer was available in this cycle. Sequential author self-review is not independent approval.

## Other gates and no-merge disposition
- PR #390 reviewed read-only: exact head `b655bc273a6704c9c140287b8adcdf4085b91882`, all five hosted workflow groups successful, 39 check-runs (36 success, 3 skipped), no submitted independent GitHub review, open/non-draft and `mergeable=false` against current main. No repair to its owned branch without its owner.
- Live metadata lock: `automation/ghostpay-integration-lock` ref `082e754f44944ebb4be283f89176b966bf8f7b4f`, generation 12, status **released**; not acquired. Released state is not merge authorization.
- Keep this bug-only PR draft until exact-head all-required CI green, applicable native browser verification, no ownership conflicts, genuine independent review and legitimate integration lock ownership. No merge, deployment, release, network attack, private-key, wallet, contract or funds interaction performed.
