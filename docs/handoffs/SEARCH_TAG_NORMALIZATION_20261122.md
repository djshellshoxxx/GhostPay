# Address-book tag-filter normalization — source-pinned bug-only handoff

Recorded: 2026-11-21 Pacific / 2026-11-22 UTC
Repository: `djshellshoxxx/GhostPay`
Exact base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`
Task branch: `automation/20261122/bug/search-tag-normalization-r1`
Owner: ChatGPT sequential bug worker; **no independent reviewer**.
Owned paths: `packages/ux-vault/src/search.ts`, new `packages/ux-vault/src/search.tag-normalization.test.ts`, an additive claim at `docs/ai/ACTIVE_WORK.md`, and this new handoff. Do not change existing `contacts.test.ts` (claimed in broad unrelated PRs).

## Confirmed bug

Saved contact tags pass through `normalizeTag` in `packages/ux-vault/src/contacts.ts`: `raw.normalize('NFKC').trim().toLowerCase()`. By contrast, `searchContacts()` in `packages/ux-vault/src/search.ts` previously used only `tag.trim().toLowerCase()` for `opts.tags`. As a result, a stored `work` tag is not found by searching tag `ＷＯＲＫ`, `ｗｏｒｋ`, or a padded fullwidth form, despite these all being accepted and normalized as `work` when saving a contact. This is a reproducible existing address-book filtering defect, not a custody or chain exploit.

Main source Git blob `568db97dc1400374b24d3418fbd0f5f173224bc3` matched the locally executed verbatim `search.ts` via `git hash-object`. Node v22.16.0 executed that exact TypeScript module with `--experimental-strip-types`. Baseline comparisons for ASCII `work` and `WORK` succeeded, but `ＷＯＲＫ` returned an empty list where `['Alice']` was required (exit 1: Node AssertionError).

## Test-first repair

1. Isolated branch created from exact main; initial coordination claim committed as `fe480479fef3dba9892f3c17d39b5caa2fb7c531`.
2. Two scoped Vitest test cases committed **before the source fix**: `757a316d9eff46db0f393b25f8584623cee7a085`. They assert Unicode-equivalent tag filters, AND semantics, network and text restrictions, and unchanged input/storage.
3. Minimal one-line production repair committed: `0917988989efef6f49b769225d8a7a3618cf7db9`, adding `.normalize('NFKC')` to tag-filter preparation. Contact storage, query/other filters, sorting, schema, UI, dependencies, and payment behavior are not changed.
4. Exact repaired `search.ts` Git blob `e7759408a583f1845a87ec88f2941f2cef1271d1` matched the locally executed file.

## Actual verification and limitations

- Initial source-matched Node 22 baseline: five normal controls passed, one Unicode equivalence assertion failed as intended.
- Repaired source-matched Node 22 focused reproduction: **8/8 passing** (including normal and Unicode filters, AND, network, query behavior).
- Repaired source-matched Node 22 adversarial/deterministic expansion: **4,029/4,029 passing**, including 4,000 case-width combinations, retained order, multiple required tags, network and text filters, and unchanged `listTags` output.
- Standalone TypeScript 5.8.3 compilation for verbatim `search.ts` with isolated `Contact`/`AddressBook` declarations: **passed**. This is not the repository's TypeScript 5.9 workspace check.
- Repository checkout, actual Vitest regression execution, full workspace coverage, lint, native browser E2E and complete hosted CI: **NOT executed locally** because the execution container cannot resolve `github.com`. Hosted exact-head qualification must still run.
- Independent source review and GitHub approval: **NOT completed**. Node source-equivalent tests are not an independent review.

## Ownership, safety and integration

At task discovery, the created-ascending and created-descending open-PR inventories were united into **192** distinct open PR numbers; all 192 changed-file inventories were inspected. None claimed either the edited source or the new test path. Separate broad PRs do claim `packages/ux-vault/src/contacts.test.ts`, which remains unmodified. Re-check the PR inventory, main SHA and lock immediately before any integration.

The separate `automation/ghostpay-integration-lock` branch currently records generation **11**, `status: held` with owner `994a0d214fb9-root-r3`. Its expiry timestamp does **not** authorize self-assignment. No integration claim, lock mutation, main merge, deployment, release, dependency change, contract invocation, external network attack or real-funds operation was performed.

Next verifier: run actual exact-head GitHub Actions CI (including ux-vault Vitest/coverage, lint, typecheck, full/lean static browser qualification), have a genuinely independent reviewer inspect the one-line change and new tests, resolve any confirmed failures on this isolated branch, and only integrate with authorized lock ownership and all applicable gates green.
