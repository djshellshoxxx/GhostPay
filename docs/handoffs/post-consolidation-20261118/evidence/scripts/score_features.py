#!/usr/bin/env python3
"""Merge team feature JSON arrays, recompute requirement-weighted scores per FEATURE_RUBRIC.md,
flag inconsistencies, and emit aggregate completion statistics.
Usage: python3 -I score_features.py <out_merged.json> <out_stats.json> <out_issues.md> <in1.json> [in2.json ...]"""
import json, sys, collections

FACT = {"yes": 1.0, "half": 0.5, "no": 0.0}
STATUSES = {"VERIFIED_COMPLETE", "IMPLEMENTED_UNVERIFIED", "PARTIAL", "SPEC_ONLY", "NOT_STARTED", "EXPERIMENTAL", "BLOCKED"}
TIERS = ["beta-core", "beta-supporting", "full-profile", "experimental", "future"]

def r5(x):
    return int(5 * round(x / 5.0))

out_merged, out_stats, out_issues, *inputs = sys.argv[1:]
rows, issues, seen = [], [], {}
for path in inputs:
    data = json.load(open(path))
    if isinstance(data, dict):
        data = data.get("features", [])
    for f in data:
        f["_source"] = path.rsplit("/", 2)[-2] + "/" + path.rsplit("/", 1)[-1]
        fid = f.get("id")
        if not fid:
            issues.append(f"missing id in {path}: {f.get('name')}")
            continue
        if fid in seen:
            issues.append(f"duplicate id {fid} in {path} (first in {seen[fid]})")
            continue
        seen[fid] = path
        reqs = f.get("requirements") or []
        tw = sum(float(r.get("weight", 1)) for r in reqs)
        if tw <= 0:
            issues.append(f"{fid}: no weighted requirements")
            ci = cv = None
        else:
            ci = r5(100 * sum(float(r.get("weight", 1)) * FACT.get(str(r.get("implemented", "no")).lower(), 0) for r in reqs) / tw)
            # Rubric rule: a requirement counts as verified only to the extent it is implemented on its intended surface.
            cv = r5(100 * sum(float(r.get("weight", 1)) * min(FACT.get(str(r.get("verified", "no")).lower(), 0), FACT.get(str(r.get("implemented", "no")).lower(), 0)) for r in reqs) / tw)
            for r in reqs:
                if str(r.get("implemented", "")).lower() not in FACT or str(r.get("verified", "")).lower() not in FACT:
                    issues.append(f"{fid}: bad implemented/verified value in requirement '{r.get('req','')[:60]}'")
                if FACT.get(str(r.get("verified", "no")).lower(), 0) > FACT.get(str(r.get("implemented", "no")).lower(), 0):
                    issues.append(f"{fid}: requirement verified > implemented (verification capped at implementation): '{r.get('req','')[:60]}'")
        f["_total_weight"] = tw
        f["_computed_impl"] = ci
        f["_computed_verif"] = cv
        if ci is not None and f.get("implementation_pct") != ci:
            issues.append(f"{fid}: reported impl {f.get('implementation_pct')} != computed {ci} (computed used)")
        if cv is not None and f.get("verification_pct") != cv:
            issues.append(f"{fid}: reported verif {f.get('verification_pct')} != computed {cv} (computed used)")
        if ci is not None:
            f["implementation_pct"], f["verification_pct"] = ci, cv
        st = f.get("status")
        if st not in STATUSES:
            issues.append(f"{fid}: unknown status {st}")
        elif ci is not None and st not in ("EXPERIMENTAL", "BLOCKED"):
            exp = ("VERIFIED_COMPLETE" if ci == 100 and cv >= 90 and not f.get("confirmed_defects") else
                   "IMPLEMENTED_UNVERIFIED" if ci >= 90 else
                   "SPEC_ONLY" if ci < 10 and f.get("spec_refs") else
                   "NOT_STARTED" if ci < 10 else "PARTIAL")
            if exp != st:
                issues.append(f"{fid}: status {st} normalized to rubric-implied {exp}")
                f["_status_reported"] = st
                f["status"] = exp
        if f.get("tier") not in TIERS:
            issues.append(f"{fid}: unknown tier {f.get('tier')}")
        rows.append(f)

DUPLICATES = {"F-PROTO-13": "F-KEY-07, F-KEY-08 (spec 18 formats/envelope counted under F-KEY-07..12)",
              "F-FUT-40": "F-KEY-07..F-KEY-12 (spec 18 / req 3q counted once, under F-KEY rows)"}
for f in rows:
    if f["id"] in DUPLICATES:
        f["duplicate_of"] = DUPLICATES[f["id"]]
counted = [f for f in rows if not f.get("duplicate_of")]

def agg(sel):
    sel = [f for f in sel if not f.get("duplicate_of")]
    tw = sum(f["_total_weight"] for f in sel if f["_total_weight"])
    if not tw:
        return None
    impl = sum(f["_total_weight"] * f["implementation_pct"] for f in sel if f["_total_weight"]) / tw
    ver = sum(f["_total_weight"] * f["verification_pct"] for f in sel if f["_total_weight"]) / tw
    return {"features": len(sel), "weight": tw, "impl_pct": round(impl, 1), "verif_pct": round(ver, 1)}

stats = {"total_features": len(counted), "total_rows": len(rows),
         "by_status": dict(collections.Counter(f.get("status") for f in counted)),
         "by_tier": dict(collections.Counter(f.get("tier") for f in counted)),
         "by_tier_status": {t: dict(collections.Counter(f.get("status") for f in counted if f.get("tier") == t)) for t in TIERS},
         "aggregate": {t: agg([f for f in rows if f.get("tier") == t]) for t in TIERS},
         "aggregate_all_excluding_future": agg([f for f in rows if f.get("tier") != "future"]),
         "aggregate_release_scope_beta": agg([f for f in rows if f.get("tier") in ("beta-core", "beta-supporting")]),
         "aggregate_all": agg(rows),
         "effort_days_unfinished": [sum((f.get("effort") or {}).get("engineer_days", [0, 0])[i] for f in counted if f.get("status") != "VERIFIED_COMPLETE") for i in (0, 1)],
         "effort_days_unfinished_excluding_future": [sum((f.get("effort") or {}).get("engineer_days", [0, 0])[i] for f in counted if f.get("status") != "VERIFIED_COMPLETE" and f.get("tier") != "future") for i in (0, 1)],
         "effort_days_unfinished_beta_scope": [sum((f.get("effort") or {}).get("engineer_days", [0, 0])[i] for f in counted if f.get("status") != "VERIFIED_COMPLETE" and f.get("tier") in ("beta-core", "beta-supporting")) for i in (0, 1)],
         "duplicates_excluded": sorted(DUPLICATES),
         "issues": len(issues)}
json.dump(rows, open(out_merged, "w"), indent=1)
json.dump(stats, open(out_stats, "w"), indent=1)
open(out_issues, "w").write("# Scoring consistency issues\n\n" + "\n".join(f"- {i}" for i in issues) + "\n")
print(json.dumps(stats, indent=1))
