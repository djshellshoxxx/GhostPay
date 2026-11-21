#!/usr/bin/env python3
"""Extend pinned mechanical evidence using unchanged comparison functions."""
import ast
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
ORIGINAL = "3433f7f098b5e61253a102a087dfb7e780dbb730"
ORIGINAL_DIR = "docs/consolidation/autonomous-20261120-9a4ab6/"
PREVIOUS = "c7d0e589cca0bb1bbb6c93620808ec2b6aa1b22c"
PREVIOUS_DIR = "docs/consolidation/continuation-late-20261121-539818/"
GENERATOR_SHA256 = "21073be46a1b54cab3541b30bc3ae0c1189d2eb9293c5791eb8e487b1e71dfac"


def git_bytes(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def source(commit, path):
    return git_bytes("show", commit + ":" + path)


def main():
    if git_bytes("rev-parse", "--is-shallow-repository").strip() != b"false":
        raise RuntimeError("A complete clone is required.")
    if git_bytes("for-each-ref", "--format=%(refname)", "refs/replace").strip():
        raise RuntimeError("Replacement refs are not supported.")
    graft_path = Path(git_bytes("rev-parse", "--git-path", "info/grafts").decode().strip())
    if not graft_path.is_absolute():
        graft_path = ROOT / graft_path
    if graft_path.exists():
        raise RuntimeError("Grafted history is not supported.")

    snapshot = json.loads((OUT / "SNAPSHOT.json").read_text())
    refs = sorted(({"name": r["name"], "sha": r["sha"]} for r in snapshot["branches"]), key=lambda r: r["name"])
    if len({r["name"] for r in refs}) != len(refs):
        raise RuntimeError("Duplicate frozen branch names.")
    previous_bytes = source(PREVIOUS, PREVIOUS_DIR + "CENSUS_EXTENSION_DETAILS.json.gz")
    previous_index = json.loads(source(PREVIOUS, PREVIOUS_DIR + "CENSUS_EXTENSION.json"))
    if hashlib.sha256(previous_bytes).hexdigest() != previous_index["details_sha256"]:
        raise RuntimeError("Previous evidence hash mismatch.")
    previous = json.loads(gzip.decompress(previous_bytes))
    original = json.loads(source(ORIGINAL, ORIGINAL_DIR + "BRANCH_CENSUS.json"))
    targets = previous["targets"]
    if targets != original["targets"]:
        raise RuntimeError("Changed targets invalidate comparison reuse.")
    by_name = {r["name"]: r["sha"] for r in refs}
    if by_name["main"] != targets["main"] or by_name["integration/ghostpay-main-recovered-fixes-20261120"] != targets["integration_pr307"]:
        raise RuntimeError("Snapshot targets changed; perform a new census instead.")

    old_rows = {r["name"]: r for r in original["branches"]}
    old_rows.update({r["name"]: r for r in previous["computed_details"]})
    old_heads = {r["name"]: r["sha"] for r in previous["all_heads"]}
    if set(old_rows) != set(old_heads) or any(r["sha"] != old_heads[n] for n, r in old_rows.items()):
        raise RuntimeError("Reused row identities disagree with previous snapshot.")
    for ref in refs:
        if git_bytes("cat-file", "-t", ref["sha"]).strip() != b"commit":
            raise RuntimeError("A frozen head is not a commit.")

    generator = source(ORIGINAL, ORIGINAL_DIR + "BRANCH_CENSUS_GENERATOR.py")
    if hashlib.sha256(generator).hexdigest() != GENERATOR_SHA256:
        raise RuntimeError("Original generator hash mismatch.")
    module = ast.parse(generator)
    functions = ast.Module(body=[n for n in module.body if isinstance(n, ast.FunctionDef)], type_ignores=[])
    namespace = {"ROOT": ROOT, "subprocess": subprocess, "hashlib": hashlib, "TARGETS": targets}
    exec(compile(functions, "<pinned-original-census-functions>", "exec"), namespace)
    namespace["TARGET_ENTRIES"] = {n: namespace["entries"](s) for n, s in targets.items()}
    older = json.loads(source(targets["main"], "docs/consolidation/current-census-20261120/CENSUS.json"))
    namespace["PRIOR"] = {r["name"]: r for r in older["branches"]}

    rows, computed, reused = [], [], []
    for ref in refs:
        old = old_rows.get(ref["name"])
        if old and old["sha"] == ref["sha"]:
            rows.append(old)
            reused.append(ref)
        else:
            row = namespace["census"](ref)
            rows.append(row)
            computed.append(row)
    summary = {target: dict(Counter(row["comparison"][target]["classification"] for row in rows)) for target in targets}
    result = {
        "observed_at_utc": snapshot["observed_at_utc"],
        "targets": targets,
        "previous_commit": PREVIOUS,
        "previous_details_sha256": hashlib.sha256(previous_bytes).hexdigest(),
        "original_generator_commit": ORIGINAL,
        "generator_sha256": GENERATOR_SHA256,
        "method": "Unchanged original function definitions; all best merge bases; exact Git mode/type/blob comparisons; only new or changed heads recomputed.",
        "limits": "Frozen separate endpoint observations; mechanical differences are not distinct missing features or merge qualification. Later publications are excluded.",
        "total_branches": len(refs),
        "open_prs": len(snapshot["open_prs"]),
        "reused_exact_heads": len(reused),
        "computed_heads": len(computed),
        "missing_previous_names": sorted(set(old_heads) - set(by_name)),
        "summary": summary,
        "all_heads": refs,
        "computed_details": computed,
    }
    compressed = gzip.compress((json.dumps(result, separators=(",", ":")) + "\n").encode(), mtime=0)
    (OUT / "CENSUS_EXTENSION_DETAILS.json.gz").write_bytes(compressed)
    compact = {k: v for k, v in result.items() if k not in {"all_heads", "computed_details"}}
    compact["computed"] = [{"name": r["name"], "sha": r["sha"], "classification": {t: c["classification"] for t, c in r["comparison"].items()}} for r in computed]
    compact["details_sha256"] = hashlib.sha256(compressed).hexdigest()
    (OUT / "CENSUS_EXTENSION.json").write_text(json.dumps(compact, indent=2) + "\n")
    print(json.dumps(compact, indent=2))


if __name__ == "__main__":
    main()
