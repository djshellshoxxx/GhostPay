# Team J independent review and authority inventory — 2026-11-16

Repository: `djshellshoxxx/GhostPay`. Review branch: `codex/unified-audit`. Reviewed base:
`365a1c38770ba02826d7e039dbeef44e5a966323`. This is a scoped AI-assisted source review and local
execution record, not an independent external audit or release qualification. No product code was changed.

## Executed checks

| Source | Command/scope | Result |
|---|---|---|
| `365a1c38770ba02826d7e039dbeef44e5a966323` | `node --test scripts/tests/mythril-runner.test.mjs scripts/tests/echidna-runner.test.mjs scripts/experimental/policy-recovery/model.test.mjs` | 51 passed, zero failures/skips; analyzer wrappers are fault-injection tests, not campaigns. |
| Same | `bash scripts/check-tx-origin.sh` | Passed across 39 Solidity source files. |
| Same | `bash -n packages/contracts/scripts/run-mythril.sh packages/contracts/scripts/run-echidna.sh` | Passed. |
| Same | `cd packages/core-crypto && ../../node_modules/.bin/vitest run --maxWorkers=1` | 75 passed, nine files, zero skips; no coverage run. |
| PR #184 `73371b57040c61bdb480e724e8593313d95c6781` | Detached-worktree `vitest run src/fetcher.test.ts src/fetcher.regression.test.ts --maxWorkers=1` in ops-monitor | One matching test file, 13 passed. `fetcher.test.ts` does not exist; all 13 were in `fetcher.regression.test.ts`. |

PR #184's two product/test files were reviewed independently. Declared overflows cancel the unconsumed body;
stream overflow/read errors initiate cancellation without awaiting a hostile cancel hook and release the reader.
The existing byte cap remains authoritative for missing/malformed/understated lengths. No blocking defect was
found within this diff. This does not qualify a live HTTP mirror or all release transport behavior.

## Authority decisions and supporting components

| Scope | Current evidence | Disposition |
|---|---|---|
| Spec 15 convenience EIP-7702 delegate | Spec 15 says build only after spec 16 and audit; no `SweepDelegate` exists. Existing experimental scheme 2 is different. | Design-gated. Do not invent an authority/ABI decision. Policy-hash calldata disclosure remains an acknowledged pre-deployment privacy decision. |
| Spec 16 guardian/owner recovery | ADR-0028 is explicitly **Unaccepted candidate; executable design model only**. Owner-only, destination-priority and independent guardian quorum have different theft/availability powers. | The isolated 19-test authority model already exists and passed in this run. A new Solidity/client flow cannot honestly be completed before the selected authority model and contract specification are accepted. |
| Spec 17 milestone escrow | Separate-product design brief requiring custody/dispute authority; its prerequisites include specs 01–09. | No accepted escrow contract model. Existing reuse proposal recommends admin `Pausable`, which conflicts with the design brief's no-admin requirement. Treat it as a proposal, not approved implementation guidance. |
| ERC-4337 / sponsorship | Existing contracts and tests implement a different experimental path; no new bypass was established by this scoped inventory. | Exact-candidate contract fuzz, paymaster-window and external bundler qualification remain separate. |
| Custody | `keystore-portable.ts` uses NFKC for both KDF and strength policy; keyVault contains verified-backup and concurrent-read defenses inherited from #182. | No new custody finding established. Previous pass counts are not reissued as new evidence. |

## Implementable external-adapter gaps

Spec 12 has an actionable integration gap independent of guardian/escrow decisions:

- `apps/web/src/features/btc/BtcView.tsx` stores `scan`/`scanRef` only in component state and calls
  `scanForPayments` in `scan.ts`. Checked public headers have IndexedDB persistence, but private scan results and
  the birth-height/checkpoint state do not survive view/browser restart.
- `packages/btc-silent-payments/src/scan/state.ts` already supplies `ScanState`, `resumeScan`, `onState`, strict
  serialization, canonical rollback and locally matched spend state. Reuse this seam rather than duplicating it.
