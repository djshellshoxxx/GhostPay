# Claim reconciliation: canonical input contract v1

`reconcile-claims.mjs` compares immutable Git objects from a deliberately captured branch/PR snapshot. It provides ancestry, exact changed-path postimages, raw ownership-document references and changed-path overlaps. It does not decide semantic equivalence, ownership release, qualification, merge eligibility or feature completion.

The implementation and canonical 13-case suite were recovered unchanged from #358, head `c9e53c2c5908cbb64c104d096ce84773cf804ccc`. The existing CI discovery entry imports the canonical suite; those are the same 13 cases, not another 13 distinct tests. This recovery does not import the donor's historical branch inventory or present that old observation as current.

## Canonical snapshot fields

Here, **v1** names the existing input contract described below. The implementation has no input-version dispatch: it validates these fields directly, and its output has `schema_version: 1`. Adding a `format` label to an incompatible input does not adapt it.

| Field | Required meaning |
|---|---|
| `repository` | Captured GitHub `owner/name`; the tool does not contact GitHub or independently authenticate this label. |
| `observation_completed_utc` | Actual completed observation time, UTC `Z`, calendar-valid, with zero to three fractional-second digits. |
| `main_sha` | Full lowercase 40-hex commit ID matching the captured branch named `main`. |
| `integration_pr` / `integration_sha` | Positive open PR number and its exact captured head SHA. The PR must be present in `pull_requests`. |
| `branches` | Nonempty array of `{ name, sha }`, with unique names and full commit IDs. This is the captured branch inventory, not whatever local remote refs happen to exist later. |
| `pull_requests` | Complete captured open-PR array, with unique positive numbers. Each row needs `number`, `title`, `state: "open"`, Boolean `draft`, `base_ref`, `base_sha`, `head_ref`, `head_sha`, and exact repository PR `url`. |
| `counts.branches` / `counts.open_prs` | Exact lengths of the two captured arrays. A matching length does not independently prove API pagination was complete. |
| `observation_notes`, `sources`, `lock` | Optional provenance/observation values, retained without deciding their authenticity, authority or current validity. |

Every named main, integration, branch, PR-base and PR-head object must already exist as a commit in the full local clone. Missing objects, shallow history and grafts are rejected. Replacement objects and lazy fetching are disabled. No fetch, ref update, merge, CI dispatch or ownership release occurs.

## Current refresh files need an explicit adapter

The consolidation refresh format `ghostpay-branch-ref-refresh/2` is a different contract. It records `refs` entries as `{ branch, head }`, `current_count`, `recorded_at` and changed-ref analysis. It does not provide this comparator's complete canonical PR rows or integration target. The later unversioned `branch-ref-snapshot-final.json` likewise supplies `{ branch, head }` refs and an `observed_at` timestamp, not the canonical snapshot.

Neither file can be passed directly to this utility. A meaningful current-census invocation first needs a separately reviewed normalization step that:

1. Preserves the exact complete ref observation while mapping `branch`/`head` to `name`/`sha`.
2. Supplies the complete, independently captured open-PR observation, including original base and head commit IDs, explicit state/draft, repository URLs and capture provenance.
3. Chooses the exact captured open integration PR and its head; no local unreferenced candidate is substituted for that captured head.
4. Records the real completed observation time and retains original source timestamps/hashes and endpoint timing differences in provenance. A PR's `updated_at` is not its API observation time.
5. Checks completeness and counts instead of inferring missing PRs, states or ownership from branch names.

No such adapter or current full-inventory replay is claimed by this bounded recovery. The helper remains usable for explicitly authored/captured inputs that meet the canonical contract. Existing synthetic fixtures qualify that contract; they do not qualify a transformed live snapshot.

## Interpretation and resource scope

Ancestry means historical inclusion, not surviving behavior after later edits or reversions. Exact postimages compare mode/type/blob identity, including deletion; they are not proof of patch provenance or semantic completeness. A unique merge base is required to report a delta. Unrelated and multiple-merge-base histories remain not-comparable. Snapshot branch-tip drift remains visible rather than replacing original PR base/head IDs.

Ownership documents are retained as uninterpreted text indexed by blob and source commit. Overlapping changed paths are evidence of overlap only. Code, JSON, assets and MDX under `docs/` are not discarded as narrative documentation.

The Git subprocess output limit is 64 MiB per command. There is no global input-file, branch-count or generated-report size cap; complete reports and caches can be large. This is an operator-invoked local comparison tool, not a network service or an automatic bounded public ingestion endpoint. The CLI writes its explicitly chosen output and temporary file; a valid run replaces an existing output atomically. An invalid snapshot does not replace the old output.

```sh
node --test scripts/coordination/reconcile-claims.test.mjs
node scripts/coordination/reconcile-claims.mjs \
  --repo . \
  --snapshot /absolute/path/to/canonical-snapshot-v1.json \
  --output /absolute/path/outside-the-checkout/reconciliation.json
```

The emitted digest identifies the generated report; the report also retains the exact input-file SHA-256. Neither digest authenticates how the original observation was captured.
