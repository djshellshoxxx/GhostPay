# Selected receipt and bill print recovery — 2026-11-24

## Exact source

Worker `/root/ui_data_review` completed this integration in isolated branch
`integration/receipt-print-recovery-20261124`, based on
`74e51b7197258cba1e2db98bfb698307ef741d7c`.

| Checkpoint | Commit / tree |
| --- | --- |
| Ownership claim before edits | `dd90702a103a09750cb7b38619905caae3e9f4ce` |
| Original #608, retained as second merge parent | `0d3d804b3f53ad8b463117824ca1fd1b3332d798` |
| Qualified merge source | **`856503289d7e38e377dafef864f46ac55e1d218a`** |
| Qualified source tree | **`4cc62ec6e5bb05a8619d054f76cfd48a7c4856db`** |

Original #548 `cb977e4b31047e65ccbe8835c8e45e1cff3cfc84` and #532
`51c04326ff9258861621b94ce2ab06f44bba8301` remain ancestors. This handoff and
the completion entry are added after qualification without changing production,
tests or build inputs. Root checkouts and remote refs were not modified.

## Deliberate reconciliation

The merge had two conflicts: the adjacent print/archive buttons in
`ReceiptPanel.tsx`, and one ownership-registry block. The registry union retains
both parents' complete ordered lines.

The combined receipt component equals the current base plus only four donor
changes: the hook import, hook invocation, article ref and print-button callback.
All current archive generation invalidation, `archiveWriteInFlight`,
`archivePending`, completion cleanup and the archive-button disabled guard remain
intact. `ReceiptPanel.archive.regeneration.test.tsx` is byte-unchanged.

The automatic `app.css` merge was independently checked against the base: it
removes exactly the seven-line legacy print block. Current RPC layout and
browser-check footer styles remain. The print stylesheet, hook, bill component,
complete donor tests, browser fixture helper and historical handoffs match #608
byte for byte.

The recovered hook selects the actual mounted document before `window.print()`.
It handles completion, cancellation, synchronous failure, repeated requests,
switching, replacement and unmount without copying or persisting document
contents. Bill printing still mounts through `flushSync`, with cleanup registered
before the native call. The receipt component's signing, invoice binding,
eligibility, signer checks and archive writes are otherwise unchanged.

Current QR primitive and literal-true print-policy guards, `QrView` geometry,
canonical decoder and QR stylesheet remain unchanged. Existing secret-QR print
exclusions remain active. The test-only payment-evidence map supports the new
two-receipt browser case while preserving the existing empty-state, default-block
single-payment callers. The independent sweep fixture helper is untouched.

No workspace manifest, lockfile, dependency, workflow or Playwright configuration
changed. Twenty-one byte-preservation checks cover the exact donor paths and
current guards/configuration; the source delta is confined to the original 13
donor paths, including the additive registry and historical handoffs.

Independent reviewer `/root/ui_data_review/react_pages_review` approved the exact
qualified source/tree above with no preservation or compatibility blocker. The
reviewer performed source review only and made no runtime-pass claim.

## Qualification of this combined source

| Check | Actual result |
| --- | --- |
| Complete donor unit selection plus current archive-regeneration and QR-policy cases | **81 passed; nine files; zero failures/skips** |
| Full web typecheck | Passed |
| Full web typed lint, `src` and `e2e` | Passed |
| Full production web build and original bundle scan | Passed; **19 files** scanned |
| Lean production web build and original bundle scan | Passed; **17 files** scanned |
| Source preservation, ancestry and whitespace validation | Passed |

The focused selection retains the donor's seven files: `usePrintTarget.test.tsx`,
`PrintableBill.test.tsx`, and the receipt component's main, invoice, profile,
archive and i18n tests. It adds the current
`ReceiptPanel.archive.regeneration.test.tsx` and `qrKinds.test.ts` to that
selection. Every original test/assertion remains, including the hook's existing
fixed-seed lifecycle sequences. No new cases or stress/reproduction work was
introduced. Coverage was disabled for this focused subset; no full-web coverage
result is claimed.

Commands used the ordinary workspace `typecheck`, `lint` and `build` scripts.
Full and lean builds retained their complete TypeScript and original postbuild
checks. Tests used one worker. Node `24.22.3` and npm `11.19.1` reused installed
dependencies through 68 workspace links pointing to this isolated checkout.
Sixty-five package outputs were copied from `GhostPay-followups` at
`83c503f970044e1708b3a7493ee7284cd59e0844`; all package/configuration inputs
were verified equal to this task's base before and after copying. This unit
changes no package source. Checks ran sequentially with a 1024 MiB Node heap,
except full typed lint at 2048 MiB; all five commands passed on their first run.

## Native qualification remains mandatory

The donor's historical web tree is
`917f0aec9fb00324608da8f591a06029059dec2e`. Its retained completion receipts
record 54 unit tests, 19 native print/PDF cases in each profile, full/lean builds
and actual PDF readback. Those records confirm selected-receipt isolation,
long-bill pagination and white printed page margins on that donor tree. They
do **not** qualify this combined source.

No native browser or physical-printer test was run in this recovery. The
previously observed Chromium Unix-socket restriction remains; no browser
installation or sandbox workaround was attempted. Other browser engines and
physical printers are not claimed as tested.

Fresh exact-head native qualification remains required. The existing `ci.yml`
full/lean E2E matrix invokes `npm run test:e2e --workspace @ghostpay/web`; its
default desktop project includes the unchanged `e2e/print-targets.spec.ts` and
the existing flow/receipt consumers of `flowMocks.ts`. No workflow change is
needed to run the print suite. Root owns final combined review, hosted gates,
publication and main integration.

## Receipts

Complete commands, source/tree pins, preservation checks, environment provenance,
log hashes and native-gate status are in
`/workspace/scratch/f80482f352bc/receipt-print-recovery-qualification.json`.
Raw logs are alongside it:

| Log | SHA-256 |
| --- | --- |
| `receipt-print-recovery-focused-tests.log` | `3f1b53a4818c97f9374d9017533f8ee4ff90adf7b450832796d0ae6e9951fa51` |
| `receipt-print-recovery-typecheck.log` | `65249328340e32d53c1ce4dce307a434743bf21d4339fbf97b36a10251373f5e` |
| `receipt-print-recovery-build-full.log` | `a70941b569d6ceebea6b64cf2105cb0d250582184d53cfecbf3d0dff80c4381d` |
| `receipt-print-recovery-build-lean.log` | `54e632ae6c91bdbd1d2bcfb73a17f1798068e5db1defd329d474191759e968c1` |
| `receipt-print-recovery-lint.log` | `8a34a8ab941dd46847948f6beb90527aaa1793ed437165401714be6c45990485` |
