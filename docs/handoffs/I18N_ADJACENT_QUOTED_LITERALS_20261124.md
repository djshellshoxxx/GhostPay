# Adjacent ICU quoted literal corruption — BUG ONLY — 2026-11-24 UTC

## Source-pinned evidence
- Base main: `03695a7bbb2ad178a729da612bc578ed9a42c4d7`.
- Branch: `automation/20261124/bug/i18n-adjacent-quoted-literals-r11`.
- Additive ownership claim: `59992a3030afaaddfca6cda5905800ecdd5bdeb8`.
- Regression-first commit: `04a6c103567686b794a879657226f0bdb003a76c`.
- Production repair: `ab5e264b834d74d6d5ea5648f475f26dec68fffc`.
- Original source blob: `53a1c3f90af103df6e40f6d86f515b7e9ca7b988`.
- Repaired source blob: `410149f92c4335649ef86e68ee3561935e10d689`.
- Regression test blob: `58cbf8e4a7f4b3518fc9e656711ab9eccadd5f8c`.

## Reproduction and root cause
The existing parse/stringify round-trip contract is violated when a text node contains consecutive quoted ICU syntax. Parsing the message `'{}'` produces text `{}`; the old serializer emits `'{''}'`, which reparses as text `{'}`. Adjacent individually quoted characters create a doubled-apostrophe escape at the boundary. Quoted pound inside plural branches and adjacent literal apostrophes have the same defect. The smallest fix maintains a quote-run state, doubles literal apostrophes as before, and closes a run before ordinary text or at its end. No parser, formatter, message grammar, dependencies, features or interfaces changed.

## Actual execution
Fetched both original source and committed regression file by the regression commit SHA. Independently recomputed their Git blob SHA-1 over UTF-8 bytes plus Git blob header; both matched. Executed the extracted actual MessageSyntaxError, parser, style constants and serializer in V8 after erasing their TypeScript-only annotations. Extracted the 14 committed regression inputs directly from the regression blob. Original 5/14 passed, 9 failed. Repaired candidate 14/14 passed. Exhaustively enumerated 3,905 nonempty strings of length 1–5 over brace, closing brace, pound, apostrophe, and ordinary letter, each in top-level text and plural text contexts; original 2,916/7,810 passed, repaired 7,810/7,810 passed. The candidate's recomputed Git blob hash matched the subsequently committed source blob and its readback. This is a source-hash-matched isolated executable probe, not a full repository Vitest or native browser run. Git checkout failed DNS resolution (git ls-remote); installed local Node 22.16.0 and TypeScript 5.8.3 were not used for these V8 probes. No dependency installation or full local package build/lint/typecheck was possible.

## Ownership and integration
All 237 open PR changed-file inventories from the date-partitioned snapshot through #622 were checked, plus one extra #458 lookup. No selected production or new regression file collision. Existing message.test.ts has six open PR owners (#224, #238, #262, #264, #278, #372), untouched. Main registry had no matching source claim. Main remained at the base and today's open-PR list unchanged when rechecked after production commit. PR #390 is already merged (merge SHA 377c0216d451f1576f199ec0223aafadd9243002); exact head b655bc273a6704c9c140287b8adcdf4085b91882 had five successful Actions workflows and Snyk; no submitted independent GitHub reviews observed. Existing owner untouched. Integration lock commit aab7f8c070c91a9def87479defd39fcfa6441e0b records generation 19 released; no acquisition by this worker. No independent verifier available in this execution environment. Keep draft until exact-head required hosted CI, applicable native browser verification, genuine independent review, refreshed ownership and legitimate integration lease are satisfied. No merge, deployment, release, funds or contract interaction.

## Next task
Qualify this isolated fix in hosted CI. The unrelated large-bigint plural precision issue remains unmodified; do not conflate it with quoted text serialization or claim it fixed. Recheck source ownership before any subsequent bug.
