# C1 — combined fast-track integration ledger (2026-11-23)

Coordinator: Claude `claude-determined-allen-x5n560`. Branch `nodata/determined-allen-x5n560`.
Base main at start: `8ddb344973e80b8e1eda6821e970ee6a2b808b29` (fetched 2026-11-23 ~09:20 UTC).
Inventory at start: 568 remote branches, about 260 open PRs (79 targeting `main` on the first two API pages).

## Method

1. Listed open PRs, then computed locally for each: ahead/behind vs main, changed files, and a `git merge-tree` dry merge onto main.
   Almost every "conflict" was only `docs/ai/ACTIVE_WORK.md` (each worker prepends a claim).
2. Fast-track set (C1-T1): small, single-purpose fix PRs targeting `main`, plus their stacked repair children
   (lint/typing/test repairs whose base is the parent's branch). Excluded: P0-A stack, dependency bumps,
   docs-only censuses, large consolidations and feature stacks.
3. Independent review: 11 Claude reviewer subagents, read-only, each over one package-grouped batch, judging
   defect reality, fix correctness, test value (red before, green after), no weakened invariant, no scope creep,
   compatibility with current main, and duplicate/stack decisions. Reviewers did not author any change.
   The lead separately checked the one signing-path change (#375 EIP-712 digest rebuild: field order equals
   `PolicyAccount.sol` `WITHDRAW_TYPEHASH`).
4. Integration: each approved head merged `--no-ff` in ascending PR order (parents before stacked children), so
   GitHub can mark main-based PRs merged and provenance is preserved. `docs/` conflicts resolved with
   `git merge-file --union`; no source conflict was resolved by hand except the #416 port below.
5. Per-PR exact-head CI: GitHub search `status:success` reported green for 42 of the 92 C1-T1 PRs; the other 50
   never ran hosted CI. The combined head's local checks and exact-head hosted CI are the gate for all of them.

## Integrator repairs on the combined branch (not in any donor)

| Commit subject | Why |
|---|---|
| `test(hygiene): type negative bufferDust tuples so #480 regression typechecks` | #480's test failed `tsc` (TS2556) |
| `fix(lint): satisfy strict lint in integrated #332, #481, #490 and #503` | `no-unsafe-*` / `require-await` errors in PRs that never ran CI; behavior and assertions unchanged |
| `fix(web): port #405/#416 runtime guards for formatUnix and formatCountdown` | #416 head drags #384's superseded `parseUnits` hunk; only the #405/#416 deltas are ported |

## Dispositions

Verdicts: APPROVE = merged here; CONTAINED-IN-#N = its commits arrive through stack tip #N; SUPERSEDED-BY-#N = not
merged, the named PR carries an equivalent or better fix; PORT = deltas ported by hand; CHANGES/REJECT = not merged.

| PR | Source head | Review batch | Verdict | Per-PR exact-head CI | Note |
|---|---|---|---|---|---|
| [#265](https://github.com/djshellshoxxx/GhostPay/pull/265) | `c591b54078fe` | R1 | APPROVE (high) | not run | canonical JSON sparse/decorated arrays rejected; JSDoc literal \n nit |
| [#301](https://github.com/djshellshoxxx/GhostPay/pull/301) | `7523da612ba3` | R2 | APPROVE (high) | not run | parseUnits runtime guard; covers 0/36 bounds |
| [#305](https://github.com/djshellshoxxx/GhostPay/pull/305) | `87cf6c603338` | R3 | APPROVE (high) | not run | noncanonical ERC-20 bool -> unavailable |
| [#313](https://github.com/djshellshoxxx/GhostPay/pull/313) | `c48c9917708e` | R1 | APPROVE (high) | green | parseDecimal maxScale integer guard |
| [#314](https://github.com/djshellshoxxx/GhostPay/pull/314) | `e6ed3ee64a78` | W2C | APPROVE (med) | not run | single-flight vault-write ownership, cancellable unlock |
| [#315](https://github.com/djshellshoxxx/GhostPay/pull/315) | `7e1a189c065f` | R3 | APPROVE (high) | not run | test sync only |
| [#316](https://github.com/djshellshoxxx/GhostPay/pull/316) | `e0c583be2514` | W2B | CHANGES (med) | not run | ReceiptPanel conflict + usePrintTarget stuck-state if afterprint never fires / null target |
| [#317](https://github.com/djshellshoxxx/GhostPay/pull/317) | `caa4bd7e3465` | R3 | APPROVE (med) | not run | tag list chain/session scoping |
| [#319](https://github.com/djshellshoxxx/GhostPay/pull/319) | `627ab977c9cc` | W2C | SUPERSEDED-BY-314 (med) | not run | smaller overlapping fix; conflicts with #314 |
| [#328](https://github.com/djshellshoxxx/GhostPay/pull/328) | `81598d93dd82` | R6a | APPROVE (high) | green | rekey cannot resurrect locked session |
| [#332](https://github.com/djshellshoxxx/GhostPay/pull/332) | `71632fa389ae` | R3 | APPROVE (high) | not run | receipt archive generation binding |
| [#337](https://github.com/djshellshoxxx/GhostPay/pull/337) | `08d2111a5fd3` | R3 | APPROVE (high) | green | no false popup-blocked for noopener |
| [#338](https://github.com/djshellshoxxx/GhostPay/pull/338) | `692cac58b1c3` | R3 | APPROVE (high) | not run | silent-payment sweep preview network check |
| [#339](https://github.com/djshellshoxxx/GhostPay/pull/339) | `d03600ca87c7` | R7 | APPROVE (med) | not run | Transfer log emitter/range/event binding + dedupe |
| [#340](https://github.com/djshellshoxxx/GhostPay/pull/340) | `b86a3e6affe8` | W2B | CONTAINED-IN-369 (high) | not run | TRON genesis |
| [#345](https://github.com/djshellshoxxx/GhostPay/pull/345) | `ccc8c3521511` | W2A | CONTAINED-IN-385 (high) | green | ancestor of #374 |
| [#347](https://github.com/djshellshoxxx/GhostPay/pull/347) | `95e60ce4948b` | R7 | APPROVE (high) | not run | test lint only (child of 339) |
| [#350](https://github.com/djshellshoxxx/GhostPay/pull/350) | `89b3572f7e60` | R3 | APPROVE (high) | green | shared-router warning needs distinct announcement id |
| [#357](https://github.com/djshellshoxxx/GhostPay/pull/357) | `e871eccc1238` | W2A | CONTAINED-IN-385 (high) | not run | GP-BUG-08 seller identity; alone breaks locale parity |
| [#360](https://github.com/djshellshoxxx/GhostPay/pull/360) | `2844ec6c22fe` | R1 | APPROVE (high) | not run | pctEncode rejects lone surrogates |
| [#362](https://github.com/djshellshoxxx/GhostPay/pull/362) | `67542c09ba18` | W2A | CONTAINED-IN-385 (high) | not run | locale parity + per-seller filenames |
| [#368](https://github.com/djshellshoxxx/GhostPay/pull/368) | `18d0442a1561` | W2A | CONTAINED-IN-385 (high) | green | security-key classification |
| [#369](https://github.com/djshellshoxxx/GhostPay/pull/369) | `500ece7a7c99` | W2B | APPROVE (med) | green | selected-network genesis binding |
| [#370](https://github.com/djshellshoxxx/GhostPay/pull/370) | `3d57d9881033` | R1 | APPROVE (high) | green | pctEncode typeof guard (child of 360) |
| [#374](https://github.com/djshellshoxxx/GhostPay/pull/374) | `821700d172dc` | W2A | CONTAINED-IN-385 (med) | not run | asset-coverage guard; untranslated placeholders nit |
| [#375](https://github.com/djshellshoxxx/GhostPay/pull/375) | `2e0aff849008` | W2A | CONTAINED-IN-385 (med) | not run | strict calldata decode + EIP-712 digest rebuild; lead verified field order vs PolicyAccount.sol |
| [#379](https://github.com/djshellshoxxx/GhostPay/pull/379) | `31b943bbc5bc` | R1 | APPROVE (med) | green | pctDecode/parseQuery guards + buildQuery KEY check (child of 370) |
| [#384](https://github.com/djshellshoxxx/GhostPay/pull/384) | `f3e554077749` | R2 | SUPERSEDED-BY-301 (high) | green | identical guard; extra fiat commits net no source change |
| [#385](https://github.com/djshellshoxxx/GhostPay/pull/385) | `d981b19ff34c` | W2A | APPROVE (high) | not run | stack tip: test-only + anvil adjustment |
| [#387](https://github.com/djshellshoxxx/GhostPay/pull/387) | `63d5a0d0d1b0` | W2B | APPROVE (med) | not run | responsive RPC layout |
| [#388](https://github.com/djshellshoxxx/GhostPay/pull/388) | `0d1193014e3a` | R7 | APPROVE (med) | green | formatMinor exponent 0..18 |
| [#389](https://github.com/djshellshoxxx/GhostPay/pull/389) | `b5045aec4768` | R2 | CHANGES (med) | not run | https-only/no-prefix fragment extraction is UX narrowing needing product sign-off |
| [#390](https://github.com/djshellshoxxx/GhostPay/pull/390) | `b655bc273a67` | R2 | APPROVE (med) | green | bounded display escaping 4096 cap |
| [#392](https://github.com/djshellshoxxx/GhostPay/pull/392) | `cd1ddb7d6efd` | R3 | APPROVE (high) | not run | QR capacity lone surrogate rejection |
| [#393](https://github.com/djshellshoxxx/GhostPay/pull/393) | `d283116dfcf3` | R7 | APPROVE (high) | green | CSV formula after mixed whitespace/BOM neutralized |
| [#395](https://github.com/djshellshoxxx/GhostPay/pull/395) | `1edc524e6955` | W2C | CONTAINED-IN-412 (high) | not run | self-check feature base |
| [#398](https://github.com/djshellshoxxx/GhostPay/pull/398) | `7b1d10fdd955` | R7 | APPROVE (high) | not run | signWebhook refuses timestamps verifier rejects |
| [#399](https://github.com/djshellshoxxx/GhostPay/pull/399) | `b2c7e8005160` | R6a | APPROVE (high) | not run | maxLifetime NaN/negative fails closed |
| [#402](https://github.com/djshellshoxxx/GhostPay/pull/402) | `3c9b96d0a10a` | W2C | CONTAINED-IN-412 (high) | not run | typing delta |
| [#404](https://github.com/djshellshoxxx/GhostPay/pull/404) | `699c8db24451` | R7 | APPROVE (high) | not run | CSPRNG range to 2^256, unbiased rejection sampling |
| [#405](https://github.com/djshellshoxxx/GhostPay/pull/405) | `11117b9fff06` | W2B | CONTAINED-IN-416 (high) | not run | formatUnix guard |
| [#406](https://github.com/djshellshoxxx/GhostPay/pull/406) | `506604288e31` | R7 | APPROVE (med) | not run | POS clock/amount guards; needs #411 |
| [#407](https://github.com/djshellshoxxx/GhostPay/pull/407) | `24caac5117f7` | R4 | APPROVE (high) | green | UndoQueue maxPending integer guard |
| [#409](https://github.com/djshellshoxxx/GhostPay/pull/409) | `8d55b4e39be4` | R4 | SUPERSEDED-BY-458 (high) | green | identical src change, weaker tests |
| [#411](https://github.com/djshellshoxxx/GhostPay/pull/411) | `482d36ad436f` | R7 | APPROVE (high) | green | parity test expiry boundary corrected (child of 406) |
| [#412](https://github.com/djshellshoxxx/GhostPay/pull/412) | `087ecf7e17f7` | W2C | APPROVE (high) | green | local-only self-check; locales at parity |
| [#413](https://github.com/djshellshoxxx/GhostPay/pull/413) | `de3d45ff5954` | R5 | APPROVE (med) | not run | longest-token separator parsing |
| [#415](https://github.com/djshellshoxxx/GhostPay/pull/415) | `8d3dd35c6d7e` | R5 | APPROVE (high) | green | summary period validation |
| [#416](https://github.com/djshellshoxxx/GhostPay/pull/416) | `5d3e21617a8a` | W2B | PORT (high) | green | countdown/unix guards correct; head conflicts in format.ts via #384 hunk; port deltas |
| [#417](https://github.com/djshellshoxxx/GhostPay/pull/417) | `a5d062d3e2ec` | R6b | APPROVE (med) | green | EVM checksum-case false pay-again block |
| [#418](https://github.com/djshellshoxxx/GhostPay/pull/418) | `93095a796a52` | R4 | APPROVE (med) | green | stale probes -> unknown |
| [#419](https://github.com/djshellshoxxx/GhostPay/pull/419) | `62dcc695ae3f` | R2 | SUPERSEDED-BY-422 (high) | green | same fix; test contradicts #390 cap |
| [#420](https://github.com/djshellshoxxx/GhostPay/pull/420) | `0e6b5491bbb3` | R5 | APPROVE (high) | green | weekly occurrences bounded by max year |
| [#421](https://github.com/djshellshoxxx/GhostPay/pull/421) | `55106dad616d` | R5 | APPROVE (high) | green | urgency validation |
| [#422](https://github.com/djshellshoxxx/GhostPay/pull/422) | `f846464db3cb` | R2 | APPROVE (high) | green | composes #419 pair-cut on #390; superset tests |
| [#423](https://github.com/djshellshoxxx/GhostPay/pull/423) | `e8afa1d2297b` | R5 | APPROVE (high) | not run | sweep privacy options validation (child of 421) |
| [#424](https://github.com/djshellshoxxx/GhostPay/pull/424) | `ea2719992e44` | R6a | APPROVE (high) | green | explicit :443 / empty port rejected in deep links |
| [#425](https://github.com/djshellshoxxx/GhostPay/pull/425) | `ec3c7d9bf304` | R5 | APPROVE (high) | green | test strengthened (child of 423) |
| [#426](https://github.com/djshellshoxxx/GhostPay/pull/426) | `61d7fc56c98e` | R6b | APPROVE (high) | green | mixed-case truncated EVM receipt tail |
| [#429](https://github.com/djshellshoxxx/GhostPay/pull/429) | `3ec919bace3e` | R6b | APPROVE (high) | green | onboarding quiz reset requires forced review |
| [#430](https://github.com/djshellshoxxx/GhostPay/pull/430) | `ffdf6adc34dc` | R6a | APPROVE (high) | green | pending-reference kind allowlist |
| [#431](https://github.com/djshellshoxxx/GhostPay/pull/431) | `11b71fc9b0c6` | R2 | APPROVE (high) | green | settings basis deep copy |
| [#432](https://github.com/djshellshoxxx/GhostPay/pull/432) | `378646538934` | R7 | APPROVE (high) | green | meta fingerprint lone surrogates rejected |
| [#433](https://github.com/djshellshoxxx/GhostPay/pull/433) | `88ab4b971e14` | R4 | APPROVE (high) | green | label truncation drops lone high surrogate |
| [#434](https://github.com/djshellshoxxx/GhostPay/pull/434) | `6cce62fe107b` | R6a | APPROVE (high) | green | tag filter NFKC normalization parity |
| [#435](https://github.com/djshellshoxxx/GhostPay/pull/435) | `6af1a4bc3cd8` | R2 | APPROVE (high) | green | detach reviewed incoming snapshot (child of 431) |
| [#437](https://github.com/djshellshoxxx/GhostPay/pull/437) | `9e72c9820ed4` | R6b | APPROVE (high) | green | threshold without guardians rejected |
| [#439](https://github.com/djshellshoxxx/GhostPay/pull/439) | `c7a9f9148cee` | R4 | APPROVE (high) | green | manifest purpose ASCII whitespace split |
| [#442](https://github.com/djshellshoxxx/GhostPay/pull/442) | `4bfaffa5d44f` | W2B | REJECT (med) | not run | diagnostic only, cannot fail on suspected bug, console noise |
| [#444](https://github.com/djshellshoxxx/GhostPay/pull/444) | `315941d85420` | R5 | APPROVE (high) | green | ChunkWriter header once |
| [#446](https://github.com/djshellshoxxx/GhostPay/pull/446) | `3104e010863a` | R5 | APPROVE (high) | green | template text lone surrogates rejected |
| [#447](https://github.com/djshellshoxxx/GhostPay/pull/447) | `17c638125ff6` | R2 | APPROVE (high) | green | QR classifier lone surrogate rejection |
| [#451](https://github.com/djshellshoxxx/GhostPay/pull/451) | `1f674b9b3432` | R6b | APPROVE (med) | green | extra imported settings key -> custom |
| [#453](https://github.com/djshellshoxxx/GhostPay/pull/453) | `2eb885054210` | R6a | APPROVE (high) | green | non-string raw address typed error |
| [#454](https://github.com/djshellshoxxx/GhostPay/pull/454) | `66545f23707a` | R5 | APPROVE (high) | green | separator descriptor validation |
| [#458](https://github.com/djshellshoxxx/GhostPay/pull/458) | `dd8f82d9ed3a` | R4 | APPROVE (high) | green | no-cache deny regex |
| [#461](https://github.com/djshellshoxxx/GhostPay/pull/461) | `0d5fb9c93e9f` | R6b | APPROVE (med) | green | missing preset blob after revision fails closed |
| [#462](https://github.com/djshellshoxxx/GhostPay/pull/462) | `a3ac91c8f38b` | R5 | APPROVE (med) | green | asset-id symbol collision blocked |
| [#463](https://github.com/djshellshoxxx/GhostPay/pull/463) | `149300330d59` | R2 | APPROVE (med) | green | OP Stack serialization inside try -> typed error |
| [#465](https://github.com/djshellshoxxx/GhostPay/pull/465) | `a234ea948780` | R4 | APPROVE (high) | not run | snapshot id > seq rejected |
| [#467](https://github.com/djshellshoxxx/GhostPay/pull/467) | `860c7f4d09b6` | R5 | APPROVE (high) | not run | CSV amount typeof guard |
| [#470](https://github.com/djshellshoxxx/GhostPay/pull/470) | `051b722a34d5` | R6a | APPROVE (med) | not run | WalletConnect nowMs validation |
| [#472](https://github.com/djshellshoxxx/GhostPay/pull/472) | `eca2a97b0286` | R4 | APPROVE (high) | not run | b64urlDecode typeof guard |
| [#473](https://github.com/djshellshoxxx/GhostPay/pull/473) | `f05504b5bcd6` | R3 | APPROVE (med) | not run | QR SVG matrix snapshot |
| [#474](https://github.com/djshellshoxxx/GhostPay/pull/474) | `31c0d0aebad7` | R4 | APPROVE (med) | not run | hasOnlyKeys plain-prototype check |
| [#475](https://github.com/djshellshoxxx/GhostPay/pull/475) | `3be7dcdc9810` | R5 | APPROVE (high) | not run | parseUnits rounding mode validation |
| [#476](https://github.com/djshellshoxxx/GhostPay/pull/476) | `6aba5e7c2fee` | R3 | APPROVE (high) | not run | lint repair (child of 473) |
| [#477](https://github.com/djshellshoxxx/GhostPay/pull/477) | `9a0b976fe534` | R6a | APPROVE (high) | not run | sparse handle-book entries rejected |
| [#478](https://github.com/djshellshoxxx/GhostPay/pull/478) | `782a5bce33a6` | R5 | APPROVE (high) | not run | cancel uses single clock sample |
| [#479](https://github.com/djshellshoxxx/GhostPay/pull/479) | `ebac41d9eaee` | R4 | APPROVE (med) | not run | freeze palette action copy (residual getter TOCTOU nit) |
| [#480](https://github.com/djshellshoxxx/GhostPay/pull/480) | `9bc3013e36bd` | R7 | APPROVE (high) | not run | bufferDust bigint guards |
| [#481](https://github.com/djshellshoxxx/GhostPay/pull/481) | `ffd187c7721d` | R6b | APPROVE (high) | not run | sparse checklist fails closed |
| [#482](https://github.com/djshellshoxxx/GhostPay/pull/482) | `e5705abded67` | R6b | APPROVE (high) | not run | sparse policy records (child of 437) |
| [#483](https://github.com/djshellshoxxx/GhostPay/pull/483) | `4ebce7eeafd2` | R5 | APPROVE (high) | not run | pre-epoch timestamps rejected |
| [#484](https://github.com/djshellshoxxx/GhostPay/pull/484) | `9aeed83b7391` | R6a | APPROVE (high) | not run | base64url pad-bit canonical check |
| [#485](https://github.com/djshellshoxxx/GhostPay/pull/485) | `fe1c59a3d5aa` | R6b | APPROVE (high) | not run | test typing only (child of 482) |
| [#486](https://github.com/djshellshoxxx/GhostPay/pull/486) | `366c912ee6b7` | R6b | APPROVE (high) | not run | ux-receipts canonical sparse arrays |
| [#487](https://github.com/djshellshoxxx/GhostPay/pull/487) | `e8dd09862fac` | R6a | APPROVE (high) | not run | hw signer bigint checks; long-line nit |
| [#488](https://github.com/djshellshoxxx/GhostPay/pull/488) | `6d46d500da81` | R4 | APPROVE (med) | not run | theme snapshot; detached JSDoc nit |
| [#489](https://github.com/djshellshoxxx/GhostPay/pull/489) | `f702d2628673` | R7 | APPROVE (med) | not run | crowd estimate overflow fallback; non-finite throws |
| [#490](https://github.com/djshellshoxxx/GhostPay/pull/490) | `cf642259db1e` | R5 | APPROVE (high) | not run | sparse column configs rejected |
| [#491](https://github.com/djshellshoxxx/GhostPay/pull/491) | `8dd2dee49994` | R5 | APPROVE (high) | not run | rate quote snapshot |
| [#494](https://github.com/djshellshoxxx/GhostPay/pull/494) | `f50081527549` | R4 | APPROVE (high) | not run | origin cap allows :65535, hostname<=253 |
| [#495](https://github.com/djshellshoxxx/GhostPay/pull/495) | `a8b10c12db40` | R6a | APPROVE (high) | not run | explicit default port rejected in invoice links |
| [#496](https://github.com/djshellshoxxx/GhostPay/pull/496) | `920a9ffe366d` | R1 | APPROVE (high) | not run | EIP-3770 registry chainId validation |
| [#497](https://github.com/djshellshoxxx/GhostPay/pull/497) | `1fc6f89f171b` | R4 | APPROVE (high) | not run | JWS-shaped query values network-only |
| [#498](https://github.com/djshellshoxxx/GhostPay/pull/498) | `1e91fc43196c` | R4 | APPROVE (high) | not run | makeSnippet opts record check |
| [#499](https://github.com/djshellshoxxx/GhostPay/pull/499) | `72c4b7aa0f11` | R1 | APPROVE (high) | not run | EIP-681 amount read once |
| [#501](https://github.com/djshellshoxxx/GhostPay/pull/501) | `651d66937137` | R6a | APPROVE (high) | not run | sparse tip presets rejected |
| [#502](https://github.com/djshellshoxxx/GhostPay/pull/502) | `02aba52ad3d3` | R1 | APPROVE (high) | not run | Bitcoin amount/network snapshot |
| [#503](https://github.com/djshellshoxxx/GhostPay/pull/503) | `93d719f98751` | R7 | APPROVE (high) | not run | camera tracks stopped on attach failure |

## Not integrated, with reasons and next actions

- #384 superseded by #301 (identical guard); #409 by #458; #419 by #422; #319 by #314 (reviewer: #319 is not an
  ancestor of #314 and leaves unlock-before-read and export-after-session-change gaps that #314 closes).
- #389 CHANGES: `extractFragment` becomes https-only and rejects prefixed pastes; this is a UX narrowing that needs an
  owner decision, not a security fix.
- #316 CHANGES: textual conflict in `ReceiptPanel.tsx` with the archive-pending button, and `usePrintTarget` can stay
  stuck (`finishCurrent` set) when `afterprint` never fires or the target ref is null. Fix both, then re-review.
- #442 REJECT: diagnostic test that cannot fail on the suspected CT-C-2 issue and adds console noise.
- P0-A (#427, #440, #441, #443, #500) left to its owner session. P0-B (refund/expiry) has only audit PR #455.
- Stacked children whose parents were merged keep a non-main base, so GitHub will not auto-close them:
  #347, #370, #379, #411, #422, #423, #425, #435, #476, #482, #485 and stack tips #369, #385, #412. Their heads are
  ancestors of the combined head; close them as integrated once main contains it.

## Verification

Recorded in the C1 pull request and appended below once observed. Unrun checks are not claimed.