- Required acceptance: encrypted-at-rest store scoped to wallet identity and network; restore a cursor only after
  key/session/network binding checks; resume after restart; roll back orphaned observations; refuse stale async
  writes after lock/key replacement; never persist raw secrets or expose wallet-specific outpoints to the source.
- BlindBit gRPC is absent. The retained HTTP block-data API is documented deprecated; no real oracle acceptance
  is available here. A wire/protobuf integration requires current primary-source compatibility research.
- BIP-352 official vectors and header verification exist; bitcoind-backed mode A/B, real wallets and external
  source compatibility need execution evidence. Frigate-style scan-key disclosure remains a separate explicit
  trust decision; do not silently enable it to complete the checklist.

The coordinator was notified to assign encrypted scan persistence to a fresh implementation worker.

## Historical recovery snapshot and dispositions

[The immutable branch snapshot](TEAM_J_BRANCH_SNAPSHOT.md) lists all 200 fetched remote refs at the review base:
150 ancestor-contained, 14 patch-equivalent and 36 with unique right-side patches. Patch uniqueness is not a
missing-feature verdict; modified/cherry-picked equivalents can retain different patch IDs.

| Historical group | Source-pinned disposition and current evidence |
|---|---|
| PRs #184/#185/#186 | Exact heads `73371b57040c61bdb480e724e8593313d95c6781`, `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`, `27852ba898968a08f7d7c448fac8b19058189281`: active integration inputs, separately owned by the coordinator and Teams C/A. |
| `claude/gifted-planck-115x2k` and `codex/ghostpay-security-audit-20261030` | `1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78` / `63994db6cff8b3b3ca698427eee9e95904230546`: D3 relayer deadline rechecks and B2R positively identified plain-revert handling already exist, with broader current defenses. `docs/consolidation/ledger-code-branches.json` explicitly dispositions these. Do not port old files wholesale. |
| `claude/ghostpay-lean-core-milestone-t5lwox` | `2527d6b9367887508d7d8f678a18564132652a03`: current bounded payment deadlines and stronger automation gates supersede A3/A5 variants; existing ledger records that comparison. The legacy invalid `openai-agents.yml` workflow is absent (removed in `4b107609`); its prompt survives only as the disabled `.github/agent-prompts/openai-agents.steps.disabled.yml.txt` (corrected 2026-11-18 after source check). Do not resurrect the old paid-agent steps. |
| RPC/Pages transfer, bearer QR, negative fiat and idle-lock branches | `dfed84c1`, `cf5e876c`, `26f83ccd`, `9bdc9cba`, `4403d370`: source checks and prior `PAGES_INTEGRATION_2026-11-16.md` dispositions confirm broader/current equivalents. Negative formatting uses absolute bigint magnitude plus one leading sign. |
| Historical Pages consolidation | `7dc7eccc34af289050aa1606784a88dfe8a5633a`: selective copies of #172 files are superseded by the full Pages lineage merge through #177; old source copies must not overwrite newer scanner/backup/browser behavior. |
| UX-guide plain-object fix | `cf3a8b23a1994b39d2cf77b72d8c61c0a903ae4a`: current `profiles.ts` validates the prototype and own keys, matching the retained safety behavior. |
| Audit-report file mode | `fd710eb367eff8bbc250024f5a4317875930736b`: current writer preserves safe mode bits, rejects non-regular files and uses `fchmod` on the staged descriptor. Older chmod implementation is weaker and superseded. |
| `codex/recovery-spec02-unqualified-20261116` | `8d6fd6df5effc5fad93fd7afafe65f258182923c`: archived initial helper/test/tool-input material explicitly marked unqualified. Current #182 implements the corrected helper; do not apply the archived unconfirmed patch. |
| Old source-recovery/checkpoint/SBOM branches | Exact heads in snapshot. The follow-up table below dispositions the meaningful post-checkpoint commits against current source, including obsolete vendor-only SBOM behavior. No missing product implementation was found. The synthetic checkpoint is source-preservation evidence, not a newly qualified release. |
| Paid-agent automation and dependency groups | Exact heads in snapshot. Keep deferred; no paid workflow enablement or broad dependency upgrade was authorized by this scoped audit. These are not required feature recovery. |
| Audit/wiki/CI rotation branches | Snapshot pins latest heads; recent commits are historical source/CI documentation. Preserve as provenance, not as authoritative current status; the unified ledger should replace stale headline CI statements. |
| Future-only privacy proposals | `896c671f19fdb81c4aae56cd3170c09fe1aba7b7`: current tree already contains `docs/future/privacy-first/`; no product implementation is implied by these proposals. |
| `gh-pages` | `cc8d07943a11b77fbed825c1ede0c8234140ad1d`: publication output, not a source-integration branch. |

