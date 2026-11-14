# GhostPay Wiki

GhostPay is an **experimental, pre-audit** browser application for signed invoices and stealth-address payments. **No production deployment, release or real-funds use is authorized.** Active development is restricted to a static EVM **testnet** client intended for GitHub Pages; server, relayer, CLI, native, non-EVM and full-profile development remains paused.

## Start here

- **[User Guide](User-Guide.md)** — current capabilities, safe access, workflows, backups, privacy limitations, troubleshooting and FAQ.
- **[Developer Guide](Developer-Guide.md)** — architecture, prerequisites, setup, build/test commands, APIs, contribution workflow, CI, trust boundaries and release steps.
- [Verification and Release Gates](Verification-and-Release-Gates.md) — exact commit/CI evidence, historical qualifications, requirement-to-test traceability and outstanding approvals.
- [Codebase Map](Codebase-Map.md) and [Architecture and Design Rationale](Architecture-and-Design-Rationale.md) — module orientation and design records.

## Current Pages-only development status — November 14, 2026

| Unmerged draft | Exact source and proposed feature scope | Verified qualification |
| --- | --- | --- |
| [#145](https://github.com/djshellshoxxx/GhostPay/pull/145) | `c8d4c42bee724bacd244bc90b0259c961d27e84f`; last **fully CI-qualified staged** Pages candidate, including browser reconciliation IndexedDB recovery | [Application CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/43553330056) **24/24 passed**; [Pages/Anvil](https://github.com/djshellshoxxx/GhostPay/actions/runs/43553330007) 2 applicable passed, 3 release/deploy/live-smoke skipped; [beta](https://github.com/djshellshoxxx/GhostPay/actions/runs/43553329978) and [hosting](https://github.com/djshellshoxxx/GhostPay/actions/runs/43553329955) passed |
| [#150](https://github.com/djshellshoxxx/GhostPay/pull/150) | `36bcdb7470caf7e563b4f72cadc209504137fd6f`; **owner-controlled newer draft** with GP-PAGES-02 backup verification, GP-PAGES-04 sleep-aware idle lock and further IndexedDB resilience | [Application CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/43559443897) **failed** one outdated `Settings.test.tsx:39` warning-text assertion (2,554 other web tests passed, 1 skipped); [Pages](https://github.com/djshellshoxxx/GhostPay/actions/runs/43559443937), [beta](https://github.com/djshellshoxxx/GhostPay/actions/runs/43559443884) and [hosting](https://github.com/djshellshoxxx/GhostPay/actions/runs/43559443850) passed independently but cannot override the failed application gate |
| [#154](https://github.com/djshellshoxxx/GhostPay/pull/154) | `9bdc9cbade90995e3207b72535a7818f909c2684`; isolated signed-fiat minor-unit display fix stacked on #145; **not integrated with #150** | Test-first [RED 43581988733](https://github.com/djshellshoxxx/GhostPay/actions/runs/43581988733) → [GREEN application CI 43586195861](https://github.com/djshellshoxxx/GhostPay/actions/runs/43586195861) **24/24 passed**; [Pages](https://github.com/djshellshoxxx/GhostPay/actions/runs/43586195847), [beta](https://github.com/djshellshoxxx/GhostPay/actions/runs/43586195793) and [hosting](https://github.com/djshellshoxxx/GhostPay/actions/runs/43586195819) passed; standalone unmerged draft only |

The original owner Pages baseline is [#137](https://github.com/djshellshoxxx/GhostPay/pull/137) at `ac08062ec540d429a0bfb24f3aab042be5d212eb`, and `main` is `bd2652bf1853948594522140a6a0fe0cbe54e32b`. **None of these drafts is merged or deployed.** Historical source/test details and RED→GREEN evidence remain in [Verification and Release Gates](Verification-and-Release-Gates.md), rather than being duplicated on the Wiki Home page.

## Security and privacy boundaries

Local browser key handling does not hide on-chain amounts, transfer histories, timing or wallet relationships. A seller-signed receipt alone does not establish payment settlement. Downloading an encrypted backup does **not** establish recoverability; the proposed verification safeguards in #150 still require a corrected owner head and review.

Without an approved, signed EVM **testnet** manifest, the Pages artifact is a **payments-disabled demonstration**. Promotion also requires SonarCloud Security Rating A, ADR-0029 approval, a dedicated hosting-origin decision, owner-approved signing keys/manifests, external-wallet/testnet acceptance, independent security/provenance review and explicit merge, deployment, Wiki publication and release authorization. Passing CI does not authorize mainnet or real funds.

This Wiki is currently **version-controlled source only**. Its live GitHub Wiki is disabled or unpublished; no live publication is claimed.
