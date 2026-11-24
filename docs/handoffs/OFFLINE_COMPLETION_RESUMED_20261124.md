# Offline and interrupted payment branch completion — 2026-11-24

## Result and source

The current #590/#591 implementations are reconciled with their histories intact, and the combined offline/payment acceptance scenarios pass in the available native Chromium engine for both full and lean builds. This continuation fixes three confirmed qualification defects without changing the inherited production TypeScript.

- Worker: `/root/local_handoffs`; coordinator and independent source reviewer: `/root`.
- Isolated branch: `finish/offline-completion-20261124`.
- Child [#590](https://github.com/djshellshoxxx/GhostPay/pull/590): `f01c69d277c39c76fd3077103c43cc38f7f9c736`, `fix/pages-offline-session`.
- Current parent [#591](https://github.com/djshellshoxxx/GhostPay/pull/591): `49862e2d3b4832f1f52714f5bc1bc551af2fe54f`, `codex/offline-interrupted-invoice`.
- Main baseline: `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
- History-preserving merge: `df02497d2e577575cee19f5756d4ff837099e2c6`.
- Receipt fixture correction: `49981b6df1b7e3cd735a6cccc454aadec01cd64c`.
- Generated dependency-map correction: `ada8b08f7150d3e5e101316b8917e26538fca016`.
- Final application/test source: **`e7d21d040404171cad18af382a05352241c8aa7f`**, tree **`59b9eed3dfb1acde106321cd666a95e6d2559216`**. This handoff is a later documentation-only addition.

Both original donor heads are ancestors of the final source. All production files under `apps/web/src` remain byte-identical to #590; its only changed `src` file is the combined `payExec.test.ts`. The current parent's Arabic, Spanish and Japanese offline messages and browser assertion are retained. No dependency manifest, lockfile, workflow, release setting or production guard was modified by this completion lane.

## Confirmed problems completed

1. **Parent/child merge conflict:** `payExec.ts` expressed the same fail-closed receipt status using different comments and formatting. The child form is retained. The ownership-registry conflict preserves the updated parent claim, the child claim and the completion claim.
2. **Two incompatible receipt fixtures:** #591's new success/revert cases omitted `transactionHash`. After reconciliation the child correctly rejects these malformed receipts, producing two deterministic failures. The fixtures now return the actual requested hash from `params[0]`. Their transaction lookup still returns null, and both still require `unverified` plus exported `unconfirmed`. Missing/wrong hash refusal in production is unchanged.
3. **Stale generated dependency map:** #591 had already added the existing `@ghostpay/ux-core` dependency to the web workspace. Existing `scripts/agent` tests detected that the generated map was stale. Running `node scripts/agent/package-map.mjs` changes only the two forward/reverse dependency rows. All 12 original tests pass.
4. **Ambiguous draft browser locator:** the first native full-profile run passed eight scenarios but could not enter the memo in the ninth: `getByLabel('Memo')` selected the textbox and the memo-encryption checkbox. The test now addresses the textbox by its full existing accessible name. All recovery and ciphertext assertions remain intact. Both full and lean reruns pass all nine scenarios.

The first item is integration resolution; the latter three are reproduced qualification defects. No test was skipped, weakened or given a longer timeout to obtain the final results.

## Verification executed

Runtime: Node **24.22.3** (repository requires >=22); the unchanged lockfile installs Vitest **5.0.5**, Playwright **1.64.1**, and TypeScript **5.9.3**. Native browser: **Chrome for Testing 156.0.8078.4**, headless shell. Canonical `npm ci --ignore-scripts --no-audit --no-fund` installed 722 packages in this worktree; workspace links point to this worktree. No copied compiled workspace source was used.

| Check | Observed result |
| --- | --- |
| Canonical install and `npm run build:libs` | Passed |
| Merged receipt fixtures before correction | 2 failed; 68 cases filtered by the focused test-name selection |
| Six payment/wallet/draft unit files after correction | **218 passed**, zero failed or skipped |
| Catalog and security-key suites | **16 passed**, zero failed or skipped |
| Full web TypeScript checking | Passed |
| Typed ESLint on all 18 changed TypeScript/TSX application, fixture and browser files | Passed |
| Typed ESLint on final corrected `offline-session.spec.ts` | Passed |
| Original generated-map test command | First failed on stale map; **12 passed** after regeneration |
| Original production build and postbuild scanner through Playwright webServer | Passed for **full and lean** profiles |
| Selected native Chromium browser scenarios | **9/9 full**, **9/9 lean**, zero skipped |
| Repository secret scan and whitespace check | Passed |

The 218-test run and separate typecheck ran on `49981b6df`; its six tested files and production source are unchanged at the final source. Later changes concern generated documentation and browser locators. Both final browser runs and final browser-file lint use the final source shown above. No full-web coverage or whole-repository test pass is claimed.

Commands from the repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:libs
NODE_OPTIONS=--max-old-space-size=1024 npm run typecheck -w @ghostpay/web
node --test scripts/agent/*.test.mjs
npm run ci:scan-secrets
git diff --check
```

Native unit commands from `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/vitest run src/lib/payExec.test.ts src/lib/payExec.acceptance.test.ts src/lib/wallet.test.ts src/lib/duplicateAttemptJournal.test.ts src/lib/useInvoiceDraft.test.tsx src/views/Pay.test.tsx --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/vitest run src/i18n/catalog.test.ts src/i18n/securityKeys.test.ts --maxWorkers=1
```

Typed lint used the repository's unchanged `eslint.config.js` on the TypeScript/TSX paths changed from the pinned main. The final correction was rechecked with:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/eslint --config ../../eslint.config.js e2e/offline-session.spec.ts
```

Browser command from the repository root, run once with `full` and once with `lean`:

```sh
NODE_OPTIONS=--max-old-space-size=1024 GHOSTPAY_CHROMIUM=/workspace/scratch/efb8df2579c9/mobile-browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run test:e2e -w @ghostpay/web -- e2e/offline-session.spec.ts e2e/flows.spec.ts --project=desktop --grep 'encrypted opt-in|a loaded tab|interrupts a wallet request|a stale receipt|pays a native invoice|refuses when the wallet mutates|retains a late wallet hash|refuses a changed wallet account' --workers=1
```

The original Playwright configuration built the application, ran its original postbuild scanner, served localhost:4173, and used its authored synthetic manifest, mocked wallet and RPC. Builds retained existing help.css, externalized node:http, mixed QR-import and bundle-size warnings; warning policy was unchanged.

## Acceptance evidence and limits

The browser scenarios establish a valid-payment control; interruption before and after the wallet returns a hash; a late hash after seller-session/account/provider changes; a stale unrelated receipt delivered after reconnect; refusal on a changed account or altered wallet transaction; encrypted opted-in draft restoration after an offline reload fails; and local signing/review followed by an explicit retry of RPC verification. Wallet submissions remain at one across the interruption, reconnect and reload cases. The stale receipt cannot replace the original journal hash or produce a local confirmed receipt.

Draft recovery is **same-tab and same-seller-key** recovery. Tests verify no persistence before opt-in, ciphertext instead of literal private form values, refusal to expose a different seller's draft, deliberate resume, preservation of the latest edits, and deletion after successful invoice creation. Invoice passphrases are excluded from saved records and must be entered again. There is no newly added offline application shell; a fresh load still needs the app assets. Closing the tab, separate profiles and other tabs are not newly promised by this work.

The coordinator independently reviewed the merge and receipt-fixture delta and found no blocker. The review also checked that `CreateInvoice` remounts its editor by meta-address, signer public key and lock state, preserving the prior seller boundary during pending draft operations. This is an independent AI-assisted source review, not a submitted GitHub approval or external audit.

Raw local logs live beside the worktree under `/workspace/scratch/9723b6705f45/`. Reproduction anchors:

| Log | SHA-256 |
| --- | --- |
| `offline-red-fixture.log` | `c3015b8819a59533921b9cdac41d22da1c4133fca14c577b9dcec765c190d306` |
| `offline-unit-green.log` | `2bb2b68994985f7da390aac9058100e2400ce687c6de043f5a341f2ff7736d4b` |
| `offline-workspace-map-green.log` | `e215ebb8466aedc5877bc6ae5b8e8c5f20defb9c66981ffde73c943d22579911` |
| `offline-browser-full-green.log` | `8a6a7c632d33a1a1b2067cdc6f114445b5c7cca7772a8f3fb885bb2e2d78d0cc` |
| `offline-browser-lean-green.log` | `7bf64beda0c15cd8c70225f6bb372333327b9ca253571c72c9d031506fc472e2` |

## Handoff

The assigned isolated completion and native verification are complete. Parent coordinator owns publication, live donor-head/ownership rechecks, and hosted qualification of the published composition. Existing donor branches remain untouched. No remote push, shared-branch merge, release or deployment was performed by this worker. Real wallets, live chain transactions, Safari/WebKit, physical devices and full repository/browser coverage are not claimed by these results.


## Current-main reconciliation supplement — 2026-11-24

After native qualification, `git fetch origin main` observed main at **`706188000c38b3dde5a3a362370a530870aa7587`**, advanced from the requested `2d83de0b7f5bba0fafc0c25d19d1fcb382edf719`. It contains the completed package fixes from #561 and #565. The isolated branch preserves that exact fetched main as a parent of merge **`26c3a936815abd07b32fff66be1ed5074bccc20d`**, tree **`43c9dc64f77fac6d1659cb9fcf88b88bbf91fd13`**. Its other parent is the additive reconciliation claim `cf14eb80fa07769b4303d79f4a3d57c3fb706dd3`, descended from the qualified offline source and existing handoff.

Only `docs/ai/ACTIVE_WORK.md` conflicted. Both sides' sections were retained. A Counter-based comparison verifies every nonblank line's multiplicity from both parents: the offline parent has 682 such lines, fetched main has 711, and the reconciled registry has 728; neither parent loses any occurrence. The repository whitespace check passed.

All `apps/web` files, the generated dependency map, root package manifest and lockfile remain byte-identical to the qualified offline source `e7d21d040404171cad18af382a05352241c8aa7f`. All **14 incoming package source/test blobs** match fetched main exactly. Main's seven package fixes and their handoffs are imported unchanged; there is no custom production merge resolution.

The earlier 218 unit, 16 catalog/security, 12 map and 9+9 browser results remain evidence for their stated earlier source pins. **No new combined-source runtime, build, lint, browser or hosted-CI pass is claimed for this main reconciliation.** The source/ancestry/registry checks above are the newly executed verification. The coordinator owns fresh hosted qualification and any integration decision. No remote mutation or deployment occurred in this reconciliation.