No remote branches were changed, deleted or force-pushed. No protected merge, deployment, signing or release was performed.

## Independent milestone review

- Registry ENS helper and RegistryView source in Team B's registry worktree were inspected before its final commit.
  No blocker was found in the selected-client-only transport, disabled CCIP Read, chain restriction, response limits,
  or stale-input version guard. This provisional review must be pinned/rechecked against its final commit. Resolver
  code presence is not authenticated runtime identity; selected-RPC resolution is not independent merchant identity.
- Team C `dad2617ed662351069c8a2df616c2ad1dad33c39`: independently reviewed the alert lifecycle, rejection detector,
  HTTP integration, logging redaction and runbook. No blocker found within that diff. An independent rerun of
  `vitest run src/alerts.lifecycle.test.ts src/rejectSpike.test.ts --maxWorkers=1` passed 8/8 tests in two files.
- Additional historical safeguards on base `365a1c38`: `node --test scripts/tests/audit-report-paths.test.mjs
  scripts/tests/ghostpay-codex-cloud-workflow.test.mjs scripts/tests/workflow-files.test.mjs` passed 11/11.

## Real analyzer preparation and current campaign status

The original environment lacked native tools. This review installed prerequisites outside the repository:

- Official Echidna 2.2.7 archive matched the repository-pinned SHA256
  `d9f8c2e829cc35a4077f8c139863c9087a038262639febd1dcc69d93b79aa314`.
- Official Foundry v1.8.5 archive supplies forge/anvil/cast; reported commit
  `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`. The separate `.sha256` URL returned 404; no unavailable
  checksum verification is claimed for this archive.
- solc 0.8.28+commit.7893614a matches official compiler-list SHA256
  `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`.
- Python 3.12 virtual environment installed Mythril 0.24.8, solc-select 1.2.0, setuptools<81 and
  crytic-compile 0.4.2. The first build failed because Python expected absent clang; `CC=gcc` succeeded.
- Unmodified `myth version` then failed on legacy `solc-bin.ethereum.org` HTTP 503 in this environment. A local transport-only
  launcher sets py-solc-x's download host to official `binaries.soliditylang.org`, with the verified local solc
  registered under `SOLCX_BINARY_PATH`; it reports Mythril v0.24.8. Analyzer code and invocation flags are unchanged.

Native tools: `/tmp/ghostpay-analyzers/bin`; Python tools: `/tmp/ghostpay-analyzers/venv/bin`.
Two real campaign attempts are running at this documentation checkpoint on unchanged contracts at `365a1c38`:
`run-echidna.sh` with unchanged 300,000-test configuration (600-second process budget), and `run-mythril.sh`
with unchanged default 900-second per-contract setting (1,200-second process budget). These are **not passes**.
The final result must be appended before release review; a resource timeout or analyzer crash remains an unqualified gate.

## Follow-up: old recovery and SBOM source disposition

The broad “not re-proven” historical row above is narrowed by a second source comparison. The five old recovery
branches share synthetic checkpoint `71cd067d` and later commit sequence through `371d235c`; their restart-only
head commits do not introduce additional product behavior. Comparing the union of 188 touched paths at the latest
old tree with review base `365a1c38` found 32 identical blobs, 145 evolved files and 11 absent paths. Ten absent paths
are archived evidence/handoff material or the old vendored Viem archive/provenance. The remaining absent file is
`scripts/tests/normalize-sbom.test.mjs`, specific to that vendored-archive implementation. No product implementation
file in that old checkpoint is absent from the current tree. This presence check alone is not behavioral equivalence;
the meaningful post-checkpoint changes were inspected as follows.

