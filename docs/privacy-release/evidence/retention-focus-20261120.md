# Retention preference focus reconciliation

## Outcome and source

A returning tab now reconciles the effective invoice or proof preview preference even when it missed the storage notification. The control updates its displayed value and withdraws an open manual confirmation if that effective value changed. A current confirmation survives focus when the effective value is unchanged. Denied or malformed reads use the existing off fallback.

The listener only reads the current category's preference and updates control state. It never writes storage, confirms a plan or invokes a cleanup callback. Existing opted-in expiry behavior remains in its original hook; registration identity, timing, receipt exports and every persistent record remain unchanged. **Persistent invoice/transaction and terminal-record retention is still partial and unimplemented.** The existing protected-store census supplied no new positive nonessentialness proof, so this follow-through completes the accepted preference-concurrency criterion instead.

| Checkpoint | Commit | Tree |
| --- | --- | --- |
| Published PR #326 base | `a34ce43e296e302e3e65ed077ea8ac892c5189a1` | `b277d0b71b0b6d9242d2d36cdfcadc3b1296f5d3` |
| Contract and ownership before tests | `88d78a91aa92b72974c9444fccfb5013dbf263df` | Recorded in git |
| Tests-only RED | `5961e0e936357d761aa26f538b59800d01bafead` | `2065233c1b4255ec723d8c01a1bb118dfd4af966` |
| Reviewed and qualified runtime | `acd584f07e0636697f5ecc0067dafc52c262727d` | `db63b8cfbb47e44cc0063c91dd93fcb36f0fd009` |

Branch: `feature/ghostpay-retention-focus-20261120`. The only production change is nine added and two removed lines in `apps/web/src/components/MetadataRetentionControls.tsx`. The control owns and removes its exact focus listener; its existing scope-keyed child prevents an old category from carrying preference or manual approval into a replacement category. No dependency, translation, storage format, expiry adapter, policy registry or protected-store API changes.

## Controlled verification

| Execution | Source | Result |
| --- | --- | --- |
| Two complete affected control/proof files before runtime | `5961e0e9` | **24 passed, nine expected failures, zero skipped; exit 1** |
| Five complete affected files after independent review | `acd584f0` | **51 passed, zero failures/skips; exit 0** |
| Original full web TypeScript | `acd584f0` | **Passed**, exit 0; 21.297 seconds |
| Original full web typed ESLint | `acd584f0` | **Passed**, exit 0; 62.505 seconds |
| Original committed-secret scan | `acd584f0` | **Passed**, exit 0 |
| Published-base to runtime whitespace check | `acd584f0` | **Passed**, exit 0 |

The RED failures reproduce stale effective values for both categories, denied/malformed-read fallback, category replacement, missing observer cleanup and the real proof component. The unchanged-policy controls already passed. The GREEN selection contains the 13 registry tests, 14 control tests, 19 proof tests, one actual CreateInvoice retention case and four merchant retention cases. The earlier RED selection is a subset, not an additional count. Existing assertions were retained.

The controlled regressions cover missed cross-tab events, unchanged effective policy, another category's independent preference, denied and duplicate-key malformed reads, replacement of the category, actual unmount/remount persistence, listener disposal and retained proof text, exact hash and receipt-copy/download actions. A fresh explicit confirmation can still close the proof after an external automatic-policy revocation.

Focused GREEN command, from `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=512 ../../node_modules/.bin/vitest run src/lib/metadataRetention.test.ts src/components/MetadataRetentionControls.test.tsx src/components/PaymentProofQr.retention.test.tsx src/views/CreateInvoice.retention.test.tsx src/components/MerchantTemplateIssuer.retention.test.tsx --coverage=false --maxWorkers=1 --reporter=json --outputFile=/workspace/scratch/994a0d214fb9/retention-focus-green.json
```

Original full commands, from the repository root, ran sequentially with `NODE_OPTIONS=--max-old-space-size=1536`:

```sh
npm run typecheck --workspace @ghostpay/web
npm run lint --workspace @ghostpay/web
```

The [execution index](retention-focus-20261120/evidence.json) records exact argument arrays, sources, timestamps, counts, exit codes and hashes. The same directory preserves complete original JSON reporters and command output. Stdout artifacts use JSON text wrappers; decoding the `text` field as UTF-8 recovers every original byte, including trailing blank lines. The index distinguishes the original-output hash from the wrapper-file hash. No test retry, assertion relaxation, suppression, threshold reduction or test/configuration exclusion was used.

Final evidence QA initially flagged the original npm stdout's trailing blank lines in two text artifacts. The files were wrapped without trimming their contents, and the full source-range whitespace check was repeated after that documentation-only correction. The initial exit 2 and exact diagnostics remain in the index; runtime qualification was not rerun or changed.

## Independent review and dependency basis

`/root/ci_triage_r2` independently reviewed immutable `acd584f0` before GREEN. The reviewer found no blocking issue: current-category read, changed-policy invalidation, unchanged-policy preservation, scope replacement and exact-listener cleanup match the bounded acceptance contract. The reviewer also checked that the callback has no storage write or cleanup call and that the expiry hook, registry and protected records are untouched. This was source review and a whitespace check, not another test execution.

The worktree reused its prior installation. Its previous reviewed local source `8833c56df0fbc791fcb69784cfc69724b3e672db` has the exact same complete tree as published base `a34ce43e`. Package, lockfile, ESLint and web TypeScript configuration bytes remain unchanged; their hashes are recorded. No installation, dependency copy, local package rebuild or new build qualification is claimed.

## Handoff and remaining work

Source ownership is released after the report checkpoint. Root owns publication and integration; the intended isolated PR stacks on PR #326's published branch. Preserve the contract-before-tests-before-runtime history and refresh the base before promotion. PR #326, canonical v1.1, main and the integration lease were not changed by this worker.

The broader v1.1 full coverage/nocov, build/CSP/bundle, actual browser/wallet, hosted and release qualification stays open. The established browser restriction was not bypassed or retried. This bounded follow-through adds no persistent deletion policy, transaction-finality claim, new sensitive collection, deployment or release. Further persistent retention still requires a real disposable field, positive nonessentialness proof and current-revision confirmation inside its storage transaction, as specified in the [eligibility census](retention-gen2-census.md).
