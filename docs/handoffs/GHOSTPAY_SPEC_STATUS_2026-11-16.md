# GhostPay specification and acceptance status — 2026-11-16

> **Historical snapshot.** Current implementation, source-pinned checks, integration decisions and remaining gates are maintained in [GHOSTPAY_MASTER_COMPLETION_LEDGER.md](GHOSTPAY_MASTER_COMPLETION_LEDGER.md). The older statuses below do not override that ledger.

This inventory is a source review, not a complete security audit or a passing test report. Reviewed base:
`30733000` on `codex/ghostpay-integrate-pages-20261116`, containing the broad completion candidate
`d26418c2539619fb75783a82886a96971142d226`, Pages fixes through
`17f681915f25441f5c38326ad718b8082495d52a`, and the later Pages/architecture audit notes.
Recheck the actual integration head and its CI before treating any row as qualified.

The current request asks for completion and consolidation across the project. Earlier release documents identify
one static EVM GitHub Pages beta as the first release milestone; they do not establish that all historical extension
specifications are complete. Preserve later features and design briefs, and distinguish their requirements from the
beta acceptance claim. In particular, the estimates in `docs/COMPLETION_PLAN.md` describe 2026-10-22 and are not a
current measurement.

## Static EVM beta

`docs/pages/RELEASE_MATRIX.md` and `docs/handoffs/PAGES_BETA_CONTINUATION_2026-11-14.md` provide the scoped release
requirements. “Implemented” below means the cited implementation and tests exist; final combined-head execution
and review remain necessary.

| Feature | Implementation and acceptance evidence | State / remaining work |
| --- | --- | --- |
| Key generation, encrypted vault and verified backup | `apps/web/src/lib/session.ts`, `keyVault.ts`; `session.test.ts`, `keyVault.idb.test.ts`, `SellerKeys.test.tsx`; Pages journey b/f | Implemented. New Pages stack requires an actually verified backup or explicit waiver before sharing/creating invoices. Requalify after consolidation. |
| Sleep-aware session lock and stale-operation rejection | `apps/web/src/AppShell.tsx`, `lib/appLock.ts`; `App.test.tsx`, key/session guard tests | Implemented. Real device sleep and platform lifecycle acceptance remains separate from fake-clock tests. |
| Signed invoice, expiry, tamper rejection and explicit wallet review | `lib/invoiceCreate.ts`, `lib/pay.ts`, `lib/payExec.ts`, `views/Pay.tsx`; corresponding unit tests and Pages journey b/c/g | Implemented. Requires release-signed deployment configuration and real external-wallet acceptance before public testnet qualification. |
| Submission journal and uncertain outcomes | `lib/duplicateAttemptJournal.ts`, `lib/wallet.ts`, `components/WalletAttempts.tsx`; `payExec.test.ts`, `wallet.test.ts`, Pages journey c | Implemented tab-local duplicate refusal. Wallet journal supports `unknown`/`submitted`; Pay does not automatically discover/classify a replacement transaction. A transaction hash or successful replacement never proves the original invoice was paid. |
| Same-nonce cancellation acceptance | `apps/web/e2e/pages-devnet.spec.ts`, test “a same-nonce wallet cancellation…” | Added on this work branch: real higher-fee self-transfer replaces a pending router payment; asserts no original receipt, seller funds, fee, seller receipt or retry broadcast. Requires execution on the final combined head; no pass claimed here. |
| Scanning, checkpoints, finality, reorg and live evidence | `lib/scannerCore.ts`, `scanClient.ts`, `scanPrivacy.ts`; scanner/scanClient tests, Pages journey d/e | Implemented. Recheck imported-history treatment and provider disagreement in the final audit. |
| Seller browser-process restart | Pages journey e now uses `launchPersistentContext`, closes that browser process, then relaunches the same on-disk profile without storage injection | Added on this work branch. Existing wrong-passphrase, exact encrypted-vault digest, key identity, invoice/receipt/ledger, checkpoint resume and duplicate-count assertions retained. Requires actual execution; closing only pages was the prior coverage limit. |
| Invoice reconciliation and archived receipts | `packages/ux-vault/src/reconciliation-portable.ts`; `apps/web/src/components/ReconciliationLedger.tsx`; reconciliation/receipt unit tests and Pages journey d/f | Implemented local hints and seller attestations, not settlement proof. Imported-history badge fix is included. Review `proposeInvoiceMatch` claimed-invoice filtering separately: this base lets imported links suppress a fresh proposal. Observation time still differs from block time (ADR-0026 item 8). |
| Native direct sweep | `lib/sweep.ts`, `sweepAttemptJournal.ts`, `views/Sweep.tsx`; sweep suites and Pages journey d/e/f | Implemented. Native path has real-chain acceptance coverage. ERC-20 direct sweep is not qualified by the Pages devnet: allowlisted token addresses are not the harness stand-ins. |
| QR and device exchange | `components/CameraImporter.tsx`, `lib/qrKinds.ts`, `packages/qr-exchange`; QR unit/property suites, `qr-camera*.spec.ts` | Implemented. Physical camera, glare and mobile permission flows require real devices. |
| Static delivery, sub-path isolation and network boundaries | `scripts/pages/build-pages.sh`, `verify-pages-site.mjs`, `smoke.mjs`; Pages tooling tests and artifact journey a | Implemented. Dedicated serving origin, deployment settings and exact release configuration still required. |