| Old commit(s) | Behavior and current disposition |
|---|---|
| `71cd067d` synthetic checkpoint | Current tree retains the policy UI/helpers, signed profile protocol, privacy scanning, receipt/reconciliation archive, BTC header/witness/spend/state, permit, QR and printable bill implementation files. Current versions include later reviewed lineage fixes; do not restore the synthetic whole-tree snapshot. This is source retention, not an original-history reconstruction. |
| `57dcf7e8` | Seller-vault browser evidence script remains at `apps/web/scripts/test-seller-vault-idb.mjs`; modern Pages browser-process restart acceptance supersedes the isolated historical claim. |
| `c0d1c5ca` | Seller identity changes/lock call current `forgetTyped`, clearing typed key and passphrase values and replacing generated suggestions; old unsaved-passphrase protection is retained. |
| `75313253` | `resetFilePicker` remains called on cancellation/session replacement; file selection captures the chosen file before cancellation resets state. Corresponding recovery tests remain. |
| `553ef6f4` | `generation` plus `ownCompletion(id, installed)` still controls completion by installed session identity. New cancellation/key changes invalidate it; current vault guards are stronger. Completion and browser recovery test files remain. |
| `76136ee9` | Save refusal still calls `refreshVault`; quota/abort and competing-slot tests remain in SellerKeys.storage.test.tsx. |
| `91eb9d75`, `21c7ed43`, `c729f5e9` | Current payExec.acceptance, browser flows and Sweep tests retain ERC-20 amount/token acceptance, CSP-worker/receipt evidence and stale-session handoff cases. Their assertions have evolved with typed user messages and stronger session guards; do not replace current files with old copies. |
| `fac0fbd5`, `dedb67b8` | Locale draft completion and blank-line-only test change are superseded by the larger current complete catalogs and test formatting. |
| `84f5cdf5` | Offline Viem 2.22.14 metadata repack is obsolete: current lock uses pinned registry Viem 2.57.13 and contains no `file:` dependencies. Do not reintroduce a large old runtime archive to recover metadata behavior. |
| `a734e771` | Vendored `file:vendor/...` SBOM normalization is inapplicable without any local archive dependency. Current normalizer fixes checkout-root component naming and deterministic identity/time. The old test and helper are deliberately not imported; reconsider if vendored npm archives return. |
| `342ed85e`, `3d73ed91`, `61c3083c`, `405c1680` | Current `localBuildProfile.mjs` explicitly records `GhostPay371d235` as selection/public-copy basis; the lean entry/asset boundary exists with stronger module-evidence, worker-evidence, executable-file and outside-output guards. The dot-prefixed report-path case is covered by `reportOutsideOutput`, which rejects every in-output path regardless of initial dot. Current AppLean test and profile fixtures supersede historical label-only fixes. |
| `0f8c82ce`, `371d235c`, `2ec98b23`, `020ba327`, `3697f539`, `b5b04b99`, `75400888` | Restart/provenance documents only. Preserve the source branches and this source-pinned disposition; do not make old qualification statements authoritative. |

No recovery patch was applied because this comparison found retained/evolved behavior or obsolete architecture-specific
work, not a demonstrated missing implementation. The original 163-file synthetic checkpoint is not independently
requalified by this source comparison; current integration suites, rather than old passing evidence, remain required.

## Final implementation review checkpoints

