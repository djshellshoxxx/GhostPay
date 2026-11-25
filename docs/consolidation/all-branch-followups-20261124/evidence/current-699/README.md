# Current-main branch accounting — 2026-11-24

**699 branches / 693 unique heads**, cutoff 2026-11-24T13:14:56.599080+00:00.

Current main `cc090bf80bbf35c1db81ecbe6acae694a518bed0` contains core #611. Local source `70df75359a807bf833da82f43229452d6ab59976` and remote equivalent `0a7b903780b66135a9505230c96d4ab45b2959a2` share tree `d006864ec291386d17ddab0bd4fd4ac1bb08c1a8`. No final followup ref or PR existed at the cutoff.

| Target | Ref rows in ancestry | Unique heads |
| --- | ---: | ---: |
| current_main | 351 | 347 |
| published_core | 350 | 346 |
| final_local | 363 | 358 |
| final_remote_source | 367 | 362 |

These are ancestry counts, not feature counts. #358/#468 are selected as five exact source/test files, without merging their entire historical heads.

## Ref changes

One new branch: #619 deployment diagnostic fixture3107b816. Three advanced refs: main706188→cc090bf8; integration lock89107c26→c69bca41 (generation18 released); #49314635ec8→51160bcb. None deleted. Ledger remains21009fb4. Later automation lies outside this cutoff.

## Selection and remaining gates

#377 scoped cookie repair, #358/#468 read-only tooling, and #578 HTTPS compatibility coverage are composed. Their exact donor files and source-specific receipts are in SELECTION_OVERLAY.json. Fresh applicable final-head hosted qualification remains mandatory. The prior bda2af application-coverage result is retained with its source pin.

#619 is selected as a bounded three-file retained utility/test subset. Selected bounded three-file retained utility and tests from #570/#619; 45 existing cases and full web typecheck/lint passed on e65214c2. Independent final addendum and fresh combined hosted qualification remain distinct; no production caller or live banner activation. The helper has no current production callers. No live UI banner activation is claimed. Broad #570 privacy/export remainder remains held.

#493 has a concrete exact-head SDK/Viem TS2322 build failure in confidential-amounts. DEPENDABOT_FAILED_BUILD.log records the failure; current source changes68 manifest/lock paths. It needs coherent SDK/Viem and lock reconciliation followed by qualification, not a blanket ownership hold.

## Files and scope

INDEX_DATA.json and the CSV cover every cutoff ref. STRUCTURAL_MAIN.json.gz and STRUCTURAL_CANDIDATE.json.gz contain complete uncapped path comparisons. REF_COMPARISONS.json retains full raw mode/blob deltas for every new/advanced ref. SELECTION_OVERLAY.json preserves all original67 findings as history with an additive current row. Frozen698 history remains unchanged and is referenced by hash; its old20MB census archive is not copied.

No application testing or repository/remote mutation was performed for this inventory. Re-run build-current699-overlay.py with final --candidate and --remote-source pins to refresh semantic/source overlay without another remote census.

The diagnostic45-case qualification reused web dependencies containing cookie0.4.2; it is web-source qualification, not requalification of the separately installed/reviewed cookie0.7.2 override. Fresh combined hosted installation remains required.
