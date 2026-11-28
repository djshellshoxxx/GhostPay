#!/usr/bin/env python3
"""Mechanical branch census for GhostPay post-consolidation audit.
Usage: python3 -I branch_census.py <repo> <candidate_sha> <main_sha> <out_json>
For every refs/remotes/origin/* head and refs/remotes/pr/* head: ancestry vs main and candidate,
unique-commit counts, patch-id equivalence (git cherry), and whether files touched by unique commits
already match the candidate tree byte-for-byte."""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

repo, cand, main, out = sys.argv[1:5]

def git(*args, check=True):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r

def is_anc(a, b):
    return git("merge-base", "--is-ancestor", a, b, check=False).returncode == 0

def analyze(ref):
    name, sha = ref
    info = {"ref": name, "sha": sha}
    log = git("log", "-1", "--format=%cI%x00%an%x00%s", sha).stdout.rstrip("\n").split("\x00")
    info["date"], info["author"], info["subject"] = log[0], log[1], log[2][:160]
    info["ancestor_of_main"] = is_anc(sha, main)
    info["ancestor_of_candidate"] = is_anc(sha, cand)
    if info["ancestor_of_candidate"]:
        info.update(ahead_of_candidate=0, unique_patch_commits=0, equivalent_patch_commits=0,
                    unique_files=[], unique_files_differ_from_candidate=[])
        return info
    ahead = git("rev-list", "--count", "--no-merges", f"{cand}..{sha}").stdout.strip()
    info["ahead_of_candidate"] = int(ahead)
    info["ahead_of_main"] = int(git("rev-list", "--count", "--no-merges", f"{main}..{sha}").stdout.strip())
    cherry = git("cherry", cand, sha, check=False).stdout.split("\n")
    plus = [l[2:] for l in cherry if l.startswith("+ ")]
    minus = [l[2:] for l in cherry if l.startswith("- ")]
    info["unique_patch_commits"] = len(plus)
    info["equivalent_patch_commits"] = len(minus)
    files = set()
    for c in plus:
        r = git("diff-tree", "--no-commit-id", "--name-only", "-r", "-m", c, check=False).stdout.split("\n")
        files.update(f for f in r if f)
    files = sorted(files)
    differ = []
    for f in files:
        a = git("rev-parse", "--verify", "-q", f"{sha}:{f}", check=False).stdout.strip()
        b = git("rev-parse", "--verify", "-q", f"{cand}:{f}", check=False).stdout.strip()
        if a != b:
            differ.append({"path": f, "in_branch": bool(a), "in_candidate": bool(b)})
    info["unique_files"] = files
    info["unique_files_differ_from_candidate"] = differ
    info["unique_subjects"] = [git("log", "-1", "--format=%h %s", c).stdout.strip()[:140] for c in plus[:40]]
    mb = git("merge-base", cand, sha, check=False).stdout.strip()
    info["merge_base_with_candidate"] = mb
    return info

refs = []
for line in git("for-each-ref", "--format=%(refname) %(objectname)", "refs/remotes/origin", "refs/remotes/pr").stdout.split("\n"):
    if not line or line.startswith("refs/remotes/origin/HEAD "):
        continue
    n, s = line.split(" ")
    refs.append((n.replace("refs/remotes/", ""), s))

with ThreadPoolExecutor(max_workers=8) as ex:
    results = list(ex.map(analyze, refs))
json.dump({"candidate": cand, "main": main, "refs": results}, open(out, "w"), indent=1)
print(len(results), "refs analyzed")