| Source | Independent review and execution |
|---|---|
| Registry ENS `e2874e5cdce37739c6c154cc099ce7758fd34f6c` | Pins the earlier selected-RPC-only source review. No later product difference on the registry branch was present at recheck. No additional test count is claimed here. |
| Oracle decimals `39f79175e249ecd35f6bff1abbb8750d9ade814b` | No blocker found. The only production `readPrice` caller passes configured feed decimals; invalid expected decimals fail before RPC, and a mismatched reply cannot be silently rescaled. Independent `quote.test.ts` run: 22/22 passed, one worker. |
| Team C metrics `364efaf3902351886eb2baa739e8e0dc70101617` | No blocker found in exact integer accounting, fractional micro-USD carry, late receipt single settlement, restart fee-unknown handling, bounded histograms, source-free labels or transport preservation. Independent metrics/runtime suites: 14/14 passed, one worker. Reviewed subsequent native-scrape and restart assertions; their broader author run is not counted as independent execution. |
| BTC persistence `9b91180384245288996206a268e23e84a2e5e722` | Found a deletion ABA defect in the initial constant tombstone: a stale tab holding an old tombstone could save after another save/forget cycle. Author reproduced it, then made each deletion use a fresh 32-byte nonce and strict tombstone schema. Independently re-reviewed the fix and bounded recovery pagination, which also removes the original >500 matched-block resume dead end. Store/resume/UI suites: 14/14 passed, one worker. Keys/tweaks are not serialized; wallet/network AAD, guarded CAS and fresh header/source revalidation precede spendability. |
| BlindBit gRPC `2fc1d217df42374ad9381df7b4c1b17b3c9b5b6b` | No blocker found in the scoped optional transport. Exactly one data frame and a terminal successful trailer are required; response/entry bounds precede protobuf allocation, integers/hash order are checked, and same-server block hash agreement is not called independent authentication. The initial new synthetic fixture failed; after its correction the independent suite passed 32/32. MIT schema notices are included in the package files. |

BTC persistence and gRPC implement the locally actionable gaps identified above. They do not qualify a live
oracle/proxy, bitcoind regtest deployment, wallet interoperability, hosted scan-key service, or browser-process
restart on a browser that could not launch in this environment. Existing Esplora UI disclosure explicitly includes
matched outpoint status queries; the new block-level gRPC client does not receive wallet keys or outpoints and does
not expose `getSpends` from incomplete transaction data. The source-pinned transport handoff remains
[`BLINDBIT_GRPC_HANDOFF.md`](BLINDBIT_GRPC_HANDOFF.md).

## Additional real analyzer evidence

Installed Slither 0.11.6 and solc-select 1.2.0 in a second isolated temporary virtual environment to avoid
changing Mythril's dependency graph. With Foundry 1.8.5, verified solc 0.8.28, `RAYON_NUM_THREADS=2` and
`FOUNDRY_COMPILATION_JOBS=1`, the exact nightly gate at `365a1c38` completed with exit 0:

```sh
slither . --filter-paths 'lib|test|script' --fail-medium --exclude-informational --exclude-low
```

Reported: 34 contracts, 64 detectors, zero results. This uses the configured exclusions and is not a claim that
every informational/low-severity detector ran. Log: `/tmp/ghostpay-analyzers/slither-gate.log`.

The first full-configuration Echidna attempt reached Router 203,858/300,000 and ended at the outer 600-second
budget (exit 124). No final property inventory was emitted; Sweep and Policy were not reached. A second attempt
keeps the unchanged 300,000-test, sequence-length-20, seed-20261021, four-worker configuration and uses a
2,700-second overall budget. Final outcomes below supersede these interim progress notes.

### Native reporter defect and bounded parser correction

