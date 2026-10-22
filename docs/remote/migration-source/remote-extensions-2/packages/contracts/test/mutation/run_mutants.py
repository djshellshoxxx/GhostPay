#!/usr/bin/env python3
"""Run gambit mutants against the Foundry suite in isolated project copies.

usage: run_mutants.py <gambit_outdir> <results.json> [--workers N] [--timeout S]

A mutant is KILLED if `forge test --fail-fast` exits non-zero (or times out), SURVIVED if the
whole suite passes, INVALID if it does not compile (excluded from the score).
Uses FOUNDRY_PROFILE=dev (fuzz 256 runs, invariant 64 runs) so ~500 mutants finish in reasonable
time; this is weaker than the CI profile, which makes the reported score a conservative-to-
comparable estimate only for fuzz-dependent kills.
"""
import json, os, shutil, subprocess, sys, tempfile, argparse
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument("outdir"); ap.add_argument("results")
ap.add_argument("--workers", type=int, default=4)
ap.add_argument("--timeout", type=int, default=600)
ap.add_argument("--project", default=os.getcwd())
a = ap.parse_args()
muts = json.load(open(os.path.join(a.outdir, "gambit_results.json")))
proj = os.path.abspath(a.project)
work = tempfile.mkdtemp(prefix="mut_")

def clone(i):
    d = os.path.join(work, f"w{i}")
    os.makedirs(d)
    for item in ("src", "test", "script", "foundry.toml", "remappings.txt"):
        p = os.path.join(proj, item)
        if os.path.isdir(p): shutil.copytree(p, os.path.join(d, item))
        elif os.path.exists(p): shutil.copy(p, d)
    os.symlink(os.path.join(proj, "lib"), os.path.join(d, "lib"))
    return d

dirs = [clone(i) for i in range(a.workers)]
free = list(range(a.workers))
import threading
lock = threading.Lock()

def run(m):
    with lock: w = free.pop()
    d = dirs[w]
    dst = os.path.join(d, m["original"])
    orig = os.path.join(proj, m["original"])
    shutil.copy(os.path.join(a.outdir, m["name"]), dst)
    env = dict(os.environ, FOUNDRY_PROFILE="dev")
    try:
        r = subprocess.run(["forge", "test", "--offline", "--fail-fast"], cwd=d, env=env,
                           capture_output=True, text=True, timeout=a.timeout)
        out = r.stdout + r.stderr
        if r.returncode == 0: st = "SURVIVED"
        elif "Compiler run failed" in out or "Error (" in out and "Ran " not in out: st = "INVALID"
        else: st = "KILLED"
        killer = ""
        for line in out.splitlines():
            if line.startswith("[FAIL"): killer = line.strip()[:200]; break
    except subprocess.TimeoutExpired:
        st, killer = "KILLED", "timeout"
    shutil.copy(orig, dst)
    with lock: free.append(w)
    print(m["id"], st, flush=True)
    return {"id": m["id"], "status": st, "killer": killer, "description": m["description"],
            "file": m["original"], "diff": m["diff"]}

with ThreadPoolExecutor(a.workers) as ex:
    res = list(ex.map(run, muts))
json.dump(res, open(a.results, "w"), indent=1)
c = {s: sum(r["status"] == s for r in res) for s in ("KILLED", "SURVIVED", "INVALID")}
valid = c["KILLED"] + c["SURVIVED"]
print(c, f"score={c['KILLED']}/{valid}={100*c['KILLED']/max(valid,1):.1f}%")
shutil.rmtree(work, ignore_errors=True)
