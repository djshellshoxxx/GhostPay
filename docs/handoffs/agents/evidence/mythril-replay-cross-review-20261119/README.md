# Independent replay evidence verification

This directory contains a standard-library-only read-only verifier and its
successful result. It does not launch Anvil, Cast, Forge, a wallet or any network
connection. The coordinator's six executed raw files remain in
`docs/completion/remaining-20261119/mythril-replay-evidence/`, pinned by expected
bytes and SHA-256 in `verify.py`.

From a checkout containing both evidence packets:

```sh
python3 docs/handoffs/agents/evidence/mythril-replay-cross-review-20261119/verify.py \
  --repository /absolute/path/to/GhostPay
```

Optionally add `--tools-directory /absolute/path/to/contract-tools` to compare
the local Anvil and Cast binary bytes with their recorded hashes. This still
does not execute those binaries. The archived `verification.json` includes this
binary-byte comparison. `--output /path/to/result.json` writes a fresh result;
otherwise the command only verifies and prints a PASS message.

The reviewed coordinator packet is commit
`5e753eb969455089acf40eca2d3a5859e3debb66`, including the corrected Markdown and
receipt scope statements. Their exact hashes are asserted. Both original raw
scripts and observations remain unchanged. The strict eleven-finding analyzer
failure and all owner decisions remain unchanged.
