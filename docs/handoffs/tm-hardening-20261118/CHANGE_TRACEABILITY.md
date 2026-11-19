# Changed-file traceability

Every proposed path below maps to the bounded threat-model work. Existing custody, recovery, contract, analyzer, dependency and release policies are preserved.

| Changed path | Requirement | Reason / compatibility boundary |
|---|---|---|
| `.claude/skills/ghostpay-package-map/PACKAGE_MAP.md` | TM7 / TM11 | Refresh generated facts about existing privacy-package dependencies; no dependency or gate policy change. |
| `apps/relayer/PRIVACY.md` | TM11 | Existing padding/ingress/logging contract validation and documented exceptions. |
| `apps/relayer/src/config.ts` | TM11 | Existing padding/ingress/logging contract validation and documented exceptions. |
| `apps/relayer/src/log.ts` | TM11 | Existing padding/ingress/logging contract validation and documented exceptions. |
| `apps/relayer/src/privacy.test.ts` | TM11 | Existing padding/ingress/logging contract validation and documented exceptions. |
| `apps/web/e2e/privacy-settings.spec.ts` | TM4 / TM14 | Endpoint retention/export and explicit saved profile consent; regression/browser definitions. |
| `apps/web/locales/ar.json` | TM2 / TM4 / TM9 / TM11 / TM12 / TM14 / TM15 | Accurate disclosures and fixed privacy-error messages; catalog/security-key compatibility. |
| `apps/web/locales/en.json` | TM2 / TM4 / TM9 / TM11 / TM12 / TM14 / TM15 | Accurate disclosures and fixed privacy-error messages; catalog/security-key compatibility. |
| `apps/web/locales/es.json` | TM2 / TM4 / TM9 / TM11 / TM12 / TM14 / TM15 | Accurate disclosures and fixed privacy-error messages; catalog/security-key compatibility. |
| `apps/web/locales/ja.json` | TM2 / TM4 / TM9 / TM11 / TM12 / TM14 / TM15 | Accurate disclosures and fixed privacy-error messages; catalog/security-key compatibility. |
| `apps/web/scripts/apply-csp.d.mts` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `apps/web/scripts/apply-csp.mjs` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `apps/web/scripts/csp.d.mts` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `apps/web/scripts/csp.mjs` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `apps/web/src/buildScripts.test.ts` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `apps/web/src/components/ReceiptPanel.test.tsx` | TM9 | Scope address disclosure choice to payment/seller and verify minimized output. |
| `apps/web/src/components/ReceiptPanel.tsx` | TM9 | Scope address disclosure choice to payment/seller and verify minimized output. |
| `apps/web/src/features/btc/esplora.ts` | TM13 | Verified spend evidence and stale-review request cancellation. |
| `apps/web/src/features/btc/scan.localSpends.test.ts` | TM13 | Verified spend evidence and stale-review request cancellation. |
| `apps/web/src/features/tron/TronView.privacy.test.tsx` | TM13 | Verified spend evidence and stale-review request cancellation. |
| `apps/web/src/features/tron/TronView.tsx` | TM13 | Verified spend evidence and stale-review request cancellation. |
| `apps/web/src/features/tron/sweep.ts` | TM13 | Verified spend evidence and stale-review request cancellation. |
| `apps/web/src/i18n/securityKeys.ts` | TM2 / TM4 / TM9 / TM11 / TM12 / TM14 / TM15 | Accurate disclosures and fixed privacy-error messages; catalog/security-key compatibility. |
| `apps/web/src/lib/defaultServices.privacySelection.test.ts` | TM14 | Strict stored-profile parsing at the existing shared EVM RPC guard. |
| `apps/web/src/lib/defaultServices.test.ts` | TM14 | Strict stored-profile parsing at the existing shared EVM RPC guard. |
| `apps/web/src/lib/defaultServices.ts` | TM14 | Strict stored-profile parsing at the existing shared EVM RPC guard. |
| `apps/web/src/lib/networkSelection.ts` | TM14 | Strict stored-profile parsing at the existing shared EVM RPC guard. |
| `apps/web/src/lib/relayerClient.test.ts` | TM11 | Existing padding/ingress/logging contract validation and documented exceptions. |
| `apps/web/src/lib/relayerClient.ts` | TM11 | Existing padding/ingress/logging contract validation and documented exceptions. |
| `apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts` | TM12 | Finite default-off evidence target and preserving cancellation fixture assertions. |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | TM12 / TM15 | Finite scan configuration; active window preallocation/dispatch budgets and cancellation wiring. |
| `apps/web/src/lib/scanPrivacy.scheduler.test.ts` | TM12 / TM15 | Finite scan configuration; active window preallocation/dispatch budgets and cancellation wiring. |
| `apps/web/src/lib/scanPrivacy.test.ts` | TM12 / TM15 | Finite scan configuration; active window preallocation/dispatch budgets and cancellation wiring. |
| `apps/web/src/lib/scanPrivacy.ts` | TM12 / TM15 | Finite scan configuration; active window preallocation/dispatch budgets and cancellation wiring. |
| `apps/web/src/lib/settings.ts` | TM4 / TM14 | Endpoint retention/export and explicit saved profile consent; regression/browser definitions. |
| `apps/web/src/lib/settingsExchange.ts` | TM4 / TM14 | Endpoint retention/export and explicit saved profile consent; regression/browser definitions. |
| `apps/web/src/lib/settingsPrivacy.test.ts` | TM4 / TM14 | Endpoint retention/export and explicit saved profile consent; regression/browser definitions. |
| `apps/web/src/views/CreateInvoice.privacy.test.tsx` | TM10 | Reset private form/plaintext consent for each loaded seller session. |
| `apps/web/src/views/CreateInvoice.tsx` | TM10 | Reset private form/plaintext consent for each loaded seller session. |
| `apps/web/src/views/Scan.privacy.test.tsx` | TM12 / TM15 | Finite scan configuration; active window preallocation/dispatch budgets and cancellation wiring. |
| `apps/web/src/views/Scan.tsx` | TM12 / TM15 | Finite scan configuration; active window preallocation/dispatch budgets and cancellation wiring. |
| `apps/web/src/views/Settings.test.tsx` | TM4 / TM14 | Endpoint retention/export and explicit saved profile consent; regression/browser definitions. |
| `apps/web/src/views/Settings.tsx` | TM4 / TM14 | Endpoint retention/export and explicit saved profile consent; regression/browser definitions. |
| `deploy/BUILD-WEB.md` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `deploy/README.md` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `deploy/TOR.md` | TM6 / TM14 | Tor/own-node limits and exact tested selection boundary. |
| `deploy/nginx/render-security-headers.mjs` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `docs/ai/ACTIVE_WORK.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/developer/security-model.md` | TM1–TM15 | Authoritative matrix/defaults, accurate limits and user/developer guidance. |
| `docs/handoffs/tm-hardening-20261118/CHANGE_TRACEABILITY.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/QUALIFICATION.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/acceptance-review.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/browser-review.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/local-evidence-index.json` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/local-implementation-evidence.zip` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/metadata-browser-cross-review.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/metadata-review.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/metadata-web-scheduler-review.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/handoffs/tm-hardening-20261118/relayer-chain-review.md` | TM1–TM15 | Ownership, independent review, evidence and acceptance disposition. |
| `docs/threat-model/PRIVACY_THREAT_MODEL.md` | TM1–TM15 | Authoritative matrix/defaults, accurate limits and user/developer guidance. |
| `docs/threat-model/TM_HARDENING_COMPLETION_20261118.md` | TM1–TM15 | Authoritative matrix/defaults, accurate limits and user/developer guidance. |
| `docs/threat-model/TM_IMPLEMENTATION_20261118.md` | TM1–TM15 | Authoritative matrix/defaults, accurate limits and user/developer guidance. |
| `docs/user/privacy-limits.md` | TM1–TM15 | Authoritative matrix/defaults, accurate limits and user/developer guidance. |
| `packages/chain-adapters/src/payments.bulkCancellation.test.ts` | TM12 | Finite default-off evidence target and preserving cancellation fixture assertions. |
| `packages/scan-source/src/padded.test.ts` | TM15 | Arithmetic request budgets and cancellation at existing padded/range helper boundaries. |
| `packages/scan-source/src/padded.ts` | TM15 | Arithmetic request budgets and cancellation at existing padded/range helper boundaries. |
| `packages/scan-source/src/range.test.ts` | TM15 | Arithmetic request budgets and cancellation at existing padded/range helper boundaries. |
| `packages/scan-source/src/range.ts` | TM15 | Arithmetic request budgets and cancellation at existing padded/range helper boundaries. |
| `scripts/pages/build-pages.sh` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `scripts/tests/privacy-csp.test.mjs` | TM5 | Exact CSP normalization, enforcing artifacts, Pages propagation and matching nginx renderer. |
| `apps/web/e2e/app.spec.ts` | TM10 | Preserve historical plaintext invoice rendering acceptance; acknowledge exactly one expected outgoing beforeunload prompt while retaining every unexpected-dialog/XSS assertion. |
| `docs/handoffs/tm-hardening-20261118/browser-fixture-review.md` | TM10 | Source-pinned inherited browser failure, narrow fixture correction and pending hosted execution. |
| `apps/web/scripts/scan-bundle.mjs` | TM5 | Accept exact configured origins only inside a validated enforcing connect-src; preserve all other host, resource, inline-code and source gates. |
| `apps/web/scripts/scan-bundle.d.mts` | TM5 | Declare the bounded CSP scanner configuration without changing existing ownOrigin callers. |
| `scripts/tests/privacy-csp-bundle.test.mjs` | TM5 | Failing-first configured-CSP integration regressions, malformed/inert/encoded source rejection and preserved host gates. |
| `docs/handoffs/tm-hardening-20261118/bundle-csp-review.md` | TM5 | Implementation red/green evidence, exact five-file source hashes and artifact-only scope. |
| `docs/handoffs/tm-hardening-20261118/tm5-scanner-acceptance-review.md` | TM5 | Independent adversarial probes, actual-artifact scanner acceptance and no-source-blocker review. |
| `docs/handoffs/tm-hardening-20261118/scan-privacy-typefix-review.md` | TM12 / TM15 | Independent review of the new hosted fixture-typing regression and one-property correction; no weakened cancellation assertion. |
| `docs/handoffs/tm-hardening-20261118/tm1-tm7-tm8-acceptance-execution.md` | TM1 / TM7 / TM8 | Independent targeted execution of unchanged Sweep consent, local reuse history and current v4 checkpoint boundaries; exact commands, filtered counts and source pins. |
