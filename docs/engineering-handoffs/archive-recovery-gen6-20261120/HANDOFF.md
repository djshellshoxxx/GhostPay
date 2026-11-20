# Fresh successor handoff: historical documentation recovery

## Completed scope

Worker `/root/archive_recovery_gen6` compared all 158 historical sections selected by PR #259 against frozen integration `53f4253bd9afc33bea43a7bdfe95ae287e035bf7` and later documentation/evidence candidate `a1e5090bac39bf3841f7d0403c79163d787a9793`.

The source is PR #259 at `4ff80733a3b36019e2f12fc21a8448e7666b6049`, declared base `ffd982a7aea2856c186b40ef236a39720a1b81f5`. The source base is already an ancestor of the frozen candidate. Recovery was performed on isolated branch `docs/ghostpay-historical-archive-gen6-20261120`, based on that frozen candidate, with an additive ownership claim in `docs/ai/ACTIVE_WORK.md`.

The recovered selection comprises 42 sections from PR #139, 74 from PR #140, and 41 from PR #153. Exactly one complete original section, the QR color presentation guidance, already exists in both candidate trees and was omitted. The [README](README.md) explains the source pins, comparison methods, interpretation, and limits. [Provenance](provenance.json) identifies every section and its disposition. [Verification](verification.json) inventories the comparison corpus and checks.

## Fresh review task

A fresh worker should review this concrete documentation diff before integration:

1. Resolve the three recovered archive files from the new manifest. Recompute their SHA-256 hashes and confirm that each of the 157 recorded recovered byte ranges has its recorded historical archive-body hash.
2. Resolve each original source commit, file, and inclusive line range. Confirm its recorded source blob identity and section SHA-256. These are historical source records, not commands to execute.
3. Confirm that the omitted QR section still occurs verbatim in the integration candidate. Its source identity and both earlier retention matches are recorded in the manifest.
4. Check that PR #139 and PR #153 archives remain byte-identical to the PR #259 source. Confirm that PR #140 differs only by removal of the QR color source-file block and its preceding separator.
5. Review all newly added local Markdown links and the distinction between original `source-records/` manifests and the new selection manifests. Original record paths refer to the PR #259 source tree.
6. Confirm that the integration diff contains only documentation recovery. Root owns integration, final application validation, publication, and release decisions.

If the integration candidate acquires later historical documents before merge, compare only those changed evidence files against the recorded recovered sections. A complete candidate re-scan is unnecessary unless the later diff gives a concrete reason to broaden it. Remove an archival section only when complete-text equivalence is established and recorded; a matching title or a related summary alone is insufficient.

## Boundaries and limitations

All recovered material is immutable historical evidence. Its dated ownership directions, proposed next actions, and qualification/release statements carry no present authority. No active status document, Wiki navigation, runtime source, test, configuration, or workflow was imported.

No application tests, builds, historical snippets, security reproduction, external URLs, deployments, releases, or remote writes were executed in this lane. Verification consisted of local Git object inspection, document text comparisons, bounded gzip/ZIP reads, JSON decoding, hashes, source boundaries, ancestry, publication metadata, and local document links.

The comparison establishes absence of complete sections in the inspected textual representations; it does not establish universal semantic novelty. General background and individual sentences may overlap retained documentation. Three binary payloads, one font and two screenshots, were inventoried but not OCRed. No compressed payload was skipped for size.

The source publication map's four original local commit objects are unavailable. Published tree IDs and mapped parent lists were verified, and all ten historical comparison-file hashes match the mapped published comparison commit. Local-versus-published tree equivalence remains an attributed historical claim.

The original privacy checkout and other workers' branches remain outside this task. A successor should use a separate branch or a read-only review and preserve the root coordinator's current source freeze and execution-window ownership.
