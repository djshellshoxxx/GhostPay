# Developer Guide — static GitHub Pages client (draft)

[Home](Home.md) · [User Guide](User-Guide.md) · [Verification and Release Gates](Verification-and-Release-Gates.md)

## Architecture and source status

Active development is restricted to the **lean EVM testnet static browser app** in unmerged [Pages PR #137](https://github.com/djshellshoxxx/GhostPay/pull/137) at `ac08062ec540d429a0bfb24f3aab042be5d212eb`, stacked on unmerged [combined beta #135](https://github.com/djshellshoxxx/GhostPay/pull/135) `f88aaf2fe27a7656d15fed50670d841879da92ad`. The default `main` remains `bd2652bf1853948594522140a6a0fe0cbe54e32b`. No public deployment, merge or release has been authorized.

The React/Vite app runs cryptography, invoice validation, session/vault, QR exchange, RPC-backed scanning, payment review/dispatch and direct testnet sweep in the browser. External wallets and user-selected RPCs are **dependencies**, not GhostPay-hosted services. Payment-enabled builds require reviewed, signed EVM **testnet** manifests; otherwise payments are disabled. The production site cannot rely on server headers or a private GitHub-Pages origin without a dedicated origin decision. Server, relayer, merchant backend, native, CLI and non-EVM implementations are preserved but **development-paused and excluded from this Pages deliverable**. Do not silently enable experimental full-profile features or PR #99's future-only proposals.

## Current Pages engineering handoff — November 14, 2026 (unmerged)

**Most recent fully CI-qualified stacked source:** [draft #145](https://github.com/djshellshoxxx/GhostPay/pull/145) at exact `c8d4c42bee724bacd244bc90b0259c961d27e84f`. [Application CI 43553330056](https://github.com/djshellshoxxx/GhostPay/actions/runs/43553330056) passed **24/24**, [Pages/Anvil 43553330007](https://github.com/djshellshoxxx/GhostPay/actions/runs/43553330007) passed **two applicable jobs** (three publish/release jobs intentionally skipped), and [beta 43553329978](https://github.com/djshellshoxxx/GhostPay/actions/runs/43553329978) and [hosting 43553329955](https://github.com/djshellshoxxx/GhostPay/actions/runs/43553329955) passed. None of this constitutes a merged or deployed release.

**Newer owner-controlled implementation, awaiting correction:** [draft #150](https://github.com/djshellshoxxx/GhostPay/pull/150), exact `36bcdb7470caf7e563b4f72cadc209504137fd6f`, adds GP-PAGES-02 verified-backup UI, GP-PAGES-04 sleep-aware elapsed idle locking, and seller-key/reconciliation IndexedDB recovery. Its [application CI 43559443897](https://github.com/djshellshoxxx/GhostPay/actions/runs/43559443897) failed a **single stale text assertion** in `apps/web/src/views/Settings.test.tsx:39` (web: 2,554 passed, 1 failed, 1 skipped). The updated `settings.lock.keysHint` properly distinguishes keys with no backup from keys with only an **unverified download**, whereas the test matches the former phrase as an uninterrupted substring. The [owner diagnostic](https://github.com/djshellshoxxx/GhostPay/pull/150#issuecomment-6873267630) recommends checking both conditions rather than removing the warning or weakening locking/backup guards. [Pages/Anvil 43559443937](https://github.com/djshellshoxxx/GhostPay/actions/runs/43559443937), [beta 43559443884](https://github.com/djshellshoxxx/GhostPay/actions/runs/43559443884) and [hosting 43559443850](https://github.com/djshellshoxxx/GhostPay/actions/runs/43559443850) passed separately; **the owner candidate is still not fully qualified**. All application/test corrections belong on its independently owned branch. Re-run the whole application and Pages/Anvil/beta/hosting matrices against its **new exact SHA** after the owner correction. No test execution was performed for this documentation change.

Relevant source-to-test entry points: `apps/web/src/views/Settings.test.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/lib/session.test.ts`, `apps/web/src/lib/keyVault.idb.test.ts`, `apps/web/src/lib/reconciliationVault.idb.test.ts`, `apps/web/e2e/backup-panel.spec.ts`, and `apps/web/e2e/pages-devnet.spec.ts`. The source owner reports local targeted tests, but the exact-head application failure remains authoritative. See [Verification and Release Gates](Verification-and-Release-Gates.md) for requirement-to-test traceability; no SonarCloud A, ADR-0029 approval, dedicated origin, release-signed manifest, external wallet/testnet evidence, independent audit or publication authorization has been supplied.

## Prerequisites and local setup

Use Git, Node.js 22+, npm and a modern browser. Run from the checked-out candidate source at a recorded SHA:

```sh
npm ci --ignore-scripts
npm run build:libs
node --test scripts/pages/verify-pages-site.test.mjs
node --test scripts/pages/serve-pages.test.mjs
npm run typecheck
npm run lint
npm run ci:scan-secrets
npm run ci:check-actions
```

Build only into a **new absolute output directory**; release mode requires a clean tree, exact `GP_COMMIT` and no inherited experimental `VITE_*` switches. Use `GHOSTPAY_PAGES_DEV=1` exclusively for local/test builds, never publishing. The script expects built workspace libraries. Follow the authoritative [Pages build and serving instructions](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/pages/README.md):

```sh
bash scripts/pages/build-pages.sh /absolute/path/to/new-output
```

This command is documentation, **not a claim it was executed for this wiki update**. The Pages workflow executes the prescribed test build, independent verifier, local Anvil/Chromium browser acceptance and deployment gating. For preserve-only CLI tools, see [CLI README](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/packages/cli/README.md); CLI builds/changes are out of the current scope.

## Module map, APIs and trust boundaries

| Path | Role in Pages scope |
| --- | --- |
| `apps/web/src/AppLean.tsx`, `apps/web/src/views/` | Lean browser entry; invoice, wallet, pay, scan, receipt, native sweep, keys and UI |
| `apps/web/src/lib/keystore.ts`, `keyVault.ts`, `session.ts`, `appLock.ts` | Local secrets, encrypted vault, session lifetime and locking |
| `packages/core-crypto`, `packages/invoice-schema`, `packages/secret-box` | Shared cryptography, signed invoice contracts and secret lifecycle |
| `packages/chain-adapters`, `apps/web/src/lib/scanClient.ts` | EVM allowlists, deployment trust, RPC reads, scanning boundaries |
| `packages/qr-exchange`, `apps/web/src/lib/qr.ts` | QR exchange codecs and bounds |
| `scripts/pages/build-pages.sh`, `verify-pages-site.mjs`, `serve-pages.mjs`, `smoke.mjs` | Static artifact build/verification, local serving and post-publication smoke tooling |
| `apps/web/e2e/pages-devnet.spec.ts`, `apps/web/playwright.pages-devnet.config.ts` | Chromium local-chain test journey and sub-path/network containment |
| `.github/workflows/pages.yml`, `docs/pages/` | Checks, gated publication path, release evidence and limitations |
| `apps/relayer`, `packages/cli`, non-EVM and full-profile packages | Preserved but **not active Pages work**, not included as served functions |

Read types and tests before altering any public interface. Browser wallet approval, authenticated invoice documents, RPC response authenticity, finality, release-signing keys and operator deployment policy are distinct trust boundaries. Never conflate a seller-signed receipt with settled chain payment, or a displayed SHA-256 with authenticated release provenance. Do not alter cryptographic protocol or financial policy without approved ADR/spec changes and independent review.

## Lean-profile containment and build verification

The static Pages scope is constrained in two separate places: `AppLean.tsx` passes `profile="lean"` to `AppShell`, and `apps/web/src/lib/buildProfile.ts` resolves the effective profile as **lean whenever the compiled build, shell or explicit component prop is lean**. A full-profile prop cannot widen a lean context. The compiled `__GHOSTPAY_PROFILE__` define is supplied by `apps/web/vite.config.ts`. The Pages build script (`scripts/pages/build-pages.sh`) uses a sanitized environment and forces `GHOSTPAY_LOCAL_BUILD_PROFILE=lean`; it does not inherit arbitrary `VITE_*` toggles. The build-time guard in `apps/web/scripts/localBuildProfile.mjs` rejects rendered modules from specified deferred/full-profile features and missing module metadata.

**Source-to-test reference:** `apps/web/src/lib/buildProfile.test.ts` covers the narrow-only precedence matrix and malformed/missing injected defines. The Pages verifier and local-chain browser tests exercise additional artifact boundaries; a unit test for profile selection is not proof that an arbitrary built artifact contains no excluded code. For every candidate, inspect the generated lean module report and applicable `Pages` workflow on its **exact head**, in addition to the general application CI. No independent release-origin, manifest-signature or external-wallet qualification is implied by the profile tests. This paragraph documents existing source behavior, not a new feature, a tested deployment or approval to activate full-profile modules.

## Contribution, coding/security rules, CI and debugging

Inspect [SECURITY.md](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/SECURITY.md), the [threat model](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/threat-model/THREAT_MODEL.md), current PR ownership, source-pinned handoffs, [ADRs](https://github.com/djshellshoxxx/GhostPay/tree/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/adr) and [specifications](https://github.com/djshellshoxxx/GhostPay/tree/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/specs). Contribute a narrow test-first correction on a new isolated branch/draft PR. Pin base/head SHAs, tests actually executed, pending checks and the relevant release gate; never edit another agent's active branch.

For the original exact PR #137 head, [application CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/43316935399) passed 24 jobs, and [Pages](https://github.com/djshellshoxxx/GhostPay/actions/runs/43316935362) and [beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/43316935402) passed. The **separately staged, unmerged** [#143](https://github.com/djshellshoxxx/GhostPay/pull/143) includes independent verifier, local RPC-test proxy and smoke corrections; the stacked [#144](https://github.com/djshellshoxxx/GhostPay/pull/144) adds the rejected-manifest-disclosure regression. Its exact head `907e2919e93091fd2e9c2abaecbeb95e331f4b7d` passed [application CI 43521433454](https://github.com/djshellshoxxx/GhostPay/actions/runs/43521433454) **24/24**, [Pages 43521433467](https://github.com/djshellshoxxx/GhostPay/actions/runs/43521433467) **2/2 applicable** (three release/deploy/live-smoke jobs skipped), [beta 43521433573](https://github.com/djshellshoxxx/GhostPay/actions/runs/43521433573) **1/1**, and [hosting 43521433473](https://github.com/djshellshoxxx/GhostPay/actions/runs/43521433473) **2/2**. A further stacked [#145](https://github.com/djshellshoxxx/GhostPay/pull/145) has verified a **RED baseline** at test-only `97471cc2f3ec24af705c5227a256a7f20a045952`: [CI 43529358226](https://github.com/djshellshoxxx/GhostPay/actions/runs/43529358226) failed exactly two IndexedDB retry regressions (`open()` called once rather than twice; 2,536 other web tests passed). It now includes a minimal production retry/stale-open correction at `06743ad8187d72849b35f3074818e771245e1a3f`, with **full exact-head CI now passed** (application 24/24, Pages 2 applicable passed with 3 intentional release skips, beta 1/1 and hosting 2/2; see linked evidence below), not a deployed release. This touches browser reconciliation storage only, not owner-controlled backup/idle-lock work. CLI/hosting checks do not authorize resumed non-Pages work, and none of these checks substitutes for SonarCloud Security Rating A. Reproduce Pages failures with `node --test scripts/pages/verify-pages-site.test.mjs`, `node --test scripts/pages/serve-pages.test.mjs` and the documented [Pages browser-test script](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/scripts/beta/browser-devnet.sh) in an approved local test environment. Avoid leaking keys, wallet data or unpatched vulnerabilities into logs/issues.

## Release gates and outstanding engineering work

Outstanding: exact-head security qualification/SonarCloud Security Rating A, explicit ADR-0029 decision, GP-PAGES-02 backup-verification and GP-PAGES-04 idle-lock fix review, an appropriate dedicated hosting origin, release-signed testnet deployment manifests, external testnet acceptance, independent security review and explicit authorization before any merge/deployment/publication/real-funds use. The release artifact needs verified SHA256SUMS, module report, manifest digest, provenance and offline re-verification; the in-page hash is informative but self-attested. The [#138 verifier correction](https://github.com/djshellshoxxx/GhostPay/pull/138) is absent from owner #137, but included and exact-head tested on isolated #143/#144; owner review and final integration remain outstanding. The #145 browser-storage correction remains **draft, unmerged and undeployed**; its failing RED baseline and corrected-head [application 43535807550](https://github.com/djshellshoxxx/GhostPay/actions/runs/43535807550) (24/24), [Pages 43535807594](https://github.com/djshellshoxxx/GhostPay/actions/runs/43535807594) (2 applicable passed / 3 release skips), [beta 43535807551](https://github.com/djshellshoxxx/GhostPay/actions/runs/43535807551) and [hosting 43535807558](https://github.com/djshellshoxxx/GhostPay/actions/runs/43535807558) are now verified. Consult the [Pages release matrix](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/pages/RELEASE_MATRIX.md), [ADR-0029](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/adr/ADR-0029-github-pages-static-beta.md) and [verification gates](Verification-and-Release-Gates.md). No development of non-Pages versions is authorized.

This is version-controlled **wiki source**. The live GitHub Wiki has **not** been published or verified.
