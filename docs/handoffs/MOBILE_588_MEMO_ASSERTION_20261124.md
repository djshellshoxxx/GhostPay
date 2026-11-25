# Resume mobile qualification from PR #588

## Result and exact source

PR #588's QR import journey reached the correct payment review in every hosted mobile project, then failed because `getByText(memo, { exact: true })` expected a standalone memo element. The shipped paragraph contains a `strong` label followed by the memo, so its complete text is `Memo: Mobile file import`.

The test now locates the paragraph through its exact `Memo:` label, requires that paragraph to be visible, and compares its complete text exactly. It retains the camera-denial route, real raster import through the file chooser, review-before-open requirement, explicit opening action and memo-content check. No QR, payment, production UI, workflow or release-gate source changed.

- Parent PR: [#588](https://github.com/djshellshoxxx/GhostPay/pull/588).
- Parent and source base: `46150f4ce0a34da0e23dda36642ba9463ff1e4a1`.
- Isolated continuation: `fix/mobile-588-memo-assertion-20261124`.
- Ownership claim: `102d46b62f8d98e82e37cff044bcb358c89d8543`.
- Tested implementation: `7d112a5678496d851e8ec22d6603fbb4dec971cf`.
- Tested tree: `f8c2a602c5a7f8f420cb957ae5d6aa1161821fa6`.
- Later changes in this continuation only record documentation and execution evidence.

The parent ref was re-read after local verification started and still pointed to the exact source base. The original owner branch is unchanged. The coordinator independently reviewed the test correction and confirmed that it retains exact payload verification. This engineering review is not a formal GitHub approval. Publication and integration belong to the coordinator.

## Reproduction

The parent [mobile qualification run](https://github.com/djshellshoxxx/GhostPay/actions/runs/45338469535) failed the same assertion on all four device profiles in both lean and full. Its lean job was `138256069811`; all 26 other tests passed in that job.

Before the test repair, the complete app was rebuilt from the parent source and the QR import scenario was rerun in lean on the Android phone and tablet Chromium projects. Both failed on the original exact memo selector. A separate real-browser DOM check returned zero matches for that selector on the production paragraph structure and returned the complete labeled text for the corrected paragraph scope.

## Executed verification

| Check | Result |
| --- | --- |
| Locked installation | `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund` passed. |
| Matching workspace libraries | `NODE_OPTIONS=--max-old-space-size=512 npm run build:libs` passed. |
| Baseline app regression | 2 expected failures, matching the original hosted memo assertion. |
| Lean mobile selection | 24 passed, zero failed and zero skipped. |
| Full mobile selection | 24 passed, zero failed and zero skipped. |
| Production build pipeline | Both profiles completed the existing web TypeScript check, Vite build and postbuild bundle scan before their browser journeys. |
| Changed-file typed lint | Repository ESLint configuration passed for `apps/web/e2e/devices-mobile-workflows.spec.ts`. |
| Repository secret scan and whitespace | Passed. |

Each successful 24-test selection covers the existing QR image import after denied camera access, touch-driven encrypted backup download/import/verification, viewport layout, successful consented wallet payment, changed-wallet refusal and wallet-transaction-mutation refusal. The four projects are Pixel 7 and Galaxy Tab S4 in Chromium, and iPhone SE and iPad Mini in native WebKit. Each test uses synthetic keys, an injected wallet and local fixture RPC.

The successful command for each profile was:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
NODE_OPTIONS=--max-old-space-size=1024 \
GHOSTPAY_CHROMIUM=/path/to/chrome-headless-shell \
GHOSTPAY_LOCAL_BUILD_PROFILE=lean \
npm run test:e2e -w @ghostpay/web -- \
  --config=playwright.mobile.config.ts --grep-invert 'virtual camera: '
```

Repeat with `GHOSTPAY_LOCAL_BUILD_PROFILE=full`. The baseline command instead selected the two Chromium projects and `--grep 'after a camera denial'`, before changing the test.

## Environment and limits

Execution used Linux, Node `24.22.3`, the locked Playwright `1.64.1`, Chrome Headless Shell `156.0.8078.4` and WebKit `27.2`. The system's full Chromium could not create its process-singleton socket. The exact headless-shell build was obtained from the official Chrome for Testing distribution. WebKit was installed through Playwright; missing Debian shared libraries were extracted into that newly downloaded browser runtime without changing system packages. The system loader-cache validation was disabled for these local runs because it cannot see the isolated library directory; direct library loading and the actual native-engine journeys succeeded.

The first all-case lean attempt passed seven cases but failed the virtual-camera decoding case, then was interrupted. `camera-browser.ts` already documents that fake capture requires full Chromium, which is unavailable in this execution environment. The subsequent successful selections explicitly excluded the six virtual-camera cases per profile through the command line. No committed test, assertion, threshold or workflow was disabled. Those cases remain an exact-head hosted gate, along with the rest of the original unfiltered mobile workflow.

The browser descriptors do not constitute physical Android/iOS testing or external wallet-app interoperability. The original physical-device acceptance list remains open. No release, deployment, merge or real-funds transaction occurred.

## Evidence

The adjacent `mobile-588-evidence-20261124/` directory preserves the baseline failure, the interrupted all-case attempt, both successful selections, the matching-library build and the scoped lint output. `SHA256SUMS.json` records the exact stored bytes. Review those distinct outcomes independently; the interrupted attempt is not a pass.
