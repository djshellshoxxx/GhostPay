# Retention generation 3: merchant invoice screen-result adapter

Base `3521ad08b9833030d8f5757361a8f942386daad3`. Acceptance amendment and ownership `afb754f1ea39da5127cc03e8915dbded0d31e205` precede the tests and implementation. Tests-only RED `5a11d2706f2fab531aadcab4acefbdcde19dee06` (tree `92fb9882fa88395afb3f7f2ec46127f9979053a2`). Tested runtime **`4cf2b4b0439f11b614cc90ab0196afa021eb1fad`**, tree **`90046258fde81a8547655e8a966f20b762f791bc`**. Branch `privacy/v11-retention-20261120`.

## Implemented boundary

Seven production lines in `apps/web/src/components/MerchantTemplateIssuer.tsx` reuse `useInvoicePreviewRetention` and `MetadataRetentionControls`. Only a completed result that matches the current seller session, signer authority and selected template is registered. Its clear callback compares the current result object before removing it. Existing generation/session guards, custody checks and the signing builder stay unchanged. The existing MerchantProfilePanel also keys the issuer by signed profile, selected template and requested amount, so replacing those inputs remounts the issuer.

The new adapter clears the displayed generated link and Copy action. Editable asset/amount/fee settings, the original signed profile, seller keys/custody, saved invoices and protected journal/storage data remain outside its callback. Shared links are not revoked. No pending generation is registered, cancelled or restarted by cleanup. Unmount withdraws ownership, and an old result's confirmation/age cannot clear a replacement.

There is no new storage collection, dependency, external copied code, locale key, crypto, fee, protocol, network or gate change. Reuse is the existing application registry/identity hook/control module; its strict preference parser and all generation-2 disposal/capacity protections remain intact. No persistent adapter or transaction-finality inference was added.

## Executed evidence

| Check | Actual result |
|---|---|
| Tests-only original-config regressions | **3 failed**, zero passed/skipped, one file, exit1,4.62s. Missing merchant cleanup controls and missing completed-result registration were the intended assertions. |
| Final original-config focused selection | **29 passed in6complete files**, zero failures/skips, exit0,9.71s. |
| Repository secret scan | Passed, exit0. |
| Working-tree and complete feature-range whitespace checks | Passed, exit0. |
| Full typing, typed lint, coverage, browser and hosted gates | Not run by this worker; coordinator-scheduled, remain open. |

The new three real-component tests issue and parse actual signed merchant invoices. They exercise preview/cancel/confirm, exact preserved draft/profile/custody/journal state and still-valid shared links; a held custody read during replacement, stale cleanup authority and replacement expiry; and late issuance after unmount. Services refuse network/RPC and the tests verify none is used. Expiry uses a controlled Date and the existing focus refresh, not an actual five-minute browser wait. Original registry, controls, CreateInvoice, merchant builder and issuer tests run alongside them. The new three are included in the29, not additional coverage.

An unnecessary version-only probe used an apps/web-relative executable from the repository root and exited127; no tests ran in that probe. Both RED and GREEN used the correct apps/web cwd and original Vitest configuration. Complete unmodified logs, SHA-256 hashes and exact commands are in [retention-gen3/evidence.json](retention-gen3/evidence.json).

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/components/MerchantTemplateIssuer.retention.test.tsx src/components/MerchantTemplateIssuer.test.tsx src/lib/merchantTemplate.test.ts src/lib/metadataRetention.test.ts src/components/MetadataRetentionControls.test.tsx src/views/CreateInvoice.retention.test.tsx --coverage=false --maxWorkers=1
```

## Remaining scope and fresh successor assignment

This is a **generation-3 bounded implementation milestone**, not M3 release qualification or completion of issue #287 item4. Both CreateInvoice and MerchantTemplateIssuer now have a presentation adapter; persistent invoice/transaction retention and terminal-transaction cleanup remain open. Keep the protected-store decisions in the generation-2 census.

Fresh successor: start at this exact head or the coordinator's reconciled descendant, claim owned paths, and independently review the seven-line adapter plus three real-issuer regressions. Reconcile the narrow additions with the separately reviewed merchant metadata-minimization branch; preserve its mode state, unsigned-field transformation and pending-generation invalidation. Do not copy an entire older issuer component over newer work. Confirm cleanup preserves the selected metadata mode and existing profile/session/backup requirements.

Run original scoped typing/lint and real browser preview/confirm/expiry/unmount/session-replacement checks in the coordinator's quiet resource window, followed by the exact-source combined release gates. Record actual results and all resource failures/skips. A new persistent or transaction adapter still requires a field-level nonessentialness proof, current-record authority and revision-bound transactional confirmation; age, a returned hash or a status name is insufficient. Do not create sensitive storage merely to demonstrate cleanup. No remote push, merge, deployment or release is authorized by this handoff.

Source ownership is released after this evidence commit. Only the coordinator's three prepared dependency symlinks remain untracked; no test process remains.
