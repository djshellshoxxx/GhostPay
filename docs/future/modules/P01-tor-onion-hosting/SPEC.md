# P01 — HTTPS and Tor-compatible static hosting

> **Specification only.** Branch and documentation work authorized on 2026-11-19. Implementation, merge, deployment, paid-service activation and release remain outside this task. Default disabled; no executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P01` / `tor-onion-hosting` |
| Branch | `future/p01-tor-onion-hosting` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependency | [P18 release integrity](https://github.com/djshellshoxxx/GhostPay/blob/future/p18-telemetry-release-integrity/docs/future/modules/P18-telemetry-release-integrity/SPEC.md) |
| Optional modules | None |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

## 1. Objective and provenance

Serve the same reviewed static GhostPay client over standard HTTPS and an operator-selected Tor onion origin, with no unnoticed clearnet resources. Users can verify artifact identity, understand the serving origin, and run offline preparation without a publisher account. A webpage cannot prove the browser's complete network route or control extensions.

Scope comes from [issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283), [issue #284 P01](https://github.com/djshellshoxxx/GhostPay/issues/284), and [architecture 5g](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5g.md). P18 owns release integrity and egress evidence rules; P01 consumes its reviewed artifact descriptor and adds hosting-profile compatibility evidence.

## 2. Existing implementation and residual delta

- The [portable hosting kit](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/tools/portable-hosting-kit/README.md) already describes static, container, Tor and I2P profiles without runtime dependencies. Reuse packaging, validation and serving profiles; do not introduce another host packaging product.
- Its [Tor adapter](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/tools/portable-hosting-kit/src/adapters/tor.mjs) and adapter tests are integration points, not proof of live Tor interoperability.
- The [Pages builder](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/scripts/pages/build-pages.sh) emits a lean artifact and evidence, rejects inappropriate manifests and defaults to payments disabled.
- The [browser transport entry](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/net-transport/src/browser.ts) exports `validateOnionUrl`, `isValidV3OnionHost`, `createFetchTransport`, and `transportToFetch`. The package root exposes Node networking and must not enter browser bundles.

The delta is a unified hosting capability contract, deterministic HTTPS/onion artifact comparison, blocked-resource presentation, and separate live browser/operator qualification. Installing Tor or opening SOCKS from webpage JavaScript is outside scope.

## 3. Ownership and integration

Proposed ownership is hosting-profile documentation, minimal extensions under `tools/portable-hosting-kit`, and a small web origin-capability adapter. P18 retains signature verification and global egress inventory. P02 retains RPC endpoint consent. Keep operator CLI/container code outside the browser runtime.

P18 is the only hard future dependency. Runtime RPC availability is neither required for static hosting nor inferred from successful page loading. P01 never imports product workflows. A profile can explain unsupported network operations while local functions remain usable.

## 4. Proposed data and API contract

These interfaces are proposed, not existing exports. Common types follow `COMMON.md`; operation context includes operation ID, session epoch, abort signal and deadline.

```ts
interface HostingProfileV1 {
  version: 1;
  profileId: string;
  origin: string;
  transportExpectation: 'https' | 'onion-browser';
  artifactDigest: string;
  assetManifestDigest: string;
  allowedResourceOrigins: readonly string[];
  headerCapabilities: readonly string[];
}
interface HostingAssessment {
  artifact: 'verified' | 'unverified' | 'mismatch';
  networkRoute: 'user-configured-unattested';
  missingCapabilities: readonly string[];
}
interface HostingAdapter {
  assess(profile: HostingProfileV1, ctx: OperationContext):
    Promise<ModuleResult<HostingAssessment>>;
  capability(): CapabilityDescriptorV1;
}
```

The profile is public configuration, not a secret or user identifier. Normalize origins once and reject credentials, fragments, confusing hostnames and unknown schemes. A self-reported page digest is insufficient authentication: display P18 evidence provenance explicitly.

## 5. Behavior and lifecycle

1. Operator selects a reviewed artifact, origin and serving profile; generating a profile does not publish it.
2. Validate paths and resource references before packaging. Executable/runtime assets are same-origin and integrity-accounted.
3. Display hosting capabilities and degraded header protections before sensitive operations. GitHub Pages meta-CSP cannot claim header-only protection.
4. Start offline preparation without external fetches. Consumer network operations remain separately consented.
5. Navigation, cancellation or profile changes invalidate pending assessments and release response readers.
6. Sleep/wake or clock jumps never upgrade route confidence. Explicit retry may recheck capabilities without automatic endpoint probes.
7. Chain reorg handling remains with consumers; hosting success cannot finalize transactions or revive invalid payment evidence.

Lock hides consumer-sensitive UI; P01 owns no secrets and persists no wallet state. Artifact mismatch, foreign executable assets or unsupported origins produce stable refusals. Operator outage cannot create a publisher signing requirement or prevent independent recovery.

## 6. Proposed resource limits

Profile JSON: 32 KiB; allowed origins: 16; capability labels: 128; each URL: 2,048 bytes. Artifact inventory: 10,000 files and 100 MiB uncompressed browser assets. Exceeding a ceiling requires reviewed profile revision, not truncation. Reject symlinks and parent-path traversal during packaging.

Explicit assessment reads: 15-second deadline, 64 KiB response cap, at most two concurrent reads, zero periodic route-attestation polling. Browser and operator tools report their different cancellation guarantees. These are proposed engineering budgets, not measured performance.

## 7. Privacy and trust matrix

| Observer / failure | Information or risk | Required treatment |
|---|---|---|
| HTTPS host | IP, files and timing | Explain host visibility; avoid identifying paths |
| Onion operator | Requests, timing, configured logs | Minimize logs; disclose operator observations |
| RPC / wallet | Independently exposed payment data | Keep consent separate from frontend transport |
| Same-origin applications | Shared storage/script trust | Dedicated origin; path prefix is not isolation |
| Altered mirror | Signing UI or exfiltration changes | Independent P18 integrity evidence |
| Browser / extensions | Local activity beyond app control | Never label route globally verified |

## 8. Pricing policy

Hosting selection, offline preparation and local artifact verification remain free client functions. No transaction add-on is charged for choosing onion mode. Optional operator hosting services may have a separately disclosed, accepted service price, without becoming mandatory. P01 configures no recipient and changes no existing protocol fee.

## 9. Acceptance cases

- **P01-A01:** Identical release files yield identical artifact digests across HTTPS/onion profiles; host configuration is recorded separately.
- **P01-A02:** Boot and offline preparation emit zero external requests, including lazy assets and service-worker activity.
- **P01-A03:** Foreign executable assets cause bounded refusal before publication; no clearnet rewrite occurs.
- **P01-A04:** Real Tor Browser acceptance records versions and traffic evidence without presenting a webpage-generated route proof.
- **P01-A05:** Header-incapable hosts accurately display limitations; subpaths are never described as origin isolation.
- **P01-A06:** Oversized/malformed profiles fail without partial output, path escape or sensitive diagnostics.
- **P01-A07:** Profile replacement/cancellation discards late checks; no endpoint switch follows.
- **P01-A08:** Unavailable wallet/RPC access leaves local functions usable and payment capability unavailable.
- **P01-A09:** Chromium, Firefox, WebKit and Tor Browser results remain separate from viewport emulation.

## 10. Implementation slices and future checks

Slice 1 inventories current profiles and freezes assessment fixtures. Slice 2 extends packaging and origin/header presentation. Slice 3 integrates P18 evidence and consumer refusals. Slice 4 qualifies HTTPS/onion traces, failures and independent recovery documentation.

These commands exist; they are future checks, **not run for this specification**:

```bash
npm --prefix tools/portable-hosting-kit run check
npm run build:libs
npm run build -w @ghostpay/web
npm run test -w @ghostpay/net-transport
npm run test:e2e -w @ghostpay/web
```

## 11. Migration, rollback and decisions

Preview explicit version-adapted imports; never overwrite onion keys or operator server configuration automatically. Rollback selects a previously verified artifact/profile while preserving user data and backup access. Disabling P01 removes its adapter, not HTTPS support. Resolve dedicated origins, Tor Browser support, header profiles and packaging budgets before implementation. Publication is a separate decision.
