# Census evidence recovery

## Recovered bytes

The original `census_ownership` and `ghostpay` directories are absent in this execution environment. A bounded filename search across `/workspace` and `/tmp` found no matching final census artifacts. The functions store retained 28 original tool payloads. They have been saved as exact UTF-8 cached content strings, with provenance and hashes in `EXACT_CACHE_RECOVERY_INDEX.json`. This recovery performed no live census, network fetch, repository mutation, runtime test, or reconstructed source analysis.

The recovered complete initial snapshot contains **872 refs, 833 distinct heads, and 160 open PRs**. Branch page lengths are `[100,100,100,100,100,100,100,100,72,0]`; PR page lengths are `[100,60,0]`. Both complete terminal empty pages are retained, and branch names and PR numbers are unique. `branches-872-recovered.json` and `open-prs-160-recovered.json` aggregate these original cached pages into a new serialization. They do not claim byte identity with the lost earlier files.

The cached main ref is `0934ea094cb1db90293b74d2d1e9d9324e09a883`. Also recovered are its commit metadata, current-at-capture AGENTS/STOP/ACTIVE_WORK files, the #380 10Z checkpoint, the already-public archive manifest, the cooperative lock record, claims, and PR metadata for #254/#307/#760/#761/#768. Six source-file payloads with Git blob identifiers match their original blob hashes exactly: AGENTS, STOP, ACTIVE_WORK, claims, lock, and #380 checkpoint.

Rechecking the already-public manifest against the recovered original snapshot confirms **34/34 frozen archive refs match**. **33/34 original source refs match**; the known #636 original source advanced to `0d548b9acb9236cb09c150e36be21596a01423d6`, while its frozen ref remains `57505cb294cf1780036ff004d60e3fcb7b75917a`. This is a historical cached-snapshot verification, not a new live observation.

## Missing final proof

The later **876-ref / 837-head / 162-open-PR** raw snapshot, final graph, complete semantic ledger, compressed source comparison, proof overlays, final publication manifest, and final hash inventory were not found on disk or under the tested task-specific cache keys. The cache has no supported key enumeration API; absence is limited to the inspected filenames and tested task-specific keys. The raw final proofs must not be described as recovered.

The prior completion's reported analysis is preserved separately in `PRIOR_REPORTED_FINAL_ANALYSIS.json`, expressly marked as reported conclusions without the missing per-ref proof. Its reported nonancestor arithmetic was **309 established + 33 open-PR source associations + 21 open-PR ancestry sources + 15 residual-review rows = 378**. The **10 equivalence revalidations are inside the 309 established rows**, not additional refs. Global unresolved behavioral obligations remained unknown; no unique unowned merge-ready fix or mission completion was established.

The final original source-comparison digest retained in the prior report was SHA-256 `57db63ee456b06927d0d059a73b4e84fcdba6e3daa70a4def943504000c9c01e` for 28,361,932 decoded bytes. A digest is not recovery of those bytes.

## Canonical recovery artifacts

- `EXACT_CACHE_RECOVERY_INDEX.json`: exact cache payload provenance, content hashes, and source blob verification.
- `cached-payloads.json.xz`: complete retained cache payloads and their source URLs.
- `branches-872-recovered.json`: all 872 original cached branch rows.
- `open-prs-160-recovered.json`: all 160 original cached open-PR rows.
- `archive-verification-from-recovered-snapshot.json`: all 34 frozen/source comparisons.
- `PRIOR_REPORTED_FINAL_ANALYSIS.json`: clearly limited prior reported analysis.
- `RECOVERY_SHA256SUMS.json`: hashes of the recovered publication set.

The earlier `CACHE_INDEX.json` and `ledger.json` in this recovery directory were intermediate newline-normalized writes. Use `EXACT_CACHE_RECOVERY_INDEX.json` and `ledger.md`; the exact recovery overwrote the other payload files with their unmodified cached strings. No private tracker data was newly retrieved; the existing public repository manifest was preserved.
