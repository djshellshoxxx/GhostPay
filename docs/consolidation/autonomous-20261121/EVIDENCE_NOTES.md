# Interpretation of preserved evidence

Worker packets retain their original hashes and manifests. Their scope statements do not supersede the current master ledger or `state.json`.

## Integration ownership wording

The final recovery worker's handoff says, “Root owns integration locks, dependency ordering, remote publication and merges.” That sentence describes coordinator responsibility and is inaccurate if read as possession of the actual lease. Generation 11 remains held by `994a0d214fb9-root-r3`; root has no reconciled integration ownership. The exact original lease bytes were restored at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`. Shared-target writes remain stopped. Source qualification does not authorize takeover.

## Compression

The residual source comparison and disposition JSON files are delivered in their original gzip representations. `residual-branch-review/COMPRESSED_SOURCE_RECEIPT.json` verifies that decompression reproduces the omitted uncompressed duplicates. The original reviewer manifest refers to both forms; the delivery manifest covers the files actually included.

## Scope and an execution restriction

Exact-source runs, historical runs, AI-worker reviews, hosted jobs, native fixtures, source discovery and formal approvals are distinct evidence classes. Test groups overlap. Queued/skipped checks are not passes. Full web qualification does not close the partial persistent-retention requirement or inherited source-review obligations.

An automated cybersecurity review stopped the initial policy-hardening worker task before it delivered work. The replacement assignment excludes vulnerable-source execution, exploit reconstruction and new adversarial scenarios. It is restricted to defensive source restoration and supported-input/static/final-source validation. Any unavailable regression remains an explicit gap; required gates are not removed or counted as passed.


## Frozen evidence packaging

Source packet paths are relative to this directory after extracting the evidence archives. Original bytes and path names are preserved. ARCHIVE_MANIFEST.json maps every archived file to its archive and SHA-256; verify_evidence.py checks the archives and every member without extraction. Unpacked working copies are ignored to avoid committing duplicate evidence. Current state, human summaries and compressed current census/PR indexes remain directly available. Historical packets are immutable evidence for their named sources; state.json identifies subsequent corrections and limitations.