## Numbered implementation specifications

Status reflects current code and documented deviations, not unchecked boxes in older drafts. A different module name
or an atomic implementation replacing a proposed journal is not automatically a missing feature. Conversely,
working tests for the implemented subset do not satisfy absent requirements.

| Spec | Source and existing tests | Remaining requirement / disposition |
| --- | --- | --- |
| 01 Manifest readback | `packages/chain-adapters/src/verify.ts`, `verify.test.ts`; `apps/web/src/lib/deployment.ts`, `deployment.test.ts` | Router/relayer runtime hashes and router constants checked; optional secondary-provider agreement exists. Canonical announcer code presence is checked but its hash is not pinned. Proposed 10-minute cache is absent. Signing uses documented secp256k1 domain-separated signatures, not the original Ed25519 sketch. Pinning needs verified reference data; absence of a cache is not a fail-open defect. |
| 02 Scanner robustness / expected payment | `scannerCore.ts`, `scanClient.ts`; `packages/chain-adapters/src/payments.ts`, `payments.test.ts`; reconciliation matching tests | Implemented bounded scan and router payment proof. PR #182 adds exact bigint below/equal/above summaries from explicit live final-at-scan links, with scope-wide conflict rejection. Automatic matching still requires an exact net amount. First-observed time is not canonical block time. Keep these honest in UX and acceptance. |
| 03 Fiat feeds | `packages/chain-adapters/src/quote.ts`, `quote.test.ts`; Create/Pay quote gates | Safe disabled/unavailable behavior exists. A verified per-chain feed inventory, provider reads and acceptance are required before enabling missing feed combinations. Do not invent feed addresses or freshness values. |
| 04 Permit griefing fallback | `packages/chain-adapters/src/permit.ts`, `permit.test.ts`; web `payExec.ts`/`sweep.ts`; relayer API/Anvil tests | Classifier, preflight and user-visible refusal paths exist. Requires combined contract/relayer/web qualification. Optional new contract behavior is not automatically authorized by the older alternative-design section. |
| 05 Announcer spam / anonymity disclosure | `packages/chain-adapters` announcement fetch; `scannerCore.ts`, `scanClient.ts`, scanner budget/fuzz tests | Implemented trusted/open lanes, bounds, replay memo and disclosures. Spec records provider and oversized-single-block limits; do not claim measured anonymity from announcement counts. |
| 06 ERC-6538 registry | `packages/chain-adapters/src/registry.ts`, `registry*.test.ts`; `apps/web/src/features/registry/RegistryView.tsx`, registry Anvil tests | Direct register/read/remove by address exists. PR #182 adds validated nonce-call, increment-nonce and on-behalf registration builders with 40 focused tests. ENS resolution and delegated signing/send/UI integration remain absent. Registry is actually reachable in the lean shell; older “deferred registry” statements need reconciliation with current `CORE_ORDER`. |
| 07 Relayer observability | `apps/relayer/src/metrics.ts`, `alerts.ts`, `server.ts`, `ops.ts`; relayer API/ops tests | Authenticated opt-in metrics and operations tooling exist. Original separate metrics listener, `/v1/stats`, and signed alert webhook interface are not implemented as drafted. Relayer service is outside the static Pages delivery. |
| 08 Archive export/import and rotation | `apps/web/src/lib/tags.ts`, `idbStore.ts`; tag/import/rotation tests | Atomic `TagStore.applyBatch` replaces the draft multi-step rotation journal. Treat this as an implementation alternative, not missing crash resumability without examining atomicity. Tag archive is retained outside the lean beta artifact. |
| 09 Verified chain/token/deployment matrix | `packages/chain-adapters/src/config/chains.ts`, `tokens.ts`; token/manifest tests | Proposed machine-readable verified matrix, operator matrix and CI rule binding enabled chains to verified cells are absent. Finality/range settings are documented engineering defaults. Requires primary-source/network verification and deployment evidence. |
| 10 Privacy-aware stage-1 scanning | `apps/web/src/lib/scanPrivacy.ts`, `scanClient.ts`; privacy/scan tests | Implemented user-configured transport, fixed windows, disclosure and fail-closed checks. A web page cannot itself establish a SOCKS route; external proxy/Tor setup remains a user/operator prerequisite. |
| 11 BIP-352 wallet hardening | `packages/btc-silent-payments`; `apps/web/src/features/btc`; official-vector/property and BTC integration tests | Retained in full profile. Not part of Pages beta; requires its own final cross-package qualification and wallet/device evidence. Do not infer completeness from this EVM review. |
| 12 BIP-352 light scanning | `packages/btc-silent-payments/src/scan/headersync.ts`, `headersync.test.ts`; web BTC header tests | Header-sync/local verification implementation exists. External source compatibility, persistent real-node acceptance and the full spec need separate qualification. Not a Pages release claim. |
| 13 Gas buffer v2 | `apps/web/src/lib/pay.ts` buffer estimation/freshness; invoice schema and contract tests | Full-profile buffer policies exist; lean excludes v2 invoices. Native/USD feed-dependent display and optional permit-plus-buffer contract extension remain distinct gates. |
| 14 Merchant embedding | `apps/web/src/lib/embedHost.ts`, `embedProtocol.ts`, corresponding tests; `packages/ux-flow/src/embed.ts` | Signed profile readback and embed handshake exist. The continuation candidate displays the signed name and signer fingerprint with a key-control-only warning. `fetchMerchantProfile` still has no production caller; trusted identity pinning, remote-profile loading, and template presentation remain incomplete. Excluded from static beta. |
| 15 AA / EIP-7702 policy account | `packages/policy-scheme`, policy contracts; ADR-0027/0028 and policy tests | Retained experimental policy path is not the proposed convenience `SweepDelegate`. AUD24-01 policy-hash calldata disclosure remains open; an ABI/privacy decision is required. No real-funds qualification. |
| 16 Guardian recovery | `docs/adr/ADR-0028-policy-recovery-authority-model.md`; `docs/specs/16-policy-account-recovery.md` | Design/authority decision, not completed guardian recovery implementation. Requires agreed authority model, compatible schema/contract design, adversarial invariants and review. |
| 17 Milestone escrow | `docs/specs/17-milestone-escrow.md`, `docs/research/reuse/milestone-escrow.md` | Explicit separate-product design brief, not implemented. Custody/dispute/authority choices and prerequisites must be settled before a concrete implementation can be declared to match it. |

