# Recovered contract analyzer qualification — 2026-11-19

## Fresh result

**The existing Slither gate passed on production contract inputs from local candidate `e8680e138dcdd9d82737971cc55ad757a6640fbf`.** Official Slither 0.11.6 / crytic-compile 0.4.2 analyzed 34 contracts with 64 detectors and reported 0 results, exit 0. The one-thread production compile used solc 0.8.28, optimizer 200, Cancun and the original metadata settings. All 36 compilation-input contents exactly match that candidate's Git objects, current source and the preserved 36-input hashes. New raw logs and compressed compiler build-info are present here; no lost earlier logs were reused.

The unchanged command includes `--filter-paths 'lib|test|script' --fail-medium --exclude-informational --exclude-low`. No new exclusion, suppression, contract edit or gate change was made. This result applies to that existing Medium/High gate, not excluded Low/Informational classes or a claim of complete security. Production compilation excludes tests/scripts in the same way as the original crytic-compile scope; it does not replace contract test qualification.

See [receipt.json](receipt.json), [source proof](evidence/slither-source.json), [compiled-input proof](evidence/slither-result.json), [exact commands](evidence/slither-commands.json), [build-info](evidence/slither-build-info.json.gz), and the raw-output `.log.gz` files listed in the receipt. The official environment used for this run was isolated, 102 MiB, and pip's dependency consistency check passed. The install report preserves actual package versions, source URLs and hashes; no global package changes were made. Temporary environment paths are reproducibility details, not durable evidence links.

## Remaining analyzer work

Official Echidna 2.2.7 was restored from the exact workflow URL with the pinned archive SHA-256 `d9f8c2e829cc35a4077f8c139863c9087a038262639febd1dcc69d93b79aa314`; version smoke passed. The full unchanged three-harness campaign subsequently executed and **failed with runner exit 1**. Router was killed with exit 137 after its last observed 133,127/300,000 calls; Sweep completed 300,048 calls with four passing safety properties and both required canaries falsified; Policy was killed with exit 137 after its last observed 245,970/300,000 calls. See [the complete attempt record](evidence/echidna-attempt-1.json) and [raw output](evidence/echidna-attempt-1.log.gz). All 379 original source-manifest entries and all three compiled-input sets were independently verified against immutable Git after the executor reset. The transient corpus was lost before it could be archived; no corpus replay or final full-filesystem comparison is claimed. Auxiliary Slither enrichment completed for every harness. SIGKILL cause is undetermined; memory pressure is an inference. The official binary rejected a proposed `GHCRTS=-N4 -M1536m` cap before even printing its version, so no capped retry was launched. Original workers, calls, properties and gates remain unchanged.

Mythril 0.24.8's official source archive checksum was verified. Its complete native/scientific/solver dependency environment is not installed here and no native Mythril campaign was run. Official metadata permits Python >=3.7; the older README advertises 3.7–3.10, while the repository already records successful tool execution on Python 3.12. This lane therefore does not declare Python 3.12 unsupported or introduce compatibility patches. The strict runner and pinned budgets remain unchanged.

## Historical Mythril findings remain open for the strict gate

The retained original report's hash was verified and its 11 records (3 Medium, 8 Low) were mapped to the exact historical dispositions in [the machine-readable record](evidence/historical-mythril-dispositions.json). Historical judgments are not accepted exceptions or fresh reproductions. A later hosted report also contains 11 records but matches only ten documented location tuples: Low SWC-113 PC999 at `initialize` is a separate identity, while historical R8 is absent. That absence does not establish remediation. Trace-specific counterevidence and the scheme-2 fee-token availability/freeze residual are preserved; no finding is closed, suppressed or transformed into a passing gate.

## Independent lint repair review

[LINT_SOURCE_REVIEW.json](LINT_SOURCE_REVIEW.json) approves the bounded six-file source diff at `e8e2edecd0b989a90f5afb65622df4efefeebf93`. Both fee-reserve branches definitely assign, abort timing and valid JSON-RPC fixture behavior are preserved, and every existing assertion/configuration remains. This was a source-only review; runtime, typecheck and lint executions belong to the implementation worker's separate evidence.

**Overall release verdict remains BLOCKED.** Exact final-source CI, full applicable analyzer campaigns, hosted/browser qualification, owner decisions and required independent external review remain separate requirements.

## Independent evidence reviews

An independent internal reviewer recomputed the committed log/document hashes, compiler build-info, all 36 source mappings, original flags and exact-byte upstream README restoration. [The scoped review](INDEPENDENT_SLITHER_REVIEW.json) approved the Slither evidence and requested an explicit source/path for the preserved input record; that provenance field is now included. A separate [resource review](INDEPENDENT_ECHIDNA_RESOURCE_REVIEW.json) confirmed the pinned official binary offers no documented memory cap and independently reproduced the rejected runtime option. These internal reviews do not substitute for external security review or qualify the failed Echidna campaign.
