# Application export to standalone recovery interoperability

## Scope and decision

Worker: `/root/recovery_acceptance`; branch:
`test/ghostpay-recovery-interoperability-20261120-9a4ab6`.
Exact source base: PR #269, `683f8587b8de45448f14aab0539cb07a5f21bce3`.

Add one bounded acceptance test in
`apps/web/src/lib/paymentKeyExport.interop.test.ts`. Reuse the existing application
export service, versioned format, production KDF defaults, public synthetic
fixtures, documented standalone decoder and installed wallet library. No
application, codec, decoder, vector, user guide, existing test, dependency,
configuration or gate change is needed.

This test closes a particular coverage gap. It does not claim a new recovery
feature or invalidate the older feature's separately recorded acceptance.

## Ownership inspection before edits

The coordinator supplied the complete 111-open-PR head and changed-path snapshots
observed at `2026-11-20T23:34:59.281Z`. The proposed new test and evidence prefix
have zero exact changed-path owners in those inventories. The existing shared
`docs/ai/ACTIVE_WORK.md` receives only an additive claim, appended before the new
test was written. The coordinator explicitly approved this bounded test path.

Read the registry at all 105 heads containing it; PRs #51, #52, #82, #139, #140 and
#153 predate that path. Their changed-path inventories were still included in the
111-PR comparison. Broad existing Spec 18 claims remain authoritative for their
implementation. This task does not reassign or overwrite them. The ownership
record includes every inspected head, source digests, related claim text and
related changed paths: `RECOVERY_INTEROP_OWNERSHIP.json`.

Related source remains preserved on PRs #213, #229, #238, #239, #240, #262, #264,
#269 and #278. The task uses the existing #269 stack; it does not reconstruct the
feature on the unrelated current #307 candidate. Frozen ownership evidence is
not a live integration lease or permission to update another source branch.

## What the existing acceptance already establishes

| Existing source | Existing assertion and its boundary |
| --- | --- |
| `scripts/recovery/stealth-export-recover.test.mjs`, fresh-codec case | Fresh single, archive and master files produced by the built portable codec decrypt through the independent decoder's imported functions. The single/master use the production cost. This case does not call the application export service or the decoder CLI. |
| Same file, CLI and isolated-folder cases | The documented script opens saved reference-vector files in new Node processes. The isolated case permits reads only from the copied script, its two noble dependencies and saved test exports. The new application's returned file bytes are not its input. |
| `scripts/recovery/raw-key-anvil.test.mjs` | Foundry derives the address and signs a local synthetic transfer from the committed raw-key reference vector. It does not first produce and decode a fresh application encrypted export. |
| `apps/web/src/lib/paymentKeyExport.test.ts` | The real application export service reauthenticates, performs the injected EOA-code check, and seals the expected key; the same shared GhostPay codec decrypts it in-process. |
| `apps/web/e2e/stealth-export.spec.ts` | Browser download journeys use the real application and production encryption cost, then check files through the shared codec. They do not join the downloaded bytes to a standalone decoder and separate wallet signature. |

Historical results in the Spec 18 completion report and crypto review are
source-pinned evidence from that earlier work. They have been read, not rerun by
this task. No old result is relabelled as a current test pass.

## New acceptance chain

1. Load the existing public synthetic seller fixture and create its reauthentication
   keystore with the unmodified default KDF.
2. Call the actual `exportEncryptedPayment` service for fixture `a1`, supplying only
   the existing in-memory `eth_getCode` fixture. Assert the fixed filename, type,
   one-payment identity, exact EOA-code call and default scrypt parameters
   (`N=131072`, `r=8`, `p=1`, `dkLen=32`). No crypto or export function is mocked.
3. Clear the application seller session. Write the returned file's exact UTF-8
   bytes into a fresh temporary folder and verify byte equality.
4. Copy the unchanged documented decoder and its two installed noble dependencies
   into that folder. Reuse the established Node permission flag selection and
   restrict filesystem reads to the folder; a separate denial probe confirms
   that the original repository script cannot be read.
5. Invoke the script as a new process, with the export passphrase only on standard
   input. The default invocation verifies without printing private material;
   an incorrect expected chain refuses with no result; the explicit reveal
   invocation returns the one expected payment key.
6. Feed only that returned key to `viem/accounts`, reproduce the recorded address,
   sign a fixed public offline challenge, recover its signer, and reject the same
   signature for an altered challenge. The seller session stays empty and no
   application fetch occurs. Temporary files are removed in `finally`.

The fixed keys, announcement and challenge make the assertion deterministic.
Production randomness still supplies the fresh encrypted file's salt and IV.
The test never writes a recovered plaintext key to disk, logs it, constructs a
transaction or creates a network wallet client.

## Execution and review status

**The new test passed: one file, one test, zero failures or skips.** It ran with
Node `v24.22.3`, Vitest `5.1.0`, the existing `apps/web/vite.config.ts`, one worker,
and coverage disabled for this focused selection. This is not a full-web
coverage result. The test source was identical in the failed initial attempt and
passing retry: SHA-256
`580c14f1549d2d35d07682a6e80fd669521008937afd984a20b63d46fcb55806`.

