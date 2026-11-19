# Evidence notes

The parent completion, security and hosted-validation reports explain the result and scope of each check. This
directory preserves supporting records; a successful focused test is not a replacement for a failed or unexecuted
repository gate.

- `manifest.json` records byte lengths and SHA-256 hashes of retained evidence, excluding itself.
- `changed-files.txt` lists the cumulative changed paths against the pinned integration base, including the final
  documentation delivery. `publication-preflight.json` records the last read-only base/main/PR check before that delivery.
- `source-inputs.json` pins the published implementation, its identical local and synthetic-merge trees, and the
  application/package/script/lockfile input objects. Documentation packaging must leave those inputs unchanged.
- Local `.log` files preserve captured command output. The corresponding report or result JSON gives the command,
  exit code, tested source and intentional name filtering. An empty typecheck output is not by itself a passing result.
- `focused-transcript-record.json` is explicitly reconstructed from tool results; it is not a retained raw log and
  discloses the later test-only source changes.
- `dependency-audit-blocked.json` records the automatic approval rejection and historical audit evidence only. It
  contains no newly completed audit or current advisory totals.
- `bom-reproduction.json` records the native File/codec/standalone-CLI reproduction from the tool transcript. The
  separate red/green component logs demonstrate actual mounted UI acceptance before the byte guards and refusal
  afterward. These fixtures contain only the repository's synthetic test material.
- Hosted `.extract.txt` files are excerpts of GitHub job logs. Their headers identify the source, job, checksum and
  extraction method; omitted spans are marked. Matching metadata records the checksum of the full decoded log and
  the selected output. The excerpts remove ANSI display sequences while preserving original line numbers.
- `hosted/CAPTURE_MANIFEST.json` and `hosted/SHA256SUMS.txt` retain the independent reviewer's selected hosted
  record index. Complete raw compressed job logs were inspected locally; their hashes are retained, but those raw
  archives are not part of this publication.

The superseded failing runs are retained as failures. Cancelled runs and compiler failures before browser startup do
not supply browser assertions, complete coverage results or a passing no-coverage second test pass.
