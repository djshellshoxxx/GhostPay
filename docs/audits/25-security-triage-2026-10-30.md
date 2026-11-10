# Security triage and relayer secret-file fix — 2026-10-30

Scope: a focused AI-assisted review of scanner visibility, the committed dependency graph, and relayer input, webhook, and secret-loading boundaries. This is not a complete contract or application audit. Base: `1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78` (PR #39, stacked on PR #37). `main` still lacks those integration changes.

## Connected scanner evidence

GitHub checks were queried directly on `main` and the PR #39 head.

| Tool | Observed result | Implication |
| --- | --- | --- |
| SonarQube Cloud on main | Neutral; “Quality Gate not computed”; zero inline annotations | No actionable issue detail returned by this check. Dashboard: https://sonarcloud.io/dashboard?id=djshellshoxxx_GhostPay&branch=main |
| CodeRabbit on PR #39 | Skipped | Its bot comment explicitly says draft PRs are not automatically reviewed by default. |
| GitHub CI on PR #39 | 21 successful Actions checks | Includes contract static analysis and integration checks; does not establish absence of vulnerabilities. |
| GitHub security-alert API | Not exposed by the available connector | Code-scanning, secret-scanning and Dependabot alert inventories were not retrieved. |

Other third-party dashboard inventories and account installation settings were not inspected. Scanner integrations are visible only where they publish accessible checks or comments.

## Fixed: secret-file metadata/read race (Low, local preconditions)

`apps/relayer/src/secrets.ts` previously used `lstatSync(path)`, `statSync(path)`, then `readFileSync(path)`. A process able to replace entries in the containing directory could swap in a different file after metadata checks. The loader would consume replacement bytes even if the replacement had a mode that the loader ordinarily rejects. A growing file could also bypass the size check and cause an unbounded read.

Two deterministic regression tests run a filesystem mutation immediately after metadata inspection. On the parent code:

- Replacing a checked 0600 file with a 0644 file caused the unchecked replacement key to be loaded.
- Growing the checked file past 4096 bytes with trailing whitespace was accepted.

The fix opens once, checks with `fstatSync`, and reads at most 4097 bytes from that descriptor. POSIX opens use `O_NOFOLLOW` to reject leaf symlinks and `O_NONBLOCK` to avoid blocking on a substituted FIFO. The descriptor closes in `finally`; errors retain only the configured variable name.

Limits: this binds validation to the opened file, not to a permanently trusted directory hierarchy. It does not prevent a principal that can already write the opened inode from changing its contents in place. Windows retains the existing weaker mode/ownership/symlink policy and was not exercised here. Secret directories must remain under trusted control.

Node filesystem API reference: https://nodejs.org/api/fs.html

## Dependency findings remaining

Fresh native npm audits against the unchanged committed lockfile:

| Scope | Critical | High | Moderate | Low | Total affected package entries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production (`npm audit --omit=dev --json`) | 0 | 0 | 0 | 0 | 0 |
| All dependencies (`npm audit --json`) | 0 | 10 | 2 | 14 | 26 |

These are affected package entries, including transitive propagation, not 26 independent exploits. A zero production result covers known registry advisories only.

High entries: `@fastify/busboy`, `@fhevm/hardhat-plugin`, `@nomicfoundation/hardhat-chai-matchers`, `@nomicfoundation/hardhat-ethers`, `@nomicfoundation/hardhat-network-helpers`, `adm-zip`, `hardhat`, `serialize-javascript`, `tmp`, `undici`.

The experimental `@ghostpay/confidential-contracts` workspace pins Hardhat 2.29.1, whose dependency graph includes `adm-zip@0.4.16` and `undici@5.29.0` → `@fastify/busboy@2.1.1`. The separate web-test `undici@8.12.3` is not the affected copy. Do not infer a browser-runtime vulnerability from these findings, or treat development tools as harmless.

Remediation remains open: review Hardhat/fhEVM plugin compatibility and migrate or replace affected tooling in a separate tested change. npm proposes major framework/plugin changes for several entries and reports no direct fix for `@fhevm/hardhat-plugin`. No forced audit fix, blanket transitive override, lockfile churn, or lowered audit gate was applied. Recheck by 2026-11-06, and before compiling untrusted contract projects or enabling the experimental workspace in a release.

## Validation

- New regression tests on the base: two failures, one symlink control passed.
- Fixed relayer suite with its unchanged coverage thresholds: **288 passed, 2 skipped**; 9 test files passed and the Anvil test file skipped. Coverage: statements 97.57%, branches 92.43%, functions 97.02%, lines 98.54%.
- Relayer TypeScript and ESLint: passed.
- Additional OS smoke check as root: 0600 file accepted; 0644 file and FIFO rejected without blocking. An attempted unprivileged run was blocked by the container (`runuser: cannot set groups`), so the OS-level unreadable-file behavior was not independently exercised here.
- Existing committed-secret scan and `git diff --check`: passed.

The full web suite, live-chain tests, all contract analyzers, Windows behavior and third-party scanner dashboards were not run locally for this change. Previously successful CI checks belong to the base; new-head CI must be assessed separately.
