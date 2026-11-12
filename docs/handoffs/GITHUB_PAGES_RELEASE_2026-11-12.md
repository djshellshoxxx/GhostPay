# GitHub Pages release handoff — 2026-11-12

## Priority and freeze

The owner's GitHub Pages release directive (2026-11-12, P0) supersedes earlier priorities. The only release target is one static, client-side GhostPay EVM testnet beta served from GitHub Pages: no GhostPay backend, relayer, database or scheduled job.

Until that release is done, do not start or continue work on: the relayer service and gas sponsorship, ERC-4337, policy accounts and scheme 2 (keep it disabled; do not change its ABI; AUD24-01 stays open), Bitcoin Silent Payments, Solana, TRON, additional networks, merchant billing and server-side invoicing, databases, server-side jobs or notifications, federation, analytics, other hosting architectures, desktop or mobile apps, and new feature specifications. Nothing is deleted: branches, commits and code stay.

Automated agents (`.github/workflows/ghostpay-codex-cloud.yml`, `ghostpay-parallel-review.yml`): pick only tasks from the "Remaining work" list below.

## Source

- Release branch: `claude/ghostpay-github-pages-up6cj6` (the session's assigned branch; it plays the role the directive calls `release/github-pages-beta`).
- Baseline: PR #136 at `c11f905` (PR #135 at `d725469` plus one document), then PR #135's `1b24e90` and `f88aaf2` merged.
- Ancestry checked on this branch with `git merge-base --is-ancestor` against every open pull request head on 2026-11-12: all are contained except #101 (documentation-only continuation spec, not needed) and the original heads of #122 to #127, whose changes reached #135 as the ports #129 to #134 (contained).

## Release documents

- User and developer guide: [`docs/pages/README.md`](../pages/README.md)
- Implementation matrix and security findings: [`docs/pages/RELEASE_MATRIX.md`](../pages/RELEASE_MATRIX.md)
- Hosting decision for the owner: [ADR-0029](../adr/ADR-0029-github-pages-static-beta.md) (Proposed; ADR-0015 governs until it is accepted)

## Remaining work

A self-contained prompt for the next session is in [GITHUB_PAGES_CONTINUATION_PROMPT.md](GITHUB_PAGES_CONTINUATION_PROMPT.md).


Owner actions:
1. Accept or reject ADR-0029.
2. Serving origin: a custom domain for the Pages site, or a dedicated account or organization with no other Pages sites. The account's `github.io` origin is shared with its other Pages sites (GP-PAGES-01). Set the repository variable `GHOSTPAY_PAGES_ORIGIN`.
3. Settings > Pages source "GitHub Actions"; `github-pages` environment limited to `main`; merge; dispatch `.github/workflows/pages.yml` with `deploy: true`. This gives `DEMO_DEPLOYED`.
4. For `TESTNET_BETA_QUALIFIED`: an authorized testnet contract deployment, a release-signed manifest in `apps/web/deployments/`, `GHOSTPAY_RELEASE_PUBKEYS`, and the external testnet run described in `docs/pages/README.md`.
5. SonarCloud "security rating D": the issue list was not reachable from the build sandbox. Export it (SonarCloud > Issues, type Vulnerability and Security Hotspot, new code) and attach it to the release pull request so each item can be dispositioned.
6. Independent security review of the exact release commit.

Engineering:
- Any open item listed under "Security findings" in the release matrix.
