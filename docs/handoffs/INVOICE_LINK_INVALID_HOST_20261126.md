# Invoice link invalid ASCII IDN host — 2026-11-26 UTC

Scope: bug-only repair of existing shared invoice link parser/builder. Main base `6e4d2b69cb3f280c7843ace8a059f4fe1ed49ec1`. Current main AGENTS, STOP_WORK, WORKFLOW, HANDOFF and ACTIVE_WORK inspected; no stopped product resumed. Historical #670 (dot paths/default port) is merged and its behavior is preserved. All 151 distinct open PR file inventories from overlapping ascending/descending searches inspected: no changes to either owned source or regression path. Main and latest 20 PRs rechecked immediately before the isolated branch creation. Generation-55 integration lease released at `ab1ef024593b3c058a6463de4e0a3c4fcd4c2823`; not acquired.

## Reproduction and fix
A syntactically ASCII label can be an invalid punycode host. Existing parseInvoiceLink accepts `xn--a.example`, `xn--abc.example` and `xn--0.example` with a synthetic AA fragment, and buildInvoiceLink produces a link whose host the standard WHATWG URL constructor rejects. Root cause: regex checks label shape but not browser host validity. Validate only the scheme and host using the existing platform URL constructor (no navigation/fetch, fragment never passed), reject nonidentical canonical hostname or parse failure using existing INVALID_LINK. All earlier port, path, allowlist, IP, local-dev and payload checks remain intact. No claim that this authenticates an invoice or establishes its payability.

- Original source Git blob `7da723231428f95819d8e49f4c0e38fcd0d08c04`; errors module `d15b8aa324042627c3c7d172a5b291f8d718cf46`; both locally reconstructed verbatim and hash matched.
- Ownership commit `d99f841051453468ece0d9657e0950f02b1652b9`.
- Test-first Vitest specification commit `1dc06625f2860bc13883e81f96c1266ec6c9fdc6` before production fix `3020bc70bf87f51b245e9f651c7e276f3f7e640e`.
- Repaired source Git blob `ab41f925ae7f17f9512d8a13b7d85db8ad9515d6` matches tested local file.

## Actual checks
Node 22.16.0, TypeScript 5.8.3: strict standalone compilation of the two exact modules before/after with `tsc --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --module NodeNext --moduleResolution NodeNext --target ES2022 --outDir <dir> invoice-link.ts errors.ts`, both exit 0. Directed Node assertions: original 8/12, repaired 12/12, repeat repaired 12/12 after remote commit. Four original failures are three invalid host parses and invalid host construction. Controls include valid IDN, ordinary/default/nondefault port, local dev IPv4, production IPv4 refusal, dot segment and allowlist refusal. No full checkout (git ls-remote failed GitHub DNS), no local native Vitest, lint, browser or repo-wide test pass claimed. QR classifier imports the parser; direct browser journey not executed.

## Gates
Keep draft until hosted exact-head required CI, applicable browser verification, independent review, refreshed ownership and legitimate integration lease. Do not merge or deploy before those gates; no other worker branch changes, archived refs, dependencies, contract, chain or fund interactions. Next: independently review and qualify this patch and continue already-authorized payment/recovery bug discovery. #390 is merged and its five historical head workflows are green; no submitted review found. #726 refreshed head five workflows successful, review and reconciliation remain outstanding.

## Reconciliation checkpoint — 2026-11-26 UTC

Main `b044dd452a932d3446c6155bf97e977b707c4c00`; prior qualified head `0b2649c42bec9617c05965efcc91e3067358d4a2` (five hosted workflows successful, no submitted independent review); production blob `ab41f925ae7f17f9512d8a13b7d85db8ad9515d6`, regression blob `11751a999695d5906b37c582d534152ee2513764` unchanged. Four open PRs updated since the original census cutoff checked, with no competing source changes; full refreshed census limited by connector. Preserve main registry and both parent histories. Fresh exact-head hosted CI and independent review remain outstanding; lock generation 57 released, not acquired. No local tests rerun, no main merge.
