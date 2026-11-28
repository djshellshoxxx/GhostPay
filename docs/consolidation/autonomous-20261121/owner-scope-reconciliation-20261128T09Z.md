# 2026-11-28 09Z UTC consolidation checkpoint

Incremental evidence; not exhaustive semantic completion. Prior ledger 92881ff0668bd7d2a6bd004ab202281974f953d1. Main reverified 70458ebe3ae4a5502d7c39ae25d37342dbde971b, tree bb661db29cf79d6838156aefaa34a0f620f49c9c. Read AGENTS, STOP_WORK, WORKFLOW, HANDOFF and ACTIVE_WORK (current registry tail inspected), and atomic claims at 411c7213439fd88f7d16405d87e0afbb3f692230. Ten exclusions binding; P14 RPC disclosure retained. No new main integration.

## Candidate qualification and source review

#761 exact current-main-based head c5a4e07ce7129a525f857d7c5a4e35c44b92422e: 37 success, 3 skipped, all five workflow groups terminal success (CI 46124012136, Pages 46124011979, Beta 46124011997, Hosting 46124012010, dynamic CodeQL 46124008052). Actual web log job 140914489795 reports 14/14 mounted donor tests, 4833 passed/1 skipped web tests, 361 passed/1 skipped files; three additional separate tests passed. Full and lean E2E and Pages artifact Anvil succeeded. Published https://github.com/djshellshoxxx/GhostPay/pull/761#issuecomment-7237042457. Current-head independent review still required, previous independent review pinned to prior composition; no merge while applicable security qualification unresolved.

#765 changed to 8e0d8c6e2e0fc99e2cef3ad532e27ebe916c1a42. New helper avoids inheriting Chromium launch options in Firefox/WebKit. Independent source follow-up identified diagnostic path/version mismatch when the base config selects its existing desktop Chromium fallback but runner metadata queries Playwright's default. Exact blobs and conditional path selection in https://github.com/djshellshoxxx/GhostPay/pull/765#issuecomment-7237041403. Prior diagnostic-write/final-tail/output-reuse defects remain open; runner and reporter blobs unchanged. Owner retains fixes; no browser replay executed or mismatch observed on a real host.

#768 new PR, 2b416c0069a04241dff9925e87c99c6d04f21cfa, current-main base. Five paths: static help test, help/index/privacy HTML and ownership. Owner reports 8 Chromium tests pass on lean build with earlier crash on accessibility audit; full local web typecheck killed exit 137. Hosted checks pending; scope is core static accessibility, not excluded products. Preserve owner; check #766/#768 static guide overlap before integration. #243 updated 841ce4b7d22cf2ef48cf07e0833461fce7415ab9, old stacked base 198aa5baff22272453733a0f3dcfcac0e0994eec; latest commit updates tests/package map/claim. Not newly qualified; reconcile source against main and active Pay/signature owners rather than merge stale stack.

## Ref census and gates

860 distinct branches across nine pages, 152 open PRs across two pages. 34/34 frozen snapshots match manifest, 33/34 original refs match (same known nodata/brave-meitner-974y9e change; frozen snapshot intact). No archive writes. Lease generation 78 released at 114b43c861932dfd1b59270b8da07c4883c9a9d0; not acquired. Main branch metadata reports no required contexts; do not rely on native auto-merge. #659 and #615 confirmed merged; #614 held; #616/#617 closed unmerged. Retain historical source obligations.

| PR | Exact head | Success | Pending | Failure | Skipped |
|---|---|---:|---:|---:|---:|
|753|1d7bd4ea632b41fee8fcece68d9a8fadd2b0b9a0|42|0|0|3|
|761|c5a4e07ce7129a525f857d7c5a4e35c44b92422e|37|0|0|3|
|763|114675eb9ce1611deb0f853e8ceb0f9cdcb6c068|38|0|1|3|
|764|0ee71f2b4e82897ed0a0a1ab868f06c1d02ed5fd|41|0|0|3|
|765|8e0d8c6e2e0fc99e2cef3ad532e27ebe916c1a42|0|3|0|0|
|766|e9b14cf2762ae3249edab9dc1ecd4b4c0d904301|35|0|3|3|
|767|7534b8a656de126bf0f233912ed3b184e3cb1b60|42|0|0|3|
|768|2b416c0069a04241dff9925e87c99c6d04f21cfa|34|2|0|3|

Counts are point-in-time check-run observations, not complete workflow guarantees. Main 32/32 check runs pass; strict Mythril still red on #763. Native git ls-remote DNS failed (exit 128); no native full checkout/test performed. No production changes, main merge, force update, deployment or release gate bypass. Global unresolved semantic count remains unproven. Next: fresh independent #761 review and ownership/gates; #765 provenance and evidence integrity repair by existing owner; #768/#766 overlap and #243 semantic reconciliation; prioritize eligible unowned donor work. Physical-device and external-wallet qualification remain outstanding.
