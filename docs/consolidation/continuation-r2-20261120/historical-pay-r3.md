# Historical payment and adapter branch review

**No missing browser-core runtime was found in the four assigned donors.** Their relevant behavior is present or strengthened in Sweep candidate `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a`, and all ten inspected runtime blobs are identical in idle candidate `1ca7105e050f7d76aee18fe3efee3cd02cd72cb4`. Replaying the older files would remove newer safeguards.

This is a read-only semantic source review. No tests, builds, source edits, ref/PR changes, browser runs or live RPC requests were performed. Source assertions do not imply current CI or release approval.

## Dispositions

| Donor | Assigned browser/adapter outcome |
| --- | --- |
| `2527d6b9367887508d7d8f678a18564132652a03` — lean-core milestone | A3-2 expiry behavior retained and strengthened; A7-2/A7-3 regression sources retained |
| `1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78` — historical audit repair | B2R operator-fee fallback and AR2 window recovery retained with stricter successors |
| `63994db6cff8b3b3ca698427eee9e95904230546` — historical security audit | Same browser/adapter slices as previous donor; extra hosted-relayer secret-file work is outside scope |
| `73923350fcda62f00be0f2b83ad346f416a24bb6` — combined browser boundary fixes | Bounded relayer reads and filtered transfer estimates retained; uncertainty and history rules strengthened |

### Payment expiry and manifest evidence

The old payment repair capped a router deadline at invoice/fiat expiry and rechecked invoice/buffer freshness at send. Current `pay.ts` instead uses the **last payable second**, one second before the first expired second, and rejects an explicit deadline beyond that bound. `preparePayment` uses the same deadline for permit and router data. `sendPayment` repeats invoice, buffer and current-operation checks around asynchronous preflight and passes the guard to final submission.

The current A3-2 unit/view cases and A7-2/A7-3 deployment/manifest verification sources remain. This review did not execute them. Cloud automation and broader workflow changes on this donor were not part of the assigned browser-runtime slice.

### Operator fees and adaptive scanning

Current `opStackFee.ts` accepts a missing optional operator-fee method only when the verified RPC client positively classifies a plain execution revert. Gas errors, invalid opcodes and unknown execution failures leave the fee unknown. This strengthens the old `reverted && !halted` predicate; current adapter and Sweep tests explicitly retain the historical B2R cases and reject code 3 without a known revert message.

Current announcement scanning resets served-range evidence on actual regrowth, retaining AR2. It also preserves that evidence when the window is already at its cap. Both the historical sparse/dense regression and a cap-specific transient-refusal regression remain. Hosted relayer queue/deadline and secret-file work is outside this Pages-focused review.

### Browser relayer reads and transfer estimates

The bounded response reader is unchanged from the historical browser donor, including cancellation when a streaming response exceeds its byte budget. The current streamed-response regression still requires early rejection before the complete 80KiB stream is produced. The runtime file's only difference is that an unknown authorization-layer response is no longer treated as proof of no broadcast; the current test protects that uncertain outcome.

Transfer telemetry still rejects another token or blocks outside the requested range. Current history completeness additionally checks the full 30-day span. Replacing these files with the old donor would undo those stronger uncertainty/history semantics.

## Handoff

No new recovery patch is recommended for these assigned runtime slices. Preserve the historical branches for provenance and separately review excluded workflow/server work if its scope is later authorized. The adjacent JSON records all exact donor commits, merge bases, current blobs, source hashes, retained test-source blobs and scope limits.
