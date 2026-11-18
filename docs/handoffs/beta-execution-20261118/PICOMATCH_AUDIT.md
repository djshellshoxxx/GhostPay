# Picomatch audit remediation assessment — 2026-11-18

## Outcome

**Blocked by the absence of a published patched version. No dependency or gate change was made.**

- Repository: `djshellshoxxx/GhostPay`.
- Base main: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
- Branch: `chatgpt/ghostpay-picomatch-audit-20261118`.
- Worker: ChatGPT security review, Caveman investigate-first and surgical-patch workflow.
- Independent reviewer: privacy worker; separately confirmed advisory, registry, locked paths and audit results.
- Intended scope: a narrow transitive patch, with a root override only if necessary and compatible. Preserve the
  production dependency graph, existing Hardhat/viem choices, and all security gates.
- Actual changed paths: this handoff and the task claim in `docs/ai/ACTIVE_WORK.md` only. The coordinator can
  incorporate the evidence into the central completion report without opening a separate documentation PR.

## Primary evidence

[GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), reviewed and updated
2026-11-17, identifies a high-severity regular-expression denial of service in single-branch repeated extglobs.
Its affected range is `<=4.0.7`, and its patched-version field is **None**.

The [upstream release list](https://github.com/micromatch/picomatch/releases) identifies **4.0.7** as latest.
A fresh registry query, `npm view picomatch version dist-tags versions --json`, also returned version/latest
**4.0.7**, with the complete published version list ending at 4.0.7. The independently queried registry gave the
same result. Earlier security releases 4.0.4, 3.0.2 and 2.3.2 addressed other advisories; they are within this
advisory's affected range and do not provide a fix for it.

Main already locks picomatch **4.0.7**. There is therefore no authenticated published version available for the
requested narrow upgrade. No speculative version, git dependency, fork, vendored patch or audit suppression was
introduced. npm's `fixAvailable` suggestion is a dependency-graph migration, not proof of a patched picomatch
release: it proposes older tool versions, including typescript-eslint 8.47.0, Vite 6.2.7, Vitest/coverage-v8 3.1.4,
and plugin-react 5.2.0. Those changes are outside this repair and require separate compatibility review.

## Installed and locked dependency paths

`npm explain picomatch --json` against the installed coordinator worktree returned exactly one installed
picomatch instance: `node_modules/picomatch`, version 4.0.7, `dev: true`. Its direct dependents are:

| Package | Installed version | Requirement on picomatch |
|---|---|---|
| fdir | 6.5.0 | Optional peer `^3 \|\| ^4` |
| tinyglobby | 0.2.17 | `^4.0.4` |
| vite | 8.3.5 | `^4.0.7` |
| vitest | 5.0.5 | `^4.0.7` |

All four dependent package entries and picomatch are `dev: true` in the base lockfile. A dependent's own
`dependencies` edge can be labelled `prod` by `npm explain`; that does not make this package part of GhostPay's
root production dependency graph. The separate production-only audit below confirms that scope distinction.

The 14 high-severity audit entries are picomatch and its affected dependency ancestors: fdir, tinyglobby,
hardhat, vite, vitest, @vitejs/plugin-react, @vitest/coverage-v8, typescript-eslint, and the five
@typescript-eslint packages eslint-plugin/parser/type-utils/typescript-estree/utils. They are not 14 distinct
new vulnerabilities. The other 16 entries are low severity and belong to separate advisory/dependency chains.

## Executed acceptance checks

The task worktree contains the exact main lockfile and no installed dependency tree. npm audit evaluated that
lock directly. Commands were run without `npm audit fix`, package installation, lifecycle scripts or overrides.

| Command | Actual outcome |
|---|---|
| `npm view picomatch version dist-tags versions --json` | Exit 0; latest and greatest published version 4.0.7. |
| `npm audit --audit-level=high --json` | Exit 1; 30 entries: 14 high, 16 low, 0 critical. |
| `npm audit --omit=dev --audit-level=high --json` | Exit 0; zero advisories in production scope. |
| `npm explain picomatch --json` in the coordinator worktree | Exit 0; installed 4.0.7 and the four paths listed above. |
| `git diff --check` | Exit 0. |

The new audit results match the coordinator's initial before-state: 30 entries including 14 high with dev
dependencies, zero in production scope. There is no after-patch green result to claim because no compatible patch
exists and no dependency was changed. The independent privacy reviewer also reran both scopes with the same
counts and exit statuses on an unchanged lock.

The unchanged lockfile blob is `8ce2a5bb315cd84f45d3351131de0914337224ae`; package manifests and production graph
are preserved byte-for-byte against the base. No behavior changed, so dependency-tooling tests, build, lint and
application test suites were not rerun for these documentation-only changes. No exploit reproduction was needed
to establish the published-version blocker, and no claim of application-level exploitability or immunity is made.

Raw local evidence retained for the coordinator:

- `picomatch-audit-all-verified.json`: full audit result from the isolated task worktree.
- `picomatch-audit-prod-verified.json`: production-only audit result from the same worktree.
- `picomatch-installed-paths.json`: installed dependency explanation.
- The original baseline remains in `npm-audit-all-main.json`.

## Integration and next action

Keep the dev-inclusive high-severity audit failure visible. The zero-advisory production result does not waive
the development-tooling finding or the independent Mythril release gate. Nothing was published, pushed, merged,
deployed or released by this worker.

Reopen the narrow remediation task when the advisory and registry identify an authentic compatible patched
release. Then update only the relevant resolution, verify package provenance and the lockfile diff, confirm the
production graph is unchanged, and require a passing dev-inclusive high-severity audit plus the affected tool
checks. A custom fork or broad toolchain downgrade would be a separately scoped design and validation task.
