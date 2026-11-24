# Resumed i18n completeness validation — 2026-11-24

## Completed scope

Resumed the locale-completeness finding left at source inspection in the earlier credit-exhaustion recovery pass. `checkCatalogs` previously overwrote catalog entries that canonicalised to the same locale. For example, `en` and `EN` could silently replace required base keys. Runtime `createI18n` already rejected the same input.

The checker now uses the same canonical identity and existing typed `bad_locale` error before inserting a duplicate. Distinct regional and script locales still produce their canonical report names. No payment, translation, network, cryptographic, dependency-manifest or release behavior was changed.

## Source and ownership

- Main base: `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
- Local regression commit: `0b4c630f`.
- Reviewed application/test commit: `f0acc09909a8656c9a041b872d1364b1e0912a44`.
- Reviewed tree before this evidence-only addition: `f5f0933f71b0b6443957a8ac4e0111c497a56d97`.
- Branch: `resume/ghostpay-i18n-completeness-20261124`.
- All four pages of the open-PR collection were read: 343 PRs. Complete changed-file lists were retrieved for all 343 with no errors. None changes `packages/i18n/src/completeness.ts` or the new regression file. Existing i18n changes in #561/#506 concern negotiation; #372/#238/#262/#224/#264/#278 concern formatting; #493/#87/#253 concern package versions. Their source paths remain unchanged.
- Main `AGENTS.md` and `docs/ai/{WORKFLOW,HANDOFF,ACTIVE_WORK}.md` were read before edits. The new claim is additive.

## Executed verification

The focused new suite on unchanged production source reproduced **6 failures and 2 passing controls**. The final source passed **223/223 tests in 13 files**, with the original coverage thresholds intact: statements 99.82%, branches 96.90%, functions 100%, lines 100%.

Commands from `packages/i18n`:

```sh
npm exec --workspaces=false -- vitest run src/completeness.duplicate-locale.test.ts --maxWorkers=1
npm test --workspaces=false -- --maxWorkers=1
npm run build --workspaces=false
npm run typecheck --workspaces=false
npm run lint --workspaces=false
```

Build, typecheck and lint passed. Repository `bash scripts/scan-secrets.sh` and `git diff --check` passed. Independent worker `/root/resume_package_qualification` reviewed the exact application/test commit, compared its error behavior with `createI18n`, and reran all eight new cases successfully without changing source. No blocking findings were reported. This is an independent AI-assisted engineering review, not a submitted GitHub approval.

The new cases cover duplicate language, region and script spellings, both insertion orders, base replacement, identical duplicate catalogs, typed error parity, valid distinct locales, and unchanged missing-base/invalid-locale errors.

## Environment and remaining gates

Node 24.22.3; Vitest and coverage-v8 5.0.5; TypeScript 5.9.3; ESLint 10.15.0; typescript-eslint 8.73.0. Package dependencies were installed without scripts using its unchanged declarations; root-declared fast-check 4.10.2 was installed locally without saving a manifest change. The first full-suite/typecheck attempt exposed that missing root test dependency; it was installed before the successful rerun. An initial test-only lint error in an asymmetric-matcher variable was corrected before final qualification.

Full repository installation, application/browser suites, hosted CI and main integration are not claimed by these package results. GitHub publication must verify that its tree matches the local final tree. Recheck live source, overlaps, required checks and integration ownership before merging. The package repair is complete locally; promotion remains a separate gate.

