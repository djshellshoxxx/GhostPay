# Supported-flow accessibility qualification

The accepted work plan requires rendered accessibility checks. Existing keyboard,
body contrast, QR palette and 360px checks provide partial evidence; they do not
establish an axe audit of the supported application.

`apps/web/e2e/accessibility.spec.ts` adds checks for the nine supported core views,
generated seller keys, invoice creation and validation errors, signed-invoice
review, scan validation and malformed-invoice refusal. It exercises keyboard route
navigation and focus, the skip link and invoice-created live announcement. A
separate matrix checks the core views at a real 320 CSS pixel viewport with normal
and 200 percent root text size, including visible control bounds.
One combined forced-colors/reduced-motion pass confirms the emulated preferences
and the nine core views under those preferences. The generated seller QR frame's
real transition must change from 0.2 seconds normally to zero with reduced motion.

Run through the existing browser command in both build profiles:

```sh
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e --workspace @ghostpay/web
GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run test:e2e --workspace @ghostpay/web
```

The same audit helper is also composed into the existing built Worker,
reconciliation, invoice-bound receipt and direct-sweep browser journeys. Those
checkpoints exercise actual matched-payment, consent, receipt result and
submission/recovery states; they do not replace the journeys' signing, hash,
journal, consent, tamper or CSP assertions. Their retained records identify the
specific states that actually executed.

The normal pinned test dependency is `axe-core` 4.14.0. Its npm integrity is copied
from the official immutable upstream lock at
[`dequelabs/axe-core-npm` e9cf392](https://github.com/dequelabs/axe-core-npm/blob/e9cf392f1fd2715fe9d431a2ecf6b21354541cdc/pnpm-lock.yaml).
The matching [core source tag](https://github.com/dequelabs/axe-core/tree/e797173108eadfa4355fe06af331791734e1757f)
declares MPL-2.0, Node >=4 and no runtime dependencies. The lock entry was prepared
from that evidence; successful hosted `npm ci` must still verify it. No registry
probe, local install bypass, CDN, product import or CSP relaxation is required.

Audit summaries retain the engine version, build profile, route/state, rule
scope, passing-rule count, violation IDs/severity/help links and incomplete IDs.
All default enabled axe rules run; serious and critical violations fail the
accepted gate. Other severities and incomplete findings remain recorded for review.
They exclude DOM HTML, input values and invoice URLs. Successful tests log
`GHOSTPAY_A11Y_RECORD`; each test writes `accessibility-audit.json`. The existing
successful browser-build artifact retains these files beside its exact build and
identity record. Failure artifacts continue retaining diagnostic results.

Adding assertions is not a passing audit. Verify actual browser results on the
final source revision and preserve any incomplete findings. This matrix covers
the supported core, not deferred network/embedding views, every possible modal,
all content/theme combinations or native assistive technology. Screen-reader,
cross-engine, physical-device and native-language acceptance must retain their
actual evidence and remaining human steps. Media emulation is not assistive-device
or screen-reader proof. No new
theme, accessibility-settings or broad usability proposal is enabled here.
