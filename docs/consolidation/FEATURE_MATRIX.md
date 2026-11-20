# Feature-completion matrix

Checkpoint: 2026-11-19 UTC. Latest verified main: [c977b5d6723f6822c3b5d86cd6b231712c53c395](https://github.com/djshellshoxxx/GhostPay/commit/c977b5d6723f6822c3b5d86cd6b231712c53c395).
Branch: codex/ghostpay-consolidation-records-20261119 ([PR #273](https://github.com/djshellshoxxx/GhostPay/pull/273)). Initial baseline: 14ded337a10c140d7a9f9a9238ec038587d925bb.

This checkpoint does not declare feature completeness or release qualification. Read [HANDOFF](HANDOFF.md), [TEST_RESULTS](TEST_RESULTS.md), [REMAINING_WORK](REMAINING_WORK.md) and [MAIN_MERGE_LOG](MAIN_MERGE_LOG.md) together.

## Scope and status rules

The active product is the static, noncustodial Pages browser client. Core key and payment operations remain local and serverless. HTTPS/Tor compatibility does not mean RPC or blockchain anonymity. Fee-recipient activation, mandatory guardians and non-Pages deployment variants remain deferred. No deployment or public release is authorized.

Complete means the stated bounded behavior is implemented and verified; Nearly complete means implementation exists with a remaining acceptance step; Partial means substantial approved behavior or qualification is missing; Unintegrated means source exists outside verified main; Blocked identifies an external gate or dependency; Deferred is outside approved active scope. Historical candidate tests are not current-main acceptance.

## Approved feature inventory

| Area | Status | Evidence and next action |
|---|---|---|
| Scheme-1 EVM stealth generation, derivation and spending keys | Nearly complete | Existing core-crypto source and historical vectors remain. Requalify the final payment/recovery combination and independent-wallet acceptance; no custom primitive is introduced. |
| EIP-6538 registry/ENS integration | Nearly complete | Existing bounded helpers, explicit provider selection and signatures remain. Authentic canonical deployment hashes and real wallet/provider acceptance are still separate gates. |
| Static lean Pages build | Nearly complete | Full TypeScript, lean Vite and bundle scans pass on pre-merge #271/#272 trees. Their current-main combinations still need hosted build/browser gates. |
| Legacy encrypted keystore, vault and verified backup (GP-PAGES-02 baseline) | Nearly complete | Main already contains encrypted backup, restore and custody verification; backup is not wholly absent. Fresh-browser/device and final combined recovery acceptance remain. |
| Per-payment public/encrypted/raw keypair export (Spec 18 / requirement 3q) | Unintegrated | Main still lacks the candidate codec/UI. #239/#240/#260 and broader candidates carry implementation. Require scalar/public/address binding, re-authentication, encrypted default and a second confirmation for single-key raw export. |
| Bounded encrypted bulk export and separate master backup | Unintegrated | Preserve reviewed candidate formats, count/size limits, duplicate rejection and atomic import. Keep the legacy three-key keystore distinct. No raw bulk or raw master export. |
| Independent offline/fresh-browser restoration | Unintegrated | Require stable formats/vectors, corruption/wrong-password/invalid-key controls, and restoration without the original host/account/service. Source review alone does not close browser or wallet interoperability. |
| Sleep-aware wall/monotonic idle timing (GP-PAGES-04 baseline) | Nearly complete | Main already retains timing/lifecycle work from #242. Stronger immediate authority suspension is a separate pending integration; verify manual lock, sleep/wake, background/pageshow restoration, timeout and protected operations after unlock. |
| Immediate suspension with recoverable sole-copy key state | Unintegrated | Main notifies UI and awaits custody status. Compose #256 suspension with #260 atomic staging/replacement/unload behavior. Existing #262/#264 resolved blobs already preserve both; do not choose either older file wholesale. |
| Invoice, QR, payment preparation, network choice, confirmation and receipts | Nearly complete | Existing browser paths remain. Final current-main end-to-end, reload/error/wrong-network, keyboard and device acceptance are not all newly established. |
| Explicit balance-query consent and accurate disclosure | Unintegrated | #231/#252 ancestry is retained in #272. #252 source had 36 successful check runs plus Snyk and three intentional deployment skips. Its only new main conflict was ownership documentation. |
| Quote, relayed, direct and same-nonce replacement lifecycle | Unintegrated | #272 at 63ff40d57af879a3d82166450f63aadb7bf0d5ff retains reviewed feature blobs and 142 passing component cases. Stale context cancels before journal/handoff; submitted/unknown outcomes and prior hashes remain. New combined-head CI is required. |
| Calendar validity, bounded retries and complete TRON ranges | Unintegrated | #271 at 429a4de80b9ec53177b17d89d18ce8ec91a08814 retains #250 safeguards. Fixtures now emit empty heights; 552 chain, 104 TRON and 67 web tests pass on unchanged feature blobs. |
| AST source scanner, binary SOCKS chunks and positive pool inputs | Complete (bounded fixes) | #257 merged as main 8f563764 after independent review, 36 checks and Snyk. Three deployment-only checks intentionally skipped. No circuit/contract runtime or dependency train was imported. |
| Browser network isolation and provider privacy | Nearly complete | Main retains #241 transport hardening and selected #242 privacy work. Broader action-bound authorization/checkpoint work remains in owned candidates. Do not claim complete anonymity. |
| Fresh export-specific network authorization | Unintegrated | Source b0abb726c138ad1df2f03b7b102c9bd9de318887 is an ancestor of #269 at 683f8587b8de45448f14aab0539cb07a5f21bce3. Preserve endpoint/chain/session/settings scope, cancellation and current ownership; final GREEN evidence remains pending. |
| Canonical arrays and merchant clocks | Unintegrated | #265/#268 have focused independent execution. #270 extends descriptors/scheme filtering; updated #262 carries merchant work. Deduplicate exact behavior before integration. |
| Precise hosting timestamps | Unintegrated | #267 has 284 original kit passes and 15 conditional skips, plus boundary controls. Native nginx/Tor/I2P/browser acceptance is not implied. |
| Jitter expiry under wall-clock rollback | Unintegrated | #274 at a4c6f945adef0438bfd0b347fb7c11057e3973ce: independent original suite 13/13; same tests on baseline 11 pass/2 fail. Scoped lint was killed 137; main conflict and hosted gates remain. |
| Accessibility, mobile files and screen readers | Partial | Existing fixes retained. Physical devices, camera, screen-reader and mobile import/download acceptance were not completed. Local Chromium cannot start its process socket. |
| Internationalization | Partial | Catalog/key behavior retained. Changed #252 security copy deliberately remains English in ar/es/ja until native review. Historical #182 work is not fresh language acceptance. |
| Independent Pages artifact verification helper | Unintegrated; scoped repair verified | #277 at8cbae85c fixes two observed filesystem races and both invalid-UTF8 identity boundaries. Final original Node suite17/17 and independent17/17, syntax/diff and published-tree readback pass. Exact-head CI and a trusted real artifact remain pending; inputs and ancestors must stay private/stable through use. |
| User/developer documentation | Nearly complete | This candidate completes the eight requested records, preserves #259 historical documentation and corrects stale source inventories. Product acceptance remains separate. |

## Deferred and externally blocked scope

| Area | Status | Boundary |
|---|---|---|
| Fee-recipient activation | Deferred | Remains on hold. |
| Mandatory guardians/new escrow or policy authority | Deferred | Retain experimental/model evidence; do not add mandatory or custodial recovery. |
| EIP-7702/ERC-4337 and non-EOA export models | Deferred | Preserve applicable existing validation; Spec 18 does not authorize treating incompatible key models as scheme-1 EOAs. |
| Hosted services, native/CLI deployment variants, BTC hosted scan mode C | Deferred | Preserve useful source without activating paused variants. |
| Deployment, public release and mainnet qualification | Outside authorization / blocked | No deployment or release. Do not fabricate signed manifests, runtime pins or live-provider evidence. |
| Final global security/acceptance declaration | Blocked | Broad #264 has failing tests/analyzers; full current-main and external acceptance remain incomplete. |

## Inventory boundaries

The fixed census covers 278 branches and 267 PRs through #269. The later remote read found 285 branches and no lost original heads; addenda preserve the different observation times. GitHub search found one non-PR issue, #38; its body and two comments describe historical defects/fixes. TODO/FIXME, skipped/todo/expected-failure and not-implemented searches covered application, library, test and script paths; no literal stub search proves completeness.

Main's older master completion ledger describes #203/7a620ff1 and earlier candidates. Its results remain historical. The stale chain-adapter checklist is corrected from nine configured testnet tokens/four feeds without inventing live verification. Explicit next action: qualify and integrate current #271/#272 and the documentation recovery, then reconcile the already-owned recovery/idle/export candidates with their combined guarantees intact.

## Closing observation — 11:41 UTC

The final fixed census has288 branches, with no prior branch missing. [Final observations](20261119-final-observations.json) disposition the new #277 branch and all five advanced refs. #267 at57dff1ad preserves its reviewed hosting source; #262 at40b64e8f adds only documentation/evidence. The latter packet contains failed and interrupted historical whole-suite attempts, not new complete application qualification.

All eight records were published and read back in #273 at64e192916d66500db8a47a251b4ab17c4d756906. This follow-up preserves them and appends final evidence. Fresh checks still pending on #271/#272/#273/#275/#277/#267 prevent another main merge. The bounded #277 implementation is complete locally; integration and real-artifact acceptance are not.
