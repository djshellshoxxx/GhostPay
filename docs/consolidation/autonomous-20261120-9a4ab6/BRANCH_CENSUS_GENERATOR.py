#!/usr/bin/env python3
"""Read-only immutable-ref census; evidence, not merge authorization."""
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import gzip
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
TARGETS = {
    "main": "aec179910c39081d820396409ff3139ff2264132",
    "integration_pr307": "5a745d4b5fba69b66a9779f88aefc63c253a4f27",
}


def git(*args, check=True):
    result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, check=check)
    return result.stdout.decode("utf-8", errors="strict").rstrip("\n")


def application(path):
    return path.startswith(("apps/", "packages/")) and not path.endswith((".md", ".txt"))


def engineering(path):
    return (application(path) or path.startswith(("scripts/", "tools/", "deploy/", ".github/"))) and not path.endswith((".md", ".txt"))


def entries(sha):
    rows = {}
    for record in git("ls-tree", "-r", "-z", "--full-tree", sha).split("\0"):
        if record:
            metadata, path = record.split("\t", 1)
            rows[path] = metadata
    return rows


TARGET_ENTRIES = {name: entries(sha) for name, sha in TARGETS.items()}
prior = json.loads((ROOT / "docs/consolidation/current-census-20261120/CENSUS.json").read_text())
PRIOR = {row["name"]: row for row in prior["branches"]}
frozen_path = OUT / "BRANCH_FROZEN_REFS.json"
if frozen_path.exists():
    frozen = json.loads(frozen_path.read_text())
    snapshot_at, refs = frozen["observed_at_utc"], frozen["branches"]
else:
    snapshot_at = datetime.now(timezone.utc).isoformat()
    refs = []
    for line in git("for-each-ref", "--format=%(refname) %(objectname)", "refs/remotes/origin/").splitlines():
        ref, sha = line.split(" ", 1)
        name = ref.removeprefix("refs/remotes/origin/")
        if name != "HEAD":
            refs.append({"name": name, "sha": sha})
    refs.sort(key=lambda row: row["name"])
    frozen_path.write_text(json.dumps({"observed_at_utc": snapshot_at, "method": "One for-each-ref snapshot of complete clone remote refs; symbolic HEAD excluded. All comparisons use immutable SHAs.", "branches": refs}, indent=2) + "\n")


def compare(target_name, head, head_entries):
    target = TARGETS[target_name]
    bases = git("merge-base", "--all", target, head, check=False).splitlines()
    if not bases:
        return {"classification": "unrelated_history", "merge_bases": []}
    behind, ahead = map(int, git("rev-list", "--left-right", "--count", f"{target}...{head}").split())
    result = {"merge_bases": bases, "ahead": ahead, "behind": behind}
    if not ahead:
        result.update(classification="ancestor_or_equal", application_paths=0, engineering_paths=0,
                      changed_paths=0, patch_equivalent_commits=[], patch_unique_commits=[],
                      application_matches_target=[], application_differs_target=[], engineering_differs_target=[])
        return result
    # For criss-cross histories, examine every best merge base rather than
    # selecting an arbitrary ancestor. This conservative union is not a merge.
    base_paths = {b: git("diff", "--name-only", "--no-renames", b, head).splitlines() for b in bases}
    paths = sorted({p for branch_paths in base_paths.values() for p in branch_paths})
    result["changed_path_counts_by_merge_base"] = {b: len(p) for b, p in base_paths.items()}
    app_paths = [p for p in paths if application(p)]
    eng_paths = [p for p in paths if engineering(p)]
    app_same = [p for p in app_paths if head_entries.get(p) == TARGET_ENTRIES[target_name].get(p)]
    app_diff = [p for p in app_paths if p not in app_same]
    eng_diff = [p for p in eng_paths if head_entries.get(p) != TARGET_ENTRIES[target_name].get(p)]
    cherry = git("cherry", target, head).splitlines()
    equiv = [r[2:] for r in cherry if r.startswith("- ")]
    unique = [r[2:] for r in cherry if r.startswith("+ ")]
    classification = ("documentation_or_nonapplication_diff" if not app_paths else
                      "all_changed_application_blobs_retained" if not app_diff else
                      "application_semantic_review_required")
    result.update(classification=classification, changed_paths=len(paths), application_paths=len(app_paths),
                  engineering_paths=len(eng_paths), patch_equivalent_commits=equiv,
                  patch_unique_commits=unique, application_matches_target=app_same,
                  application_differs_target=app_diff, engineering_differs_target=eng_diff)
    return result


