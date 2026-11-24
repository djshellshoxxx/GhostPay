# GP-BUG-08 continuation: distinct policy recovery files and verified record flows

## Source and ownership

- Parent: [PR #357](https://github.com/djshellshoxxx/GhostPay/pull/357), exact head `e871eccc1238b7145cd1d0a667afb393c373cf83`.
- Successor branch: `fix/ghostpay-policy-recovery-followup-20261121-r1`.
- Main observed unchanged at `aec179910c39081d820396409ff3139ff2264132`.
- Validation completed November 20, 2026, Pacific time. Exact commands, file hashes and retained logs are indexed in [verification.json](verification.json).
- This follows the frozen reconciliation in [#343](https://github.com/djshellshoxxx/GhostPay/pull/343). Its historical inventory remains unchanged. The implementation belongs to the existing experimental PolicyAccount browser feature; its flags and deployment admission remain intact.

The additive `ACTIVE_WORK.md` claim was recorded before product edits. This successor preserves the author's #357 branch and the shared integration coordinator's lease. The separate focus (#355), Settings (#356), and pending-send (#359) repairs already exist and are not recreated here.

## Problems and corrections

### Distinct records received identical download names

The parent distinguishes records by their complete canonical meta-address, but its download filename used a short policy-hash prefix and only a prefix of the spending public key. Two supported records sharing the policy and spending key but using different viewing keys therefore received the same filename. This creates ambiguous recovery files; the review did not establish automatic file overwriting or an authority bypass.

The filename now includes the full Keccak-256 digest of the canonical meta-address. That input binds both public keys and the policy hash. It uses existing `viem` utilities, contains no private-key input, and leaves the serialized record format unchanged. A short policy prefix remains for readability.

The regression uses the actual import and download controls. It checks distinct names for viewing-only and spending-only key changes, stable naming for a repeat export, exact Blob contents, and successful parsing back to each intended record. Before the runtime edit, the viewing-only case failed with identical filenames and the spending-only case passed. Both cases pass with the correction.

### A recovery fixture no longer exercised a new recovery

The previous limited-policy recovery test imported the same record it then tried to recover, yet still expected the newly-restored message. The parent's deliberate duplicate-record behavior made that expectation obsolete.

The corrected fixture first imports another seller's record with the same policy and nonempty limits, proves the target record is absent, restores the target using that known limits root, and verifies both records remain. A separate regression checks the already-loaded warning, absence of the newly-restored message, and absence of duplicate records. Additional selector cases vary each seller key independently while keeping the other key and policy fixed.

### Three missing catalog entries blocked CI

The parent's [failed `ts-check` job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44859160867/job/136721582754) built successfully and then failed `node scripts/i18n/check.mjs`: `policy.create.alreadySaved` was present only in English.

Arabic, Spanish and Japanese now contain that message. Structural comparison confirms these are the only catalog additions. Existing strings, metadata, security keys, fallback logic and checker rules are unchanged. The three catalogs remain explicitly marked `machine-drafted: needs native review`.

## Verification performed

| Check | Actual result |
| --- | --- |
| Catalog checker on parent | Expected failure: 3 missing-key errors, 409 warnings |
| Catalog checker after repair | Pass: 0 errors, 409 warnings |
| New download regression before runtime edit | Expected failure: 1 failed, 1 passed; failed case confirms identical names |
| Complete policy feature test directory | Pass: 247 passed, 4 skipped; 15 passing files, 1 skipped file |
| `npm run build:libs` | Pass; local workspace libraries rebuilt from this checkout |
| Web TypeScript check | Pass |
| Full web lint (`src` and `e2e`) | Pass |
| Full static web production build | Pass |
| Production bundle scan | Pass: 19 files |
| Repository secret scan | Pass |
| Whitespace check | Pass |
| Independent source review | Pass; no blocking findings; see [independent-review.json](independent-review.json) |

The four skipped cases belong to the existing real-local-contract suite, which requires Anvil and compiled contract artifacts. No gate was changed to produce these skips. The full application test suite, native-browser acceptance, contract execution, live-chain behavior and any future combined integration candidate were not newly qualified by this bounded run. Parent-head hosted passes do not transfer to the successor's new head.

Build logs retain nonfatal asset, externalization, dynamic-import and chunk-size warnings. The existing 409 catalog warnings remain visible; this change does not claim native-language approval.

## Environment provenance

Two initial `npm ci` attempts ended with status 137, and that executor's checkout later became unavailable. Work resumed from the immutable parent in a newly restored isolated checkout. An existing dependency installation with a byte-identical `package-lock.json` was copied into this checkout. All 68 workspace links resolve inside this checkout; 722 installed package versions match the lock, with no missing required packages. Twenty-four optional package entries are absent. The lock blob remains `8ce2a5bb315cd84f45d3351131de0914337224ae`.

All workspace libraries used for validation were rebuilt from the restored source. The tested tools include Node 24.22.3, Vitest 5.0.5, TypeScript 5.9.3 and Vite 8.3.5. Neither dependency declarations nor the lockfile changed.

## Integration handoff

Keep this as a draft successor targeting #357's branch. Its author or the authorized integration coordinator can incorporate the reviewed changes and qualify the resulting exact head. The shared integration lock was observed held by `994a0d214fb9-root-r3`, generation 11; an expired timestamp does not release that ownership. No shared target was advanced by this task.

The parent seller-record identity correction remains preserved. The follow-up changes download naming, three catalog leaves and focused tests; it does not change record serialization, seller authority, signing, scanning, contract code, deployment admission or the adjacent pending-send review guards.