The coordinator prepared the dependency tree after comparing all 684 external
lock records and confirming zero missing nonoptional installed paths. Compiled
outputs were copied only for 63 libraries whose own source/build inputs matched
the donor exactly. The three changed invoice-schema sources were rebuilt here
with their original package build command. The changed merchant-ledger package
is unused by this test and was left unbuilt. The supplied full dependency proof
has SHA-256
`dfcb97113b13daa6a0ea256b4c227a27d6beaee7488e1e403cdd20162b297334`;
the target lockfile remains
`0b79a483446f8c5778ff7f5bf178762e2c12c66a90fc13ca8f62158b1e01cce2`.

| Check | Actual outcome | Raw record |
| --- | --- | --- |
| Original `npm run build -w @ghostpay/invoice-schema`, heap 384 MiB | Exit 0, 1.871 seconds | `RECOVERY_INTEROP_invoice_build.log` and `.json` |
| New focused test, heap 384 MiB | Exit 1, 3.269 seconds; one test collected, worker received SIGKILL before any assertion outcome | `RECOVERY_INTEROP_test_initial.log` and `.json` |
| Same source, configuration, KDF, assertions and time bounds; heap 128 MiB | Exit 0; one file and one test passed; Vitest 4.63 seconds, wrapper 5.142 seconds | `RECOVERY_INTEROP_test_heap128.log` and `.json` |
| Original `scripts/scan-secrets.sh` | Exit 0 with its existing exclusions unchanged | `RECOVERY_INTEROP_secrets.log`; `RECOVERY_INTEROP_final_checks.json` |
| Authored test, claim, Markdown and JSON whitespace | Exit 0 | `RECOVERY_INTEROP_source_whitespace.log`; `RECOVERY_INTEROP_final_checks.json` |
| Unrestricted staged whitespace | Exit 2: only terminal blank lines in the three original build/test logs | `RECOVERY_INTEROP_whitespace.log`; `RECOVERY_INTEROP_final_checks.json` |

The original process logs retain their exact bytes, including terminal blank
lines. The separately scoped source/documents whitespace pass does not relabel
the unrestricted log-formatting result.

The initial SIGKILL is retained as a failed invocation. Its resource cause was
not confirmed: this environment exposes no usable cgroup memory counters. The
coordinator authorized exactly one lower-heap retry to reduce process overhead;
it changed only `NODE_OPTIONS`, preserving production scrypt cost, the original
60-second suite timeout, the 15-second child-process bounds, filesystem
isolation, no-fetch assertion and every other assertion. The passing result does
not convert the earlier invocation into a pass.

Build command, run from the task repository root:

```sh
NODE_OPTIONS=--max-old-space-size=384 npm run build -w @ghostpay/invoice-schema
```

Passing test command, run from `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=128 node ../../node_modules/vitest/vitest.mjs run src/lib/paymentKeyExport.interop.test.ts --maxWorkers=1 --fileParallelism=false --coverage.enabled=false
```

Before execution, the coordinator independently reviewed the exact test source
and found the scope sound: actual export-service bytes feed the unchanged copied
decoder, only the decoder output feeds the offline signer, and the test preserves
isolation and the limited claim. The coordinator is separate from this test's
author. This is bounded source review, not a broader security audit.

No full-web test/coverage suite, standalone decoder suite, full-web typecheck,
typed lint, browser run or broad build was repeated. Those applicable gates are
not established by this focused pass. The coordinator retains their scheduling
and integration decisions. The original configuration and existing assertions
remain unchanged.

## Practical limits

This establishes local interoperability of application-produced bytes, a
standalone independent decoder, and the recovered key's offline signature for
one synthetic scheme-1 EVM EOA. The injected account-code check is not a live
chain observation. Clearing the in-memory application session and denying the
decoder repository access does not model arbitrary data loss or prove future
backup retention. No actual browser download, real-device or third-party wallet
UI import, local-chain spend, public-chain action, transaction finality, recovery
from an arbitrary account model, deployment or release is performed here.

PR #269 and the older donor branches remain unchanged; the coordinator owns any
future publication and all applicable broader qualification and integration.

## Coordinator artifact preservation

The committed command logs now use lossless `*.log.artifact.json` wrappers. Each
wrapper stores the original UTF-8 output, byte count and SHA-256; decoding its
`content` reproduces the exact original bytes, including terminal blank lines.
The original command metadata and failed unrestricted whitespace result remain
unchanged. `RECOVERY_INTEROP_ARTIFACTS.json` maps original log names to their
wrappers and pins the unchanged test bytes. This formatting-only follow-up makes
the complete diff pass the original whitespace check without removing evidence
or changing application or test behavior.

The full matching-dependency proof is preserved in
`RECOVERY_INTEROP_DEPENDENCIES.json.gz`; its decompressed SHA-256 is the exact
value already recorded with the passing run. The coordinator verified all log
round trips, the dependency round trip and the authored test SHA-256 before
publication.