The second native campaign completed Router at 300,021 calls and Sweep at 300,063 calls. Every declared real
property was reported `passing`; reached canaries were `failed!`. The original wrapper rejected these real results
because its fixtures assumed `passed!`. The pinned upstream
[`v2.2.7` reporter](https://github.com/crytic/echidna/blob/v2.2.7/lib/Echidna/UI/Report.hs) confirms that final
`Open` properties without a reproducer render as `passing`, and the final call count sums worker `ncalls`.

Correction `5d1e6499ec9781963d7eb2230a4d968ef2a21b7a` accepts that exact status only with one completed
`Total calls` footer meeting the configured positive test limit. It also requires that footer for the other passing
status. Complete declared inventory, no duplicate/unknown properties, failing reachability canaries, and the
expected native exit code remain mandatory. Five regressions failed before the correction; all 41 combined
wrapper fixtures passed afterward (22 Echidna, 19 Mythril). Independent `final_review` source review and its own
22-case run found no blocker. The running native campaign still uses the originally parsed shell loop; validating
its captured unchanged native reports through the corrected gate is explicitly a report replay, not a fresh campaign.

### Mythril finding disposition

The first unchanged five-contract wrapper attempt ended at the outer 1,200-second budget, exit 124.
`GhostPayRouter` and `GhostPayPolicyRouter` were killed with exit 137. `GhostPaySweepRelayer` produced one Low
SWC-116 finding at `src/GhostPaySweepRelayer.sol:83`, on `if (block.timestamp > s.deadline) revert Expired()`.
That condition enforces the owner's signed expiry; it does not use the timestamp as randomness. Its dependence on
chain time is the intended deadline behavior, including the chain's timestamp semantics. Removing the condition
would remove an authorization boundary. The finding is documented without deleting the guard or globally
suppressing SWC-116; the wrapper remains non-green. This is an AI-assisted source disposition, not acceptance by
an external auditor. `PolicyAccount` was interrupted before a report, and the factory was not reached in that first
attempt. A bounded direct continuation uses the same compiler, optimizer, Cancun target, transaction count and
900-second analyzer setting for those two contracts. `PolicyAccount` returned two additional Low SWC-116 findings
at lines 161 and 262, respectively the signed withdrawal and destination-proposal expiry checks. The same intended
deadline disposition applies. `PolicyAccountFactory` was killed137 without a report. No finding suppression was added.

### Final native outcomes and preserved evidence

The extended Echidna Policy process was killed137 at last reported257,048/300,000 calls. All five reachability
canaries had been observed, but there was no final property inventory. Editing the original wrapper while it was
running also caused a shell tail parse error after that process (overall wrapper exit2); the complete original log
preserves both failures. Its completed Router/Sweep native reports are retained independently of wrapper failure.

One final Policy retry ran alone with a fresh corpus and unchanged analyzer settings, a900-second wall budget and
a1024MiB sampled process-tree RSS guard. It received SIGKILL after16.28seconds, at last reported1,526calls, before
either guard limit fired. Sampled tree peak was802,368KiB; child maximum RSS was812,540KiB. This establishes native
termination, not its exact system cause. Attempts to use GHC heap flags were rejected by the official binary before
fuzzing; no alternate analyzer version or weaker harness was substituted. No further local retries were made.

The corrected report-gate replay accepts the two completed native reports and rejects Policy's137 exit, missing
final inventory and incomplete call total (replay exit1). **Neither the full Echidna suite nor Mythril is qualified.**
Configured Slither passed. [Compact native reports and digest manifest](team-j-analyzer-evidence/README.md) preserve
the exact source/tool pins, full compressed streams, selected final reports, findings, resource/exit metadata and
the report replay distinction. All18artifact digests were independently recomputed after saving.

## Hosted analyzer continuation prepared

The coordinator authorized a second environment for the remaining native gates. The new
`.github/workflows/contract-analysis.yml` runs on contract/runner/workflow-related pull requests and is reusable
through `workflow_call`; nightly delegates its existing Echidna/Mythril jobs to it. No scheduled 100,000-run Forge
fuzzing, dependency audit, release or deployment job is added to PR runs. Each matrix member has its own hosted
runner, read-only contents permission, exact requested commit checkout and disabled credential persistence.

All action/tool pins are retained. Both existing analyzer runners execute without shortened budgets or finding
exclusions. The analysis shell records and rethrows its exit code; a failed/canceled/incomplete run does not become
a success through artifact collection. Analysis has a100-minute step bound inside the120-minute job, leaving time
for always-run bounded report collection. Artifacts retain at most the last8MiB plus full-stream SHA256/length,
requested and actual checkout commits, step outcome and the runner exit code when available. Missing output or
an absent exit file remains explicitly unavailable. Artifact upload cannot guarantee a report after runner loss.

`mythril-compat.py` changes only the legacy py-solc-x compiler host before importing Mythril; its actual local
version invocation returned0.24.8. Fixtures verify unchanged CLI arguments and nonzero returned exit codes.
Independent `final_review` inspected the workflow/helpers and passed all five new tests, including the actual
analysis shell's0/137 exit propagation, a9MiB report capped to8MiB with full hash, and missing/canceled evidence.
The final combined workflow/runner fixture run passed47/47 tests with zero skips.
Checksum-verified actionlint1.7.7 and YAML parsing accepted both changed workflows. No hosted run or remote
publication was performed by this worker; only an actual completed run on the eventual candidate can qualify it.
