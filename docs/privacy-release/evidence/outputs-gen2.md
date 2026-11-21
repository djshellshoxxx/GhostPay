# Privacy-safe outputs: generation 2 review and handoff

## Milestone and exact source

M2 is complete for the bounded output review and two demonstrated message repairs.
Full combined typecheck, lint, coverage, browser and hosted release qualification
remain coordinator-owned and open; this record is not a release approval.

- Worker: `/root/outputs_gen2`; date: 2026-11-20 UTC.
- Branch: `privacy/v1-outputs-20261120`.
- Required specification: `docs/privacy-release/v1-05-outputs.md` (issue #286).
- Published baseline: `137628961463fc5abd8b7927b2efe6b18a0a206a`.
- Incoming M1 evidence head: `76ddb0309dcc941d0930d253d63460f1e7822453`.
- Incoming M1 runtime: `81e295a3cdf3e75d5a64f36cefe395aa233cce0c`.
- Regression source: `d62af55f2735327441e26b49fa08c4419e226ef6`;
  tree `b6dcbe2d3d827a5bb29834bf4020905da89c7745`.
- Production repair: `27e587fc3b8e9389f961daea700e6f5ba6e8bc25`;
  tree `45b3eee38e9f9226a28c5c21725a36ace2f17d43`.
- Final accepted source: `5e28b52b418d9c6cb250f559e4f2ce5805425c64`;
  tree `389c34c055975916f9bdee8969ccfb6c20fe5c26`.

The evidence commit after this accepted source changes only this review, retained
logs/metadata and the ownership release. No external code was copied and no
dependency was introduced. Existing error descriptors, catalog classification,
export modules and codecs were reused.

## Demonstrated defects and repairs

`features/policy/chain.ts` interpolated the selected contract address into a
malformed-read `UserFacingError`. The existing error renderer and captured message
therefore retained that address. The same read now throws the fixed
`policy.error.contractResponse` descriptor. RPC inputs, decoding, failure behavior
and deployment verification are unchanged.

`lib/paymentKeyExport.ts` passed the selected payment address as a value in the
contract-code refusal descriptor. That value reached both rendered text and the
retained message. The descriptor now has no address value, and its fixed copy
still explains refusal for contract code or EIP-7702 delegation. Account checks,
whole-archive refusal, authorization, derivation, key wiping and export bytes are
unchanged.

All four catalogs (`en`, `es`, `ja`, `ar`) contain the consistent neutral copy. The
new policy key is explicitly in the existing critical policy group and its test.
Non-English entries remain English draft text under the existing critical-copy
policy; this is not evidence of native-language review.

Two new regression cases exercise the actual exported operations and assert both
neutral rendered text and absence of the selected address from captured messages.
Both failed before production changes. The first complete acceptance run then
found one old archive test explicitly requiring the offending address in its
error. A tests-only follow-up replaced that expectation with the same refusal
reason plus address absence. Its whole-archive failure and every derived-key
wipe assertion remain intact.

## Output inventory and protected data

| Surface | Source and result |
| --- | --- |
| Ordinary downloads | `SellerKeys`, `SellerPairing`, `Pay`, `ReceiptPanel`, `PaymentRequestQr` and `ReconciliationLedger` pass fixed names: `ghostpay-keystore.json`, `ghostpay-seller-public.json`, `ghostpay-receipt.json`, `ghostpay-receipts.json`, `ghostpay-proof-of-payment.json`, `ghostpay-reconciliation-encrypted.json` and `ghostpay-untrusted-legacy-ledger.txt`. |
| Policy and tag archive | M1 fixed the remaining hash-prefix/date metadata to `ghostpay-policy.json` and `ghostpay-tags.gpa`. Its source diff leaves canonical policy serialization and the encrypted archive creation timestamp/payload unchanged. |
| Payment recovery exports | `paymentKeyExport.ts` uses `STEALTH_EXPORT_FILENAMES` from `packages/ux-vault/src/stealth-export-portable.ts`: fixed public, keypair, keypairs, master and private-key names. `StealthExportPayment` passes each file's text/type unchanged. |
| QR downloads | `QrView` uses `ghostpay-invoice-qr.svg`. `QrFrame` uses the bounded public `QrKind` classification from `lib/qrKinds.ts`, never QR payload text, in its filename. The six kinds are `secret`, `shareable`, `bearer`, `device`, `proof`, `caution`; existing handling rules forbid secret-kind downloads. |
| Download mechanism | `Common.downloadText/downloadBlob` constructs a local object URL and assigns the caller's neutral name. It keeps the supplied Blob payload, removes the anchor in `finally` and revokes the URL on the existing failure/success paths. Its original tests passed in this generation. |
| Titles | `index.html` and the favicon use fixed `GhostPay` titles. No production `document.title` mutation was found. Current QR titles/captions are deliberate localized UI or network labels, not payload text. |
| Notifications/live status | No production Notification API producer was found; none was added. Existing shell status is inside `SensitiveContent`; masking lifecycle integration remains the masking team's responsibility. |
| Console and root errors | `main.tsx` reports a fixed built-in error classification and never reads error name/message/stack or React component stack. Its four original tests include hostile properties/proxies and secret-bearing errors. The other reviewed console producer is development-only catalog diagnostics with static key/kind/locale. |
| Error boundary and formatter | Existing `ErrorBoundary`, `userMessage` and `captureUserMessage` use the fixed panel/trusted descriptors and bounded generic error mapping. The two selected-address exceptions above were repaired. |
| Invoice input paths | Inspection of `schema.ts` ruled out the candidate unknown-property-name leak: unknown record fields are rejected at the parent schema path; retained paths come from schema fields and bounded indices. No repair was justified. |

The adjacent download inventory is a retained source-search result, not a runtime
security gate. Source review found no other current download filename carrying a
selected address, policy hash fragment or creation timestamp.

Deliberate encrypted invoice fragments, QR payloads, explicitly requested export
bodies and transaction outcome/recovery references remain functional. Known
transaction hashes and unresolved-outcome records prevent unsafe resubmission;
this work does not suppress them or reinterpret a possibly broadcast operation.
`fragment.ts` retains its same-entry history cleanup. This review makes no claim
of anonymity, DOM/memory erasure, or browser/clipboard-history deletion.

Payload evidence includes the original byte-for-byte public-record vector, exact
raw-key text, encrypted-key/master-backup round trips, recovery use, archive
refusals and key-wipe tests in the final accepted selection. M1's separate
34-case run additionally covers exact canonical policy JSON and tag archive
round trips with 1 and 1,000 records and encrypted history. Those M1 results are
historical evidence at M1's exact source, not new executions by this worker.

## Executed verification

Commands ran from `apps/web` unless otherwise specified. All focused Vitest runs
used `NODE_OPTIONS=--max-old-space-size=1024`, original test files and
`--coverage=false --maxWorkers=1`. No gate, threshold, timeout, production mock or
dependency configuration was changed.

| Run | Exact source | Actual outcome |
| --- | --- | --- |
| Two selected regressions before repair | `d62af55f` | Exit 1; 2 failed, 57 intentionally filtered; 2 files; 2.52 s. Both failures demonstrate the selected address in rendered error text. |
| Initial complete focused selection | `27e587fc` | Exit 1; 106 passed, 1 failed; 8 files; 14.02 s. The failure was the old address-positive archive expectation described above. |
| Final complete focused selection | `5e28b52b` | Exit 0; **107 passed, zero skipped, 8 files**; 14.92 s. |
| `bash scripts/scan-secrets.sh` from repository root | `5e28b52b` | Exit 0; no committed env files or key material found. |
| `git diff 76ddb0309dcc941d0930d253d63460f1e7822453..HEAD --check` | `5e28b52b` | Exit 0. |

Final complete focused command:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run \
  src/lib/paymentKeyExport.test.ts src/features/policy/policy.logic.test.ts \
  src/components/Common.test.tsx src/main.test.tsx \
  src/lib/errors.test.ts src/lib/errors.i18n.test.ts \
  src/i18n/securityKeys.test.ts src/i18n/catalog.test.ts \
  --coverage=false --maxWorkers=1
```

The red and first acceptance executions are not additive coverage. Their full
unmodified logs, final acceptance log, secret-scan log and source inventory are
compressed in `outputs-gen2/`; `evidence.json` records commands, exits and SHA-256
hashes of both uncompressed and compressed bytes.

Reviewed but did not execute the original browser leak guard in
`e2e/stealth-export.spec.ts` and `e2e/stealthExportFixtures.ts`. It observes
request URLs/headers/bodies, console/page errors, download names, clipboard,
URL/history, storage and IndexedDB, with original recovery/blocked-download
checks. Full original typecheck, lint, unit coverage, browser and hosted gates
must run against the combined exact source; no M2 focused result substitutes for
them. No test/build processes remain from this worker.

## Internal fresh-successor handoff

Start by reading AGENTS, workflow, the v1-05 specification and this evidence. Claim
ownership before editing. Review the merged two neutral-error changes and all
four critical catalogs at the coordinator's exact combined commit. Confirm the
new policy key remains classified and the export refusal retains no address
value. Check that shared catalog reconciliation has not lost either fix.

Coordinate the original full web typecheck/lint/unit/browser gates with the root
resource window. Run the real existing output/export browser coverage, retaining
failures and exact source metadata. Compare filename separately from actual
payload/recovery bytes and preserve every known transaction outcome, refusal,
key-wipe and blocked-download retry check. Add a narrow regression only if an
actual new gap is demonstrated. Reuse existing modules; no future privacy suite,
new Notification API, wire-format, dependency, cryptography, fee, contract,
deployment or gate changes. Do not publish remotely. Finish with evidence and a
source-pinned successor handoff, clearly separating focused acceptance from
combined qualification.
