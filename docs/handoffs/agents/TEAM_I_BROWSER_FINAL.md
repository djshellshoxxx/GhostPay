# Team I final hosted browser repairs

- Branch: `codex/unified-browser-final`.
- Base: `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`, tree-equivalent to published checkpoint `55e8bf49feb854d37a55d36492b0710d1226b64c`.
- Source: `9642e75a`.
- Claim: `6c9f1d19`.
- Owner: browser_finish, Caveman workflow. Independent reviewer final_review2 cleared source `9642e75a` and passed 34/34 App/SellerPairing tests. The hosted pairing condition remains open.

## Diagnosis and implementation

Hosted [CI run 43966070891](https://github.com/djshellshoxxx/GhostPay/actions/runs/43966070891) has one lean browser failure and seven full browser failures. The lean [job 133648133938](https://github.com/djshellshoxxx/GhostPay/actions/runs/43966070891/job/133648133938) reports 60 passed, one failed and three skipped. The full [job 133648134065](https://github.com/djshellshoxxx/GhostPay/actions/runs/43966070891/job/133648134065) reports 66 passed, seven failed and one skipped.

1. Five full-profile keyboard failures share a real layout regression: `App` rendered the merchant-profile disclosure before `AppShell`, so its summary became the first tab stop. The new focused regression reproduced this exactly: expected skip link, received merchant summary. `AppShell` now accepts an optional main prelude, and `App` supplies the merchant panel there. The skip link and navigation remain first; merchant controls now belong to the main landmark. Lean imports and existing keyboard assertions remain intact.
2. Both profiles' composed scan/reconciliation journey used an RPC mock with no canonical block timestamp. The production matcher correctly refused an exact match. The fixture now pins the payment header timestamp to the actual signed invoice quote timestamp and returns it through `eth_getBlockByNumber`. No matcher behavior or approval assertions changed.
3. The full-profile malformed-pairing journey could not find its generic QR refusal status. A new no-loaded-keys DOM regression reproduces the exact malformed-version input and verifies both refusal messages, no preview, no key installation, and successful recovery with valid public config. It passes with the unchanged pairing implementation. The hosted test now additionally verifies that the version mutation occurred, that the malformed value reached the input, that the pairing-specific rejection alert is visible, and that no preview exists. The original generic refusal assertion remains mandatory. **This browser-only failure is not claimed fixed; the next hosted run must resolve it.**

## Verification

- Red at base plus tests: `vitest run src/App.test.tsx src/views/SellerPairing.test.tsx --maxWorkers=1`: one failed, 33 passed. Failure is the new skip-link assertion; the new pairing regression passes.
- Green source matching `9642e75a` product files: `vitest run src/App.test.tsx src/AppLean.test.tsx src/AppShell.i18n.test.tsx src/views/SellerPairing.test.tsx src/components/CameraImporter.lifecycle.test.tsx src/components/MerchantProfilePanel.test.tsx --maxWorkers=1`: **77/77**, six files.
- Web typecheck and scoped ESLint on all seven changed source/test files passed. `git diff --check` passed.
- Local native browser acceptance cannot run: system Chromium exits at `socket() failed: Operation not permitted (1)`. The pinned Playwright browser is absent. No browser assertion was weakened or skipped.
- Full and lean artifact builds and the combined candidate hosted browser suite remain coordinator gates.

## Next action

Integrate after independent review, publish the combined draft candidate and inspect full/lean browser jobs. The additional pairing checks distinguish parser rejection, input delivery and transient QR status. Keep the pairing failure open until actual browser evidence passes. Real Safari, physical camera and assistive-technology acceptance are separate external gates.
