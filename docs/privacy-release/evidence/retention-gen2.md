# Retention generation 2: independent review and bounded repair

Base `2bd20ecb8ac437e2e3fb42fc953a11ed1ab24fca`. Runtime/tests `1003569fed259317967a190c192ede5b9fd80ea9`, tree `543378407777642c9b7054825356b5500c356da4`. Branch `privacy/v11-retention-20261120`. Claim `acf68bf30de1dc9e266f1decf5025b42a2d1c181`; regressions `bbff4829440ea8ca44fb0e1d13a10409301513eb` and `f9c86900908b159d491fdb757c97adcbd66370ac` precede the runtime repair.

## Findings and changes

| Finding | Impact | Repair and evidence |
|---|---|---|
| Medium: `InvoicePreviewRetention.changed` let a failing observer abort registration before the disposer was returned | The view could lose cleanup ownership while the registry retained its callback; other observers and clear-result reporting could also be interrupted | Observer failures are isolated; removed listeners are skipped. New original-config regression proves registration remains disposable and cleanup reports completion. |
| Medium: a failing adapter restored its entry after the owner disposed during the callback | Later expiry could call a closed view again | Disposal is explicit even while the entry is temporarily absent; failed cleanup restores only still-owned entries. Regression proves no resurrection or second callback. |
| Low: withdrawn cleanup did not reserve capacity | A reentrant adapter could register 32 replacements and then fail, restoring the original as entry 33 | In-progress callbacks reserve their slot until completion. Regression proves the 32-entry bound and no eviction/new callback execution. |
| Low: malformed preference could activate cleanup | Duplicate delay members or arbitrarily padded JSON were accepted as an enabled policy | Reuse the existing `@ghostpay/invoice-schema` strict JSON parser with a 128-character input cap. Both malformed cases now default to off. Saved canonical numeric preferences remain valid. |

Only `apps/web/src/lib/metadataRetention.ts` production code changed in this generation. No new external code/dependency, catalog, storage adapter, crypto, wire format, fee, network or remote change. The strict parser is existing project code already consumed by other local trust/preference boundaries; no custom parser was authored.

The [eligibility census](retention-gen2-census.md) records the exact protected stores and reasons. There is no positive record-level proof that current persistent transaction/invoice collections are nonessential. They remain excluded, including submitted/unknown attempts, invoice registrations, sole-copy receipts, encrypted vaults, pins, reorg/tombstone data and backup/recovery state. Existing explicit delete/export workflows stay separate.

## Actual verification

All Vitest commands ran from `apps/web` with the original config, `--coverage=false --maxWorkers=1` and a 1,024 MB Node heap cap.

- Tests-only source `f9c86900908b159d491fdb757c97adcbd66370ac`: **5 failed, 7 passed, zero skipped**, one file, exit1,0.422s. Every failure was the intended assertion above; no missing-module/startup failure.
- Fixed source `1003569fed259317967a190c192ede5b9fd80ea9`: **21 passed in4files, zero skipped**, exit0,15.79s. This is the entire original M1 focused selection plus the five new regressions. It includes manual preview/confirmation, stale plans, reentrancy, expiry/denial, actual generated encrypted invoice cleanup with intact draft/session/storage, and existing Settings clipboard behavior.
- `bash scripts/scan-secrets.sh`: exit0.
- `git diff --check` and complete feature range check from `bbcf71b79d4efd00892948faa833cb7d8f471406`: exit0.

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/lib/metadataRetention.test.ts src/components/MetadataRetentionControls.test.tsx src/views/CreateInvoice.retention.test.tsx src/views/Settings.clipboardPrivacy.test.tsx --coverage=false --maxWorkers=1
```

Compressed complete logs and raw SHA-256 values are in `retention-gen2/`. The failed cases are a subset of the final21; do not add counts. No TypeScript, typed ESLint, browser or full coverage success is asserted here. The coordinator reserved those resource-heavy checks and reported killed original typecheck attempts on a different combined source; those are not a pass or a type diagnostic for this feature.

## Remaining scope

This is an M2 independent-review milestone for the existing **in-memory invoice screen-preview slice**, not completion of #287 item4. Persistent metadata retention, a terminal-transaction presentation adapter, real-browser reload/concurrency, original complete typing/lint/coverage and exact-source integrated release qualification remain open. No future privacy architecture is added.

## Internal next-generation handoff

Start from this feature head or its coordinator-reconciled descendant; re-read the spec, this evidence and the census. Claim the exact owned paths before editing. Confirm the combined source preserves the five regression fixes and the original nonessential-data boundary. Reconcile with the merchant minimization feature before considering an additional **merchant invoice screen-result** adapter; preserve immutable signed profile, generation guards, settings and separately saved records. Do not pull another active worker's source without coordinator reconciliation.

Any persistent or transaction adapter first needs a concrete nonessentialness proof and current-record transactional preview/confirmation. A timestamp, status name, hash, receipt signature or missing RPC observation is insufficient. Protect sole-copy information and duplicate/reorg/trust evidence; do not create a sensitive store to demonstrate cleanup. Finish original scoped typing/lint and browser checks when resources permit, retain exact-source evidence, and give the next fresh worker a bounded task. No remote push, merge, deployment or release is authorized by this handoff.

Ownership is released after this evidence commit; only the coordinator-provided dependency symlinks remain untracked. No test process remains active.