def census(row):
    head = row["sha"]
    tree = entries(head)
    digest = hashlib.sha256()
    for path, metadata in sorted(tree.items()):
        if application(path):
            digest.update(f"{path}\0{metadata}\n".encode())
    old = PRIOR.get(row["name"])
    comparisons = {name: compare(name, head, tree) for name in TARGETS}
    if row["name"] == "automation/ghostpay-integration-lock":
        for result in comparisons.values():
            result["mechanical_classification"] = result["classification"]
            result["classification"] = "coordination_metadata_do_not_merge"
    return {**row, "commit_tree": git("rev-parse", head + "^{tree}"),
            "application_tree_sha256": digest.hexdigest(),
            "prior_assessment": old.get("assessment") if old else None,
            "prior_observed_head": old.get("observed_head_sha") if old else None,
            "new_branch_since_prior_census": old is None,
            "comparison": comparisons}


with ThreadPoolExecutor(max_workers=3) as pool:
    rows = list(pool.map(census, refs))
full_groups = defaultdict(list)
app_groups = defaultdict(list)
for row in rows:
    full_groups[row["commit_tree"]].append(row["name"])
    app_groups[row["application_tree_sha256"]].append(row["name"])
result = {
    "observed_at_utc": snapshot_at,
    "completed_at_utc": datetime.now(timezone.utc).isoformat(),
    "repository": "djshellshoxxx/GhostPay",
    "targets": TARGETS,
    "total_branches": len(rows),
    "method": {
        "source": "Complete local clone; frozen remote head SHAs; no branch-name comparisons after snapshot.",
        "application_scope": "apps/ and packages/, excluding .md/.txt; runtime data, tests, styles and package configuration included.",
        "engineering_scope": "Application scope plus scripts/, tools/, deploy/ and .github/, excluding .md/.txt.",
        "blob_retention": "Donor-changed paths compare exact Git mode/type/blob tuples with target; deletions compare missing entries. No similarity heuristic or 300-file API cap.",
        "patch_equivalence": "git cherry target head compares nonmerge patch IDs. Squashed/composed behavior can be present even when commit patch IDs differ.",
        "multiple_merge_bases": "For criss-cross histories, compare every best merge base and retain the conservative union of changed paths, with individual counts. No arbitrary merge base is selected; this is not a simulated merge result.",
        "limits": "Neither patch uniqueness nor differing blobs proves unique behavior. Target changes may supersede old code. Semantic review and combined-source qualification are separate. PR and ref reads are not one atomic snapshot.",
    },
    "summary": {name: dict(Counter(row["comparison"][name]["classification"] for row in rows)) for name in TARGETS},
    "new_branch_count": sum(row["new_branch_since_prior_census"] for row in rows),
    "missing_prior_branch_names": sorted(set(PRIOR) - {row["name"] for row in rows}),
    "identical_full_tree_groups": [{"tree": h, "branches": names} for h, names in sorted(full_groups.items()) if len(names) > 1],
    "identical_application_tree_groups": [{"digest": h, "branches": names} for h, names in sorted(app_groups.items()) if len(names) > 1],
    "branches": rows,
}
detail_bytes = (json.dumps(result, separators=(",", ":")) + "\n").encode()
compressed = gzip.compress(detail_bytes, mtime=0)
(OUT / "BRANCH_CENSUS_DETAILS.json.gz").write_bytes(compressed)
index = {k: v for k, v in result.items() if k != "branches"}
index["details"] = {"path": "BRANCH_CENSUS_DETAILS.json.gz", "uncompressed_bytes": len(detail_bytes),
                    "uncompressed_sha256": hashlib.sha256(detail_bytes).hexdigest(),
                    "compressed_sha256": hashlib.sha256(compressed).hexdigest(),
                    "content": "Full changed-path arrays and equivalent/unique commit SHA lists for every comparison. gzip mtime=0; UTF-8 JSON."}
index["branches"] = []
for row in rows:
    compact = {k: v for k, v in row.items() if k != "comparison"}
    compact["comparison"] = {}
    for target, comparison in row["comparison"].items():
        item = {}
        for key, value in comparison.items():
            if key in {"patch_equivalent_commits", "patch_unique_commits", "application_matches_target", "application_differs_target", "engineering_differs_target"}:
                item[key + "_count"] = len(value)
            else:
                item[key] = value
        compact["comparison"][target] = item
    index["branches"].append(compact)
(OUT / "BRANCH_CENSUS.json").write_text(json.dumps(index, indent=2) + "\n")
print(json.dumps({k: result[k] for k in ["total_branches", "summary", "new_branch_count", "missing_prior_branch_names"]}, indent=2))