The additional `docs/remote/privacy-specs/` and usability specifications describe retained experimental packages,
optional adapters and explicitly watch-only ideas. This inventory does not certify all those proposals complete.
Review their package `DEVIATIONS.md`/README and acceptance suites before widening the supported product claim.

## External qualification and decisions

1. Select a dedicated serving origin and resolve ADR-0029. Shared GitHub Pages paths share one origin/storage trust
   boundary; a sub-path build does not isolate that origin.
2. Configure Pages source/environment for the approved release branch, then review the concrete built artifact.
   Local source integration is not a deployment.
3. Supply approved testnet contract deployments, fee-recipient/deployer decisions, release-signing trust root and
   signed manifests. Keep private keys out of repository and logs. Local Anvil public keys are not release keys.
4. Both high-severity baseline CodeQL annotations were retrieved and their polynomial regex patterns corrected
   in this candidate. Obtain fresh combined-head CodeQL results and the remaining Sonar issue inventory; old green
   branches, unreachable dashboards and skipped release jobs are not evidence of clearance.
5. Run real external wallet/mobile/Safari, screen-reader and native-language acceptance. Emulation and drafted
   translations are useful engineering evidence, not a substitute for those checks.
6. Obtain independent security review of the final release contracts/crypto/client and close its findings.
7. For all-spec expansion, resolve the concrete ABI/privacy, guardian recovery and escrow authority choices above.
   Do not silently redefine design-gated proposals as complete or enable their fund paths to clear a checklist.

## Required execution record

The integrator must append exact commit, command, result/count and CI links for build, typecheck, lint, unit/property,
Foundry fuzz/invariants, Pages real-chain acceptance, browser/device suites and any unavailable gates. This source
inventory deliberately inherits no passing result from previous branches.
