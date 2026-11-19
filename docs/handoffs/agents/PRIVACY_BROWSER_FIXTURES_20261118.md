# Privacy-default browser fixture repair — 2026-11-18

## Source and failure evidence

- Branch: `chatgpt/ghostpay-privacy-browser-fixtures-20261118`.
- Base: PR #222 head `2bc2098298d90928eb1acafad969f28316bb05fc`.
- Repaired fixture/test source: `6dc3ae7c419c8f706c11fc3d96de66e055ad165d`.
- Worker: ChatGPT recovery reviewer, Caveman workflow. Independent reviewer: ChatGPT privacy reviewer.

The coordinator's source-pinned review of [Pages run 44279444265, job 134715947261](https://github.com/djshellshoxxx/GhostPay/actions/runs/44279444265/job/134715947261)
reports **11 passed, 2 failed, 3 not run**. The job checked synthetic merge
`644a43ee6366298f418a0aca5a40ecf974871748`, not the bare #222 head. These are the prior hosted failure results;
they are not results for this repair.

The first failure expected `stealthAddress` in a signed receipt even though #222 deliberately omits that field by
default. Signature verification had already succeeded. The second failure expected the invoice envelope algorithm
to be `none`, although #222 defaults to `A256GCM`. Both failures are obsolete harness assumptions, not evidence
that either privacy default should be disabled.

## Bounded changes

The Pages journey now signs and independently verifies the minimized default receipt, checks that its address field
is absent, and checks the other original invoice/payment facts. It then clears the binding, revalidates the same
invoice, explicitly selects the address checkbox, obtains fresh signing consent and checks the original full
receipt's address and signature. Only the full receipt is archived, preserving subsequent archive/ledger counts.
Existing full-receipt assertions in the core, devnet and mocked flow suites now explicitly select that opt-in after
asserting the initial checkbox is unchecked. Their address, binding, signature and tamper assertions remain.

The amount-tamper function is extracted into `e2e/devnet/invoiceTamper.ts`. It changes only the fixed-token amount in
`none.inv` or `A256GCM.pub`, preserving the original signature. In this format, line items and memo are encrypted;
the amount is public and the AES-GCM additional data binds chain and signer. Changing the public amount therefore
still decrypts but fails the seller's signature check. The helper preserves the ciphertext, nonce and embedded key.
It explicitly refuses unsupported passphrase envelopes instead of downgrading them. No runtime cryptography changes.

The shared Pages invoice creator asserts that encryption remains checked. The main Pages journey and the negative
tamper case additionally assert `encrypted: true`. The negative case retains its invalid-signature notice, disabled
Continue control, absent prepare/send controls, zero wallet submissions, empty wallet journal, unchanged nonce and
zero raw broadcasts. It still tests an altered amount; no assertion is replaced by a generic parse failure.

The existing #222 balance-consent default would otherwise cause the next serial Pages failures after receipt repair.
Nine explicit read-button clicks were added at the existing Sweep entry/reentry setup points: four Pages, two core,
two devnet and one shared sweep helper. These match the already-reviewed #231 setup adaptation. All spend, dust,
journal and duplicate-send assertions remain unchanged.

Owned code changes are limited to five E2E specs, the Pages helper, the extracted tamper helper and its test under
`src/test`. Runtime defaults, application/library sources, package manifests, lockfile, browser configurations,
workflows, test skips and gates are unchanged. The final follow-up commit adds only this handoff and the claim milestone.

## Executed local verification

Dependencies were reused from the coordinator's installed lockfile. Six compiled package outputs came from the
`privacy-network` worktree: core-crypto, invoice-schema, chain-adapters, net-transport, scan-source and pir-two-server.
A Git source comparison against #222 was empty for all six packages; workspace links resolve inside this worktree.
The other distributions match unchanged main package sources. No dependency install or library rebuild occurred.

1. **Local RED:** after extracting the existing plain-only helper, from `apps/web`:

   ```sh
   ../../node_modules/.bin/vitest run src/test/pagesInvoiceTamper.test.ts --maxWorkers=1
   ```

   Result: **1 failed, 1 passed**, exit 1. The encrypted fixture fails with
   `Expected an unencrypted invoice fixture`; the plaintext control passes. The test-first source is commit
   `358623faf24da222172985dfa525358ba0b4b8f3` in this branch.

2. **Local GREEN:** from `apps/web`:

   ```sh
   ../../node_modules/.bin/vitest run src/test/pagesInvoiceTamper.test.ts src/components/ReceiptPanel.test.tsx src/components/ReceiptPanel.invoice.test.tsx src/components/ReceiptPanel.profile.test.tsx src/views/CreateInvoice.test.tsx --maxWorkers=1
   ```

   Result: **49/49**, five files, exit 0. The three fixture tests cover plain and encrypted amount tampering with
   actual signature verification/decryption, unchanged private facts and ciphertext, and explicit refusal of an
   unsupported passphrase algorithm. Existing UI tests cover receipt minimization/opt-in and encrypted defaults.

3. **Whole-web typecheck:** from repository root:

   ```sh
   NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/web
   ```

   Exit 0. This includes the changed E2E TypeScript files.

4. **Scoped lint:** from repository root:

   ```sh
   NODE_OPTIONS=--max-old-space-size=1536 node_modules/.bin/eslint --config eslint.config.js apps/web/e2e/core-journey.spec.ts apps/web/e2e/devnet-journey.spec.ts apps/web/e2e/devnet/invoiceTamper.ts apps/web/e2e/devnet/pages.ts apps/web/e2e/flows.spec.ts apps/web/e2e/pages-devnet.spec.ts apps/web/e2e/sweep.spec.ts apps/web/src/test/pagesInvoiceTamper.test.ts
   ```

   Exit 0. `git diff --check` also passed.

5. **Playwright discovery only:** from `apps/web`:

   ```sh
   ../../node_modules/.bin/playwright test --list --project=desktop e2e/core-journey.spec.ts e2e/flows.spec.ts e2e/sweep.spec.ts
   ```

   Exit 0: **14 tests collected in 3 files; no browser tests executed**. The separate Pages/devnet configuration was
   not supplied a fabricated devnet state merely to list tests.

6. **Independent review at exact `6dc3ae7c`:** no blocking source finding. The reviewer checked minimized/full
   receipt behavior, encrypted-default preservation, signature/amount rejection, original spend assertions and
   absence of runtime/gate changes. From `apps/web`, the reviewer ran:

   ```sh
   ../../node_modules/.bin/vitest run src/test/pagesInvoiceTamper.test.ts --coverage.enabled=false --maxWorkers=1
   ```

   Result: **3/3**, one file, exit 0, with a clean unchanged worktree. These duplicate the three author-run fixture
   tests and must not be added as unique coverage.

## Remaining gate

Local Chromium remains unavailable because of the earlier launch error `socket() failed: Operation not permitted (1)`.
No browser suite or new Pages build was run for this harness-only patch. The local tests establish fixture and existing
component behavior; they do not prove that the previously failing hosted journey now passes.

Publish as a stacked repair of the pinned #222 head, then rerun the actual Pages/devnet and affected mocked browser
suites on the resulting exact source. Retain all assertions, privacy defaults and required gates. This repair changes
no payment enablement, experimental-network scope or custody policy. No remote mutation, deployment, release or
real-funds action was performed by this worker.
