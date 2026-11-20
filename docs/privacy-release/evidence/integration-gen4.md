# Required privacy integration — generation 4 checkpoint

## Outcome and exact source

The final standalone v1 parent `573901ee1c66624e57143526571a3fd76f52f264` is merged by ancestry into the v1.1 candidate. The frozen tested source is **`85dd647cfd439a18e4885ab5ff9a9bf3a3bbad5c`**, tree **`78001180019ef9e3b6716217e2a35a41b1426d20`**, following the ownership claim at `13cec0d7`. Its bounded original selection passed **301/301 cases across 14 complete files**, zero skips, exit 0, in 54.59 seconds. Committed-secret and full required-feature whitespace checks also passed at that source.

This is a combined implementation/qualification checkpoint, not completed release qualification. The adjacent `integration-gen4/evidence.json` records the exact commands, source/tree, resource controls, complete selection, exits, counts and raw/compressed log hashes. No failing test invocation occurred in this lane. Prior failures and independent feature evidence remain preserved in [integration generation 3](integration-gen3.md) and [wallet generation 3](wallet-gen3.md); their counts are not added to this run.

## Narrow source composition

Only `Pay.tsx` and `WalletPrivacy.lifecycle.test.tsx` changed application source relative to released integration `806ed96cde92237ce97533411e22c111a629f685`. The runtime captures the wallet operation before acquiring the payment RPC context, joins that captured signal with the existing network signal, and checks the same captured operation after acquisition. Provider events therefore revoke the old action's read grant. Existing known hashes, unknown journal records, duplicate protection and post-broadcast outcomes remain intact. No expiry-sensitive pre-sign guard was added after broadcast.

The six provider-event/outcome combinations use one explicit `eth_sendTransaction` decision in their shared parameterized test body. The existing helper still approves account access, reconnect and superseding-connection cases keep their own approvals, and the older app-lock outcome cases keep their own transaction approval. Pay retains six account-scoped listeners versus three for Registry and Policy. The new assertions verify no additional old-grant reads, revoked grant authority, unchanged independent network revision and seller authority, preserved hash or unknown journal, one send, concealed account and neutral error presentation.

The overlapping late-hash browser fixture already contained the incoming v1 scope repair. Conflict resolution preserves the prior v1.1 `flows.spec.ts` byte-for-byte: disconnected history conceals the returned hash; one same-tab reload restores the original mock account; explicit account approval precedes revealing its journal; and retry takes the real transaction review before duplicate refusal. Confirmation/cancellation of journal clearing and the single-send assertion remain. Browser fixtures remain authored-only.

`MetadataRetentionControls`, `MerchantTemplateIssuer` and the joint merchant minimal-mode/retention case are unchanged. Revision-bound confirmation plans and current-result identity remain in force. The focused run includes the control, merchant metadata and merchant retention files, including stale prior-mode authority and preserved selected mode, financial inputs, seller/custody state, stored records and valid shared links. No persistent financial or recovery record becomes eligible for cleanup.

## Verification

The coordinator assigned one exclusive heavyweight execution window. Vitest used the repository's original configuration, a 1,024 MiB Node heap and one worker. Coverage was disabled for this explicitly bounded selection; the original complete coverage command and thresholds were not modified or represented as passed.

| Check | Result | Source |
| --- | --- | --- |
| Pay/payment/network/journal/lifecycle and combined merchant/retention selection | 301 passed, 14 complete files, zero skipped, exit 0; 54.59 s | `85dd647c` |
| Committed-secret scan | exit 0 | `85dd647c` |
| Required-feature whitespace check from `bbcf71b79d4efd00892948faa833cb7d8f471406` | exit 0 | `85dd647c` |

The complete 14-file selection comprises `WalletPrivacy.lifecycle`, `Pay`, `Pay.network`, `Pay.signer`, `Pay.preflightCompletion`, `payExec`, `payExec.acceptance`, `walletJournal`, `networkAuthorization`, `networkAuthorization.adapters`, `useWalletPrivacy`, `MetadataRetentionControls`, `MerchantTemplateIssuer.metadata` and `MerchantTemplateIssuer.retention`. No name filtering, assertion weakening, automatic approval hook, gate bypass, test/config exclusion or threshold change was used.

Independent reviewer `/root/v11_qualification_gen4/consent_merge_review` inspected both immutable inputs and the final source/tree. It confirmed the one intended disclosure adaptation, unchanged browser and retention files, and the captured runtime scope without finding an additional blocker in this bounded delta. That lane made no writes and ran no tests, typing, lint, build or browser processes. This source review is distinct from the executed 301-case result.

## Evidence limits and remaining gates

The lifecycle proof uses actual App/Pay and NetworkAuthority with a controlled authorized injected RPC recorder. It does not establish HTTP-wire or real wallet-extension behavior. Browser helper, original flows/core journey and dedicated disclosure fixtures have not been executed by this lane. Complete original typecheck, typed lint, coverage plus the separate original nocov pass, build/CSP/bundle, built-browser and hosted gates remain coordinator-owned and open.

Retention still applies only to completed generated screen previews. Broader persistent invoice/transaction retention lacks a positive eligibility proof and remains incomplete. Existing limits also remain: masking hides presentation rather than erasing mounted memory; local reuse records current-wallet intended destinations; draft catalogs are not reviewed translations. This change reused existing repository wallet-lifetime, network-authority and disclosure primitives. It copied no new external code and introduced no dependency or future feature.

## Fresh successor assignment — internal

Use a coordinator-assigned isolated worktree and recheck current heads. Read AGENTS, workflow, required specs, this receipt and active ownership; claim a bounded task before writes. Preserve the exact parent ancestry and standalone v1's independence from v1.1. The tested application source is `85dd647c`; later documentation commits do not retroactively qualify any changed runtime.

1. Complete remaining original gate commands in a coordinator-assigned quiet window. Preserve every exit, failure, skip and resource termination at its exact source/tree. Do not reduce test sets or thresholds, substitute altered configurations, or treat a resource termination as a behavioral pass.
2. Execute the authored browser journeys through the original build and authenticated test-manifest path. Keep method-specific explicit consent, disconnected history concealment, original-account reconnection, durable unknown/submitted journal and no-extra-send assertions. Do not install a broad automatic approval handler.
3. If a concrete defect is demonstrated, claim only its necessary source/test spans, retain its failing evidence, repair minimally and rerun the affected complete files. Keep captured operation authority before RPC acquisition; preserve post-broadcast hashes and unknown journals without reinstating pre-sign expiry checks there.
4. Keep retention limited to proven disposable presentation copies. Further persistent adapters require a separately justified nonessentialness proof; security, sole-copy recovery, pending/unknown and duplicate/reorg evidence remain protected.
5. Preserve the shared integration lock, main, network policy, dependencies, crypto, fees, contracts and remote publication boundary. Hand off another bounded, exact-source checkpoint and release ownership when done.

The focused process completed normally. No test, typecheck, lint, build or browser process remains active in this lane. No remote publication, deployment or release occurred.
