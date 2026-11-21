# Wallet lifecycle privacy: generation 2 independent review

Branch `privacy/v1-wallet-lock-20261120`. Predecessor `2f2da8316ee025151e7f275eba5d9b93944a070c`; final tested source `a431845b9f8a4daa1759893132c4452bf50ce618`, tree `698a00feb0a84fbd045f65956de40758ea2a94e3`. Production follow-through `99b2c1668f126603b198adedf9adf3b8d8f2463c`, tree `f2c5a08ec1d5574b15ee74d8be059adb911376b5`. Worktree `/workspace/scratch/dc1ef37f4621/privacy-wallet`. Ownership is released after this evidence commit.

## Independent findings and implementation

Reviewed `useWalletPrivacy`, `observeWalletLifecycle`, connection checks, and Pay/Registry/Policy integrations for before/after-await authority, expected permission and chain-switch events, competing connections, partial listener registration, Strict Mode cleanup, stale callbacks, post-lock known hashes, unknown outcomes and preserved recovery/journal records. No duplicate monitor or broader network architecture was introduced. Providers lacking event hooks still depend on the existing account/chain rechecks before signatures and sends; this review does not establish provider truthfulness.

The first original eight-file caller run produced117 passes and8 failures. Five were the independently demonstrated history caller defect: the active wallet was not passed to WalletAttempts. Reused history runtime4cc9026f as localcdd75d2c (four prop spans only). Three remaining fixtures assumed a stale Policy review/scan would survive session replacement. Updated them to assert immediate removal, no additional wallet request, and explicit new deployment verification/connection/review before a new action. The owner-action fixture now independently exercises cancel/request/execute, reusing sibling disclosure's ced33b84 fixture separation without its v1.1 consent dependency.

One additional regression then established an **injected-client scan continuation**: after the mocked client ignored abort while awaiting logs, the scan initiated one further client read after session replacement. Actual `defaultServices.createRpc` already checks abort-backed authorization before and after transport; this is **not evidence of an external egress bypass**. With coordinator approval, added an optional session/view guard around the app-level scheme-2 scan client's reads and passed existing PolicyReceive session/deployment authority through it. It checks before and after each awaited operation, including rejection. No shared chain adapter, transport policy, extra request, scanner result format or persistence change. The concrete regression now passes.

Added real-route checks for superseded connections on all three views. An older pending connection cannot replace the newer account, perform further reads, or retain extra listeners. Two Pay cases preserve submitted-hash or unknown journal evidence after app lock while removing the stale account and send controls.

Root's original v1 typecheck identified unsupported Testing Library ByRole `exact` options in the M1 fixture. Removed all10 such role-query options, including new cases; name-string matching remains exact. Text-query `exact` options remain. This source-only test repair is a431845b; root owns full combined typing validation.

## Actual execution evidence

Every command used the original Vitest configuration, one worker and1024MiB Node heap. The adjacent JSON gives exact commands, source hashes, raw-log SHA256 values and compressed unmodified logs.

| Check | Source | Actual result |
| --- | --- | --- |
| Original Pay/Registry/Policy callers | c3b4c16b |117 passed,8 failed;8 files;exit1;65.51s |
| Adapted Policy guard/scope fixtures, before scan repair |59cb2ce2 |21 passed,1 failed;2 files;exit1;12.79s |
| Real lifetime/late-outcome cases |a3150be9 |11 passed;1 file;zero skips;exit0;5.34s |
| Scan scope and original policy logic after repair |99b2c166 |36 passed;2 files;zero skips;exit0;8.55s |
| Broader14-file final attempt |99b2c166 |203 passed of219 selected;12 files completed;two worker SIGKILL errors;exit1;93.51s |
| Corrected role-query fixture |a431845b |11 passed;1 file;zero skips;exit0;12.48s |
| Two worker-killed original files, separately retried in quiet window |a431845b |29 passed;2 files;zero skips;exit0;22.82s |

The14-file invocation **did not pass**. Its PolicyView.guard and RegistryView.test workers were killed; the two complete clean retries are separate evidence. Counts overlap and must not be added into a fictitious single219-case pass. No assertion failures remain in the completed final selections. Secret scan and full feature-range whitespace check passed. Full original typing, typed lint, complete coverage, browser and hosted checks remain coordinator gates; no unavailable check is marked passed.

## Internal next-generation handoff

Use the final source/tree above, plus this branch's complete ancestry and evidence. Keep standalone v1 independent of disclosure. Root must reconcile both runtime lineages while preserving v1 connection guard/signal arguments3/4 and v1.1 optional disclosure argument5/WalletSession.disclosure. Merge history's four props without duplicating or dropping them.

The combinedv1.1 original Policy fixture must keep the new explicit verify/reconnect/review steps after session replacement **and** disclosure's per-request approvals. Its separated owner-action cases require fresh authority. Adapt the new11 real-route lifetime cases with the disclosure helper only in the v1.1 candidate. The masking team's independent Pay refreshContext stability repair is outside this lane.

Run original combined typing/lint in a quiet resource window (root found1280MiB effective for v1), then the relevant original browser and full coverage gates. Review that the scan adapter guard composes with the default authorized RPC without adding requests or weakening transport checks. Preserve every failed/resource-limited attempt. Do not deploy, publish, alter shared integration/main or waive the existing security/release conditions.
