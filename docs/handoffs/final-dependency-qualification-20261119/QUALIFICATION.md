# Dependency-tree qualification of the final Pages candidate

## Result

The installed dependency tree satisfies the repository's existing declarations and security overrides when evaluated by the previously qualified npm 10.9.8. Both the production-only and full dependency-tree checks pass. npm 11.9.0 reports invalid override edges in the same unchanged tree. No package version, lockfile, override, installed dependency or validation rule was changed to obtain the passing results.

Source: `acdebc5a281d41bf0250e93bf217c04624fdd9d9`. Environment: Node 24.22.3. The coordinator had completed a fresh npm 11 installation before this read-only diagnosis; these checks do not relabel the earlier cached component tests as clean-install runs.

## Observed failure and exact cause

npm 11.9.0's `npm ls --all --omit=dev` reports `ELSPROBLEMS` for installed viem 2.57.19, underscore 1.13.8 and ws 8.21.0. All three installed versions exactly match existing root overrides. The reported expectations come from upstream dependency manifests before those overrides are applied:

| Consumer | Unmodified upstream declaration | Existing root override |
| --- | --- | --- |
| `@0xbow/privacy-pools-core-sdk` | viem 2.22.14 | viem 2.57.19 |
| `jsonpath` | underscore 1.13.6 | underscore 1.13.8 |
| Nested `@zk-kit/utils` ethers | ws 8.17.1 | ws 8.21.0 |
| `@solana/rpc-subscriptions-channel-websocket` | ws ^8.21.3 | ws 8.21.0 |

Read-only inspection of each package manager's own Arborist dependency model confirmed the difference. For the Privacy Pools viem edge, npm 10 retains the root override, resolves its effective requirement to 2.57.19 and reports no error. npm 11 loses the descendant override, leaves the effective requirement at upstream 2.22.14 and marks the installed 2.57.19 invalid. The same pattern affects the other existing security overrides.

Arborist 10's dependency loader inherits overrides through filesystem parents. The installed npm 11 Arborist implementation removes that fallback and uses incoming-edge propagation. In this workspace graph the descendant override sets are missing under npm 11. Workspace link targets themselves show no override set in both versions; that property alone is not evidence of a defect. The decisive evidence is the different descendant edge requirement and result for the same installed package bytes.

The comparison was repeated with `loadActual({forceActual:true})`, which bypasses the hidden lockfile shortcut and reads the actual filesystem graph. Results were unchanged: npm 11 reported 10 invalid nonoptional edges across the full graph, npm 10 reported zero. This rules out a stale hidden-lockfile shortcut as the cause. Workspace symlinks are relative and point into the correct relocated checkout.

This environment distinction was already documented in `docs/handoffs/agents/TEAM_J_DEPENDENCIES_UNIFIED.md`: npm 10.9.8 was previously qualified, while npm 11 override behavior was not. The current checks newly establish both production and full-tree success on this final candidate's clean installed tree.

## Executed verification

| Check | Actual result |
| --- | --- |
| npm 11.9.0, production dependency tree | Failed, exit 1; original failure retained. |
| npm 10.9.8, same production dependency tree | Passed, exit 0. |
| npm 10.9.8, same complete dependency tree including development dependencies | Passed, exit 0. |
| npm 11 Arborist, hidden-lockfile path and forced filesystem path | 10 invalid nonoptional edges in each full-graph observation. |
| npm 10 Arborist, hidden-lockfile path and forced filesystem path | Zero invalid nonoptional edges in each full-graph observation. |
| Manifest, lockfile, source and installed-package mutation by this worker | None. |

`RESULTS.json` pins the exact input manifest hashes, commands, return codes, tool versions and output hashes. Exact raw CLI output is retained as gzip files under `evidence/`; `gzip -dc FILE.log.gz` reconstructs the original output. The machine-readable Arborist comparison retains each invalid edge and its effective requirement.

## Reproduction and release implications

Use the exact previously qualified npm version for dependency installation and tree verification in the qualification environment. The original gate remains unchanged:

```sh
npm exec --yes --package=npm@10.9.8 -- npm ls --all --omit=dev
npm exec --yes --package=npm@10.9.8 -- npm ls --all
```

For this executor, the installed npm 10 CLI is recorded in `RESULTS.json`. The coordinator can call it directly or select its `bin` directory for this task's PATH. There is no need to edit the global npm installation or rewrite installed package metadata.

No `--force`, `--legacy-peer-deps`, omitted invalid-edge handling, weakened audit threshold or blanket override was added. The production override values and their prior security dispositions remain intact. npm 11 support is still unqualified; a future npm 11 resolution must reproduce correct override handling and pass these same gates before being claimed supported.

The independent `security_review` worker checked the unchanged root declarations, the earlier qualification handoff and the fresh Arborist evidence. It confirmed that selecting npm 10.9.8 is an environment correction rather than a dependency or gate waiver. That was an independent source/evidence review; no independent repeated CLI execution is claimed.

The coordinator remains responsible for clean-tree compilation, application tests, full coverage, browser and Pages verification, current-head hosted CI, and release decisions. This diagnosis made no deployment, tag, release, main-branch or shared integration-lock change.
