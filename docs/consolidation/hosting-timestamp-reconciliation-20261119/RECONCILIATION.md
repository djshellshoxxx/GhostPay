# Focused hosting/main reconciliation

Product: `f8c9d4024f48fd6d813f503bceda939ac44277c1`; tree `66b698946ab9d93317d8c7b106014944eba96151`.
Inputs: PR #267 `c3a693e87053fbe91219f8edfe159a5ec0a37a34` and current main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
The additive claim was committed first at `2f18006d868c6a0f4eeebb0fa3c38c8945879009`. Both original inputs remain ancestors.

The conflict-only preview and actual merge reported only `docs/ai/ACTIVE_WORK.md`.
Resolution preserves the exact new claim, the exact 1,480-byte focused-only claim,
and every byte of the 59,606-byte current-main registry. No source, test, dependency,
workflow or threshold was manually changed. `git diff --cached --check` passed.
A second merge-tree check against pinned main exits 0 and returns the product tree.

All 80 hosting files retain tree `3295a7030121f51b1286ffc96b3a6480aa319aa7`.
The three reviewed timestamp source/test blobs are exact. Every incoming main
source/test blob is exact; outside documentation, those three hosting files are
the entire difference from main. The 291 explicitly selected configuration
records match both inputs; `config-inputs.json` lists every path, mode and blob.
Its SHA256 is `2b7a5e19363ef5eee31716b9a0fa24d254de3c62fa4b983fe7ca6073626fe8f9`.

`receipt.json` records exact identities, comparisons, commands and evidence limits.
No runtime tests were repeated for this documentation-only conflict. The existing
native nginx/differential and Chromium evidence remains historical at c3a/d979.
New-head hosted type/build/browser and other required gates remain pending.
The coordinator owns independent review, expected-ref publication and eventual
normal merge; this worker made no remote write or deployment.
