# GhostPay Wiki

GhostPay is an **experimental, pre-audit** application for client-side signed invoices and stealth-address payments. Source, tests and an operator CLI exist. **There is no production release or qualified public-funds deployment.**

## Navigate
- **[User Guide](User-Guide.md)** — capabilities, status, getting started, common workflows, troubleshooting, FAQs, privacy limitations.
- **[Developer Guide](Developer-Guide.md)** — architecture, prerequisites, local setup, build/test/CLI commands, APIs, contributions, security, CI, debugging and releases.
- [Architecture and Design Rationale](Architecture-and-Design-Rationale.md)
- [Codebase Map](Codebase-Map.md)

## Current status — static GitHub Pages client only (November 12, 2026)

The only active beta-development target is the **static, client-side EVM testnet Pages build** in unmerged [draft PR #137](https://github.com/djshellshoxxx/GhostPay/pull/137) at `ac08062ec540d429a0bfb24f3aab042be5d212eb`. The source branch is stacked on combined beta [#135](https://github.com/djshellshoxxx/GhostPay/pull/135) `f88aaf2fe27a7656d15fed50670d841879da92ad`; `main` remains `bd2652bf1853948594522140a6a0fe0cbe54e32b`. The Pages head's five GitHub Actions workflows passed, including [CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/43316935399), [Pages artifact/browser acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/43316935362) and [beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/43316935402). Those results apply only to that exact commit, and are **not deployment or release approval**.

No live Pages release is authorized. Without an independently approved, signed testnet deployment manifest, the static build is a **payments-disabled demonstration**. With approved manifests, only supported EVM testnets would be in scope; no mainnet, real funds or production approval. Key/backup, idle-lock, privacy, independent security review, SonarCloud Security Rating A, signed manifests, appropriate dedicated origin and external testnet gates remain subject to review. See the [Pages release matrix](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/pages/RELEASE_MATRIX.md) and [Pages guide](https://github.com/djshellshoxxx/GhostPay/blob/ac08062ec540d429a0bfb24f3aab042be5d212eb/docs/pages/README.md).

Non-Pages implementations (server, relayer, CLI, native apps and non-EVM or full-profile features) remain in repository history but **their development is paused**. Existing docs describe them for maintenance, not as active Pages features. PR #99's 18 ideas remain **future-only**, not activated. Follow [User Guide](User-Guide.md) for supported workflows and limitations or [Developer Guide](Developer-Guide.md) for architecture, commands, CI and release gates.

These version-controlled files are wiki **source**, not proof that the live GitHub Wiki is enabled or published.
