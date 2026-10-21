# Reuse research: secure-ci

Scope: read-only research. No clone, no install, no code copied. Repo check: `packages/` and `apps/` have no CI-security module. `.github/workflows/` has `ci.yml`, `nightly.yml`, `release.yml`. No solhint, gitleaks, semgrep, aderyn, osv-scanner, or eslint-plugin-security config found in repo. `packages/contracts` is Foundry (`foundry.toml`) with no `package.json`. Root `package.json` exists.

Verification legend: "raw LICENSE" = fetched from raw.githubusercontent.com and read. "page" = GitHub repo page via WebFetch. "UNVERIFIED" = not confirmed from a primary source.

Access note: GitHub API (`api.github.com`) returned 403 to WebFetch. `gh api` returned 403 (repos not attached to session). Full 40-char SHAs are UNVERIFIED. Short SHAs come from the GitHub commits page.

## Candidates

| # | Repo | Licence (verified how) | Commit (short SHA, date) | Stars (page) | Maintained | Worth reusing | Deps |
|---|------|------------------------|--------------------------|--------------|------------|---------------|------|
| 1 | https://github.com/protofire/solhint | MIT. Raw LICENSE `https://raw.githubusercontent.com/protofire/solhint/master/LICENSE`: "MIT License / Copyright (c) 2017-2026 Protofire". Full SHA UNVERIFIED. | `1748ef3`, Oct 8 2026 (merge of PR #808, page) | 1.1k | Yes (commits Oct 2026) | `.solhint.json` rule selection (config, not code). Tool itself as devDependency. | Node/npm (npm package `solhint`) |
| 2 | https://github.com/gitleaks/gitleaks | MIT. Raw LICENSE `https://raw.githubusercontent.com/gitleaks/gitleaks/master/LICENSE`: "MIT License / Copyright (c) 2019 Zachary Rice". Full SHA UNVERIFIED. | `b58d3f1`, Jul 22 2026 (merge of dependabot PR #2197, page) | 30.2k | Yes (commits Jul 2026) | Default rule set from `config/gitleaks.toml` (MIT, copy with notice). `.gitleaks.toml` schema for allowlists. Use CLI binary, not the Action (see risks). | Go binary; no runtime deps |
| 3 | https://github.com/Cyfrin/aderyn | GPL-3.0 per repo page sidebar ("GPL-3.0 license"). LICENSE file fetch returned 404 at `main` and `master`. UNVERIFIED at file level. | UNVERIFIED (commit page 404) | 799 | Unknown; last-commit date not shown | Nothing copyable. Detector ideas only, as reference. | Rust (`cargo install aderyn`) |
| 4 | https://github.com/google/osv-scanner | Apache-2.0 per repo page ("Apache-2.0 license"). LICENSE file not fetched. UNVERIFIED at file level. | UNVERIFIED (not shown on page) | 11.2k | Unknown; 2,085 commits, date not shown | Use binary or official GitHub Action for lockfile/OSV scanning. Not copied. | Go binary |
| x | https://github.com/semgrep/semgrep-rules | "Semgrep Rules License v1.0" (raw LICENSE `https://raw.githubusercontent.com/semgrep/semgrep-rules/develop/LICENSE`). Not a permissive licence. | not checked | not checked | not checked | Reference only. Do not copy rules into repo. | Semgrep CLI |

Not researched this run (out of 2-4 limit or time): eslint-plugin-security, lockfile-lint (ISC per common knowledge, UNVERIFIED here).

## Recommendation

Overall decision: **adapt**. Use tools as pinned dependencies (depend) and copy only MIT config (adapt). Do not copy code from aderyn or semgrep-rules.

Per candidate:
- solhint: **depend** (devDependency) + **adapt** `.solhint.json` rules. Pin exact version. Verify version and SHA on npm before pinning.
- gitleaks: **adapt** default TOML rules into `/home/user/GhostPay/.gitleaks.toml` with MIT notice retained in a header comment. **depend** on CLI binary pinned by version and checksum. Do not use `gitleaks/gitleaks-action` (see risks).
- aderyn: **reference-only** (GPL-3.0).
- osv-scanner: **depend** (binary, pinned). Apache-2.0 allows use.
- semgrep-rules: **reference-only** (Semgrep Rules License v1.0). Write in-house Semgrep rules instead.

## Integration plan (GhostPay)

Target paths (new files only; do not edit existing workflows in this step):
- `/home/user/GhostPay/.gitleaks.toml`: adapted MIT rules + allowlist for fixtures and `docs/`.
- `/home/user/GhostPay/.solhint.json`: rule set. Scope to `packages/contracts/src` and `packages/pool-contracts/src`. Solhint reads files passed by path; root-level config applies.
- `/home/user/GhostPay/.github/workflows/security.yml`: new job, runs on PR. Steps: gitleaks CLI scan (`--no-git` for working tree on PR, or git mode), solhint over Solidity sources, osv-scanner over `pnpm-lock.yaml` or equivalent lockfile at root.
- Root `package.json` scripts: `security:solhint` and `security:secrets` (wrap the commands above) for local use.

API shape (CLI, no custom code):
- `gitleaks detect --config .gitleaks.toml --redact --exit-code 1`
- `npx solhint -c .solhint.json 'packages/contracts/src/**/*.sol'`
- `osv-scanner --lockfile <lockfile>`

Tests:
- Fixture under `packages/contracts/test/security-fixtures/` with a deliberately bad Solidity file. Solhint must exit non-zero on it. Run in CI as a self-test.
- Fixture file with a fake AWS-style key pattern under `tests/fixtures/secrets/`. Gitleaks must flag it. Allowlist only that path, and only in a dedicated test step.
- Confirm gitleaks rule IDs in the adapted TOML match the upstream file version at the pinned SHA before committing.

Next steps before any copy: fetch upstream `config/gitleaks.toml` raw at the pinned tag (raw.githubusercontent.com), record its SHA, and copy only the rules needed.

## Risks

- Supply chain: all CLIs (solhint npm, gitleaks, osv-scanner) must be pinned by version and checksum. npm transitive deps add surface; use lockfile and `npm audit` or osv-scanner on it.
- Licence trap, gitleaks: the core CLI is MIT (verified). The `gitleaks/gitleaks-action` GitHub Action is reported by third-party listings as commercial/key-required from v2.0.0 (UNVERIFIED, from search snippets, not from the Action's own LICENSE). Avoid the Action; use the CLI.
- Licence trap, aderyn: GPL-3.0 (page). Copying any code or detector logic into a non-GPL repo would be a licence violation. Reference only.
- Licence trap, semgrep-rules: Semgrep Rules License v1.0 restricts use; not permissive. Do not vendor rules.
- Abandonment: solhint and gitleaks show commits in 2026. Aderyn and osv-scanner last-commit dates were not confirmed. Re-check before adoption.
- False confidence: solhint and aderyn are static analyzers, not audits. Keep the manual review and audit process in `docs/audits/`.
- Foundry: `packages/contracts` has no `package.json`. Solhint must be installed at root. Confirm root tooling does not conflict with pnpm workspace.
