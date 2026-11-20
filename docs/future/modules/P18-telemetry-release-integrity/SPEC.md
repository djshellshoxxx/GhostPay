# P18 — Telemetry minimization and release integrity

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P18` / `telemetry-release-integrity` |
| Branch | `future/p18-telemetry-release-integrity` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | None |
| Optional integrations | None |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and independently testable submodules

Provide two separate capabilities under one roadmap module: **P18-A egress/telemetry minimization** and **P18-B reproducible artifact integrity**. Neither depends on the other's implementation. Products can consume their descriptors independently; P01 consumes artifact/hosting evidence. Existing baseline security controls remain active: only additional future functionality defaults off.

Sources: [issue #284 P18](https://github.com/djshellshoxxx/GhostPay/issues/284), [architecture 5a](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5a.md) and [architecture 5l](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5l.md). This module has no hard or optional future dependencies and cannot authorize publication, release keys or production configuration.

## 2. Existing implementation and residual delta

- [Egress inventory](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/privacy/network-egress-inventory.json) and [network isolation analysis](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/privacy/browser-network-isolation.md) provide existing source evidence to refresh rather than duplicate.
- [Bundle scanner](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/scripts/scan-bundle.mjs) exports `scanSourceSinks` and `scanBundle`; static scanning is useful but cannot establish every runtime behavior.
- [Build profiles](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/scripts/localBuildProfile.mjs) emits module reports and lean selection boundaries.
- [Pages verifier](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/scripts/pages/verify-pages-site.mjs) exports `verifySite`, `checkLeanReport` and `sha256sums`.
- [Reproducibility check](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/scripts/repro-check.sh) builds in two differently located clean directories and compares tarball/SBOM bytes.
- [Release verification](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/scripts/verify-release.sh) explicitly checks hashes/consistency; authenticity comes separately from signed tags and independently verified provenance.
- [Hosting verification](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/tools/portable-hosting-kit/src/core/verify.mjs) exports `verifyArchive`, `verifyDirectory` and bounded extraction helpers.

The delta is shared versioned evidence contracts, runtime inventory coverage and honest verification presentation. No claim is made that current source audits establish exact future artifacts or that reproducibility itself proves safety.

## 3. Ownership and boundaries

P18-A owns request-sink inventory, telemetry prohibition rules and privacy-safe local diagnostics. It does not implement RPC routing (P02), user consent screens, endpoint services or application transaction logic.

P18-B owns source/artifact/provenance binding and reproducibility evidence adapters around existing scripts. It does not choose a release signer, publish tags, bypass CI, rotate trust roots or host mirrors. Neither submodule imports consumer UI or introduces a mandatory verification server.

## 4. Proposed data and API

```ts
interface EgressRuleV1 {
  version: 1; sinkId: string; trigger: string;
  recipientClass: string; payloadClasses: readonly string[];
  requiresConsent: boolean; defaultEnabled: boolean;
}
interface ArtifactEvidenceV1 {
  version: 1; sourceCommit: string; sourceTree: string;
  artifactDigest: string; lockfileDigest: string;
  buildInputsDigest: string;
  reproducibility: 'unchecked' | 'different' | 'matching';
  authenticity: 'unverified' | 'verified' | 'revoked';
  evidenceRefs: readonly string[];
}
interface EgressAuditProvider {
  assess(rules: readonly EgressRuleV1[], traces: TraceHandle,
    ctx: OperationContext): Promise<ModuleResult<EgressAssessment>>;
  capability(): CapabilityDescriptorV1;
}
interface ArtifactIntegrityProvider {
  verify(input: ArtifactInput, trust: TrustedReleasePolicy,
    ctx: OperationContext): Promise<ModuleResult<ArtifactEvidenceV1>>;
  capability(): CapabilityDescriptorV1;
}
```

Trace handles are local bounded evidence references, not raw user traffic uploads. Evidence records exclude credentials, private invoice fields and deterministic user identifiers. A policy's own bundled signing key is not automatically an independent trust root.

## 5. P18-A behavior and lifecycle

Inventory app-owned fetch/XHR/WebSocket/beacon/worker/lazy-resource paths, including failures and optional integrations. Prohibit analytics, remote crash reporting, remote fonts and silent diagnostics. Offline boot/preparation has no external application requests; explicitly consented payment/RPC requests remain necessary and separately listed.

Diagnostics use finite error codes and aggregate local counters, never full provider errors or request bodies. Export is a deliberate reviewed user action. Clipboard behavior is opt-in, purpose-limited and redacted on lock where possible; browser/OS clipboard histories cannot be reliably erased.

Lock, cancel, profile change or deadline expiry discards trace-derived sensitive views and late exports. Browser extension and browser telemetry are outside app control and must not be represented as audited app silence.

## 6. P18-B behavior and lifecycle

1. Bind exact commit/tree, lockfile, build inputs/tool versions and intended profile.
2. Build independently in clean directories; compare declared artifact/SBOM bytes.
3. Verify checksum structure and artifact content, then independently verify approved signatures/provenance.
4. Distinguish matching bytes, authentic signer, reviewed source and qualified deployment; none implies the others automatically.
5. Record missing trust/freshness evidence honestly, including offline inability to establish latest revocation state.
6. Reject stale operation/profile results and preserve previous verified artifacts on failure.

A malicious served page can lie about its own verification UI; provide independent verification instructions/tools outside that origin. Subpaths do not isolate browser storage. GitHub Pages meta-CSP lacks some header protections; browser code cannot prove actual Tor routing. Chain reorgs do not change artifact hashes, but can invalidate separately referenced deployment evidence.

## 7. Proposed resource limits

Egress rule catalog: 1 MiB, 1,000 rules and eight nesting levels. Trace capture: 10,000 redacted events or 10 MiB, whichever comes first; indicate truncated coverage rather than successful completeness. Audit processing is cancellable and capped at 60 seconds per invocation.

Artifact metadata: 16 MiB; 10,000 file entries; 100 MiB uncompressed browser artifact, unless a justified profile specifies stricter or revised limits. Stream archives, reject path traversal/symlinks/duplicate entries and expansion beyond limits. Build jobs have explicit resource budgets chosen for the actual toolchain; no arbitrary runtime package download is part of browser verification.

## 8. Privacy and trust matrix

| Observer / failure | Exposure or limitation | Required treatment |
|---|---|---|
| Host | Asset requests and origin metadata | Minimize external resources; disclose hosting boundary |
| Wallet/RPC | Consented payment/network data | Inventory separately; no total-anonymity claim |
| Diagnostics exporter | Selected local evidence | Preview/redact; no automatic uploads |
| Compromised serving origin | Can alter app and self-verification UI | Independent verification outside origin |
| Build/release actor | Source, dependency and signer control | Pinned inputs, signatures and source-matched provenance |
| Reproducible malicious code | Matching bytes but harmful behavior | Distinguish reproducibility from review/safety |

## 9. Pricing policy

Telemetry prohibition, local diagnostics redaction and artifact verification remain free safeguards. No payment is required to inspect integrity evidence or use offline verification. P18 has no fee dependency or recipient. Optional third-party auditing/hosting services cannot become a mandatory GhostPay account or silently introduce analytics.

## 10. Acceptance cases

- **P18-A01:** Offline boot and preparation produce no app-owned external requests.
- **P18-A02:** Lazy modules, worker failures and error paths are included in inventory/trace coverage.
- **P18-A03:** Unapproved trackers/resources cause a failed assessment rather than a widened allowlist.
- **P18-A04:** Local diagnostic export excludes secrets, raw transactions and identifying request fields.
- **P18-A05:** Lock/cancel/profile change rejects stale trace views and late downloads.
- **P18-A06:** (Integrity) Two clean builds with declared identical inputs produce matching artifact/SBOM bytes or explicit differences.
- **P18-A07:** (Integrity) Hash matching without independent signature trust remains authenticity-unverified.
- **P18-A08:** (Integrity) Wrong source/profile, altered manifest or revoked signer refuses verification.
- **P18-A09:** (Integrity) Oversized/path-invalid archives fail before unsafe extraction or unbounded allocation.
- **P18-A10:** (Integrity) Browser/header/Tor limitations and missing external evidence remain visible.
- **P18-A11:** (Integrity) Either submodule can be tested/used without depending on the other's implementation.

## 11. Implementation slices and future checks

A1 refreshes sink inventory; A2 adds runtime trace fixtures/redaction; A3 independently reviews failure paths. B1 freezes evidence schema; B2 integrates existing reproducibility/verifiers; B3 independently verifies artifacts and trust-state presentation. Shared work is limited to common capability vocabulary.

Existing commands, **not run here**:

```bash
npm run ci:scan-secrets
npm run ci:check-actions
npm run build -w @ghostpay/web
node --test scripts/pages/verify-pages-site.test.mjs
bash scripts/repro-check.sh --head
npm --prefix tools/portable-hosting-kit run check
```

## 12. Migration, rollback and decisions

Version inventories/evidence without rewriting historical results as current. Rollback preserves reviewed artifacts and allows independent verification; it cannot disable existing telemetry protections. Resolve release trust authority, revocation distribution, evidence retention and build budgets before implementation. This spec creates no release key, deployment, CI bypass or publish action.
