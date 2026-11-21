# GhostPay PR #350 independent local qualification

Exact head: `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8`. Tree: `c329fbd1bc08285da2278eac2a10d6b101e8a622`.

**Actual focused repository result: 4/4 tests passed in `scanMatches.test.ts`, one test file, zero skips.** This includes both new regressions and the existing placement/warning tests. Independent static review found no blocking issue in the bounded production change.

The web workspace and its dependency closure were installed from the unchanged lockfile. Seventeen distinct workspace libraries built from this exact source. No other checkout's installed dependencies or compiled artifacts were reused. Local Node 24.22.3 differs from CI Node 22.

The initial whole-monorepo install, full web TypeScript/build phase, combined Scan component test attempt, and scoped ESLint attempt were killed with exit 137. No failing source assertion or compiler/lint diagnostic was reported by those terminated commands. They are **not passes**. The exact cause of SIGKILL was not established. The smaller selected-workspace install and helper-only test run succeeded.

Tracked source, tests, configuration, coverage thresholds, timeouts and lockfile are unchanged. The focused invocation uses the original Vitest configuration without requesting coverage; it does not replace the full repository coverage or browser gates. No remote state was changed and no live RPC/funds operation occurred.

`qualification.json` records exact commands, exit codes, source/dependency identity and log hashes. `built-library-artifacts.json` records source-built library artifact hashes. Keep the existing draft/ownership/CI/merge limits.
