#!/usr/bin/env python3
"""Render FEATURE_COMPLETION_MATRIX.md from merged feature JSON + stats.
Usage: python3 -I render_matrix.py <merged.json> <stats.json> <out.md> <header.md>"""
import json, sys
merged, stats, out, header = sys.argv[1:5]
rows = json.load(open(merged)); st = json.load(open(stats))
TIERS = ["beta-core", "beta-supporting", "full-profile", "experimental", "future"]
def esc(x):
    return str(x).replace("|", "\\|").replace("\n", " ")
def lst(x, n=6):
    x = x or []
    s = "; ".join(esc(i if isinstance(i, str) else json.dumps(i, ensure_ascii=False)) for i in x[:n])
    return s + (f" (+{len(x)-n} more)" if len(x) > n else "")
L = [open(header).read().rstrip(), "", "## Summary", ""]
L.append(f"Distinct features: **{st['total_features']}** ({st.get('total_rows')} rows; duplicates excluded from all counts and aggregates: {', '.join(st.get('duplicates_excluded', []))}). Status counts: " + ", ".join(f"{k} {v}" for k, v in sorted(st['by_status'].items())) + ".")
L += ["", "| Tier | Features | Requirement weight | Implementation % (weighted) | Verification % (weighted) | Status mix |", "|---|---:|---:|---:|---:|---|"]
for t in TIERS:
    a = st["aggregate"].get(t)
    if a:
        mix = ", ".join(f"{k} {v}" for k, v in sorted(st["by_tier_status"][t].items()))
        L.append(f"| {t} | {a['features']} | {a['weight']:.0f} | {a['impl_pct']} | {a['verif_pct']} | {mix} |")
for key, label in (("aggregate_release_scope_beta", "Beta scope (beta-core + beta-supporting)"), ("aggregate_all_excluding_future", "All tiers excluding future roadmap"), ("aggregate_all", "All tiers including future roadmap")):
    a = st.get(key)
    if a:
        L.append(f"| **{label}** | {a['features']} | {a['weight']:.0f} | **{a['impl_pct']}** | **{a['verif_pct']}** | |")
lo, hi = st["effort_days_unfinished"]
L += ["", f"Estimated remaining engineering effort for all non-complete rows (ESTIMATE, sum of per-row ranges, before parallelism): **{lo:.0f}–{hi:.0f} engineer-days**.", ""]
for t in TIERS:
    sel = [f for f in rows if f.get("tier") == t]
    if not sel:
        continue
    L += [f"## Tier: {t}", "", "| ID | Feature | Impl % | Verif % | Status | Effort | Strategy | Source team |", "|---|---|---:|---:|---|---|---|---|"]
    for f in sorted(sel, key=lambda f: f["id"]):
        e = f.get("effort") or {}
        d = e.get("engineer_days") or [0, 0]
        L.append(f"| {f['id']} | {esc(f.get('name',''))} | {f.get('implementation_pct')} | {f.get('verification_pct')} | {f.get('status')} | {e.get('size','')} ({d[0]}–{d[1]}d) | {f.get('strategy','')} | {f.get('_source','').split('/')[0]} |")
    L.append("")
L += ["## Per-feature detail", ""]
for f in sorted(rows, key=lambda f: (TIERS.index(f.get("tier")) if f.get("tier") in TIERS else 9, f["id"])):
    L += [f"### {f['id']} — {esc(f.get('name',''))}", "",
          f"- Tier/area: {f.get('tier')} / {esc(f.get('area',''))}. Status: **{f.get('status')}**" + (f" (reported {f['_status_reported']}, normalized by rubric)" if f.get('_status_reported') else "") + (f" — security hold: {esc(f['status_hold'])}" if f.get('status_hold') else "") + (f" — DUPLICATE of {esc(f['duplicate_of'])}, excluded from counts" if f.get('duplicate_of') else "") + f". Implementation {f.get('implementation_pct')}% · Verification {f.get('verification_pct')}% (requirement weight {f.get('_total_weight')}).",
          f"- Spec: {lst(f.get('spec_refs'))}",
          f"- Implementation: {lst(f.get('implementation_files'), 8)}",
          f"- Tests: {lst(f.get('test_files'), 8)}",
          f"- Verified working: {lst(f.get('verified_working'))}",
          f"- Missing requirements: {lst(f.get('missing_requirements'))}",
          f"- Confirmed defects: {lst(f.get('confirmed_defects'))}",
          f"- Missing tests: {lst(f.get('missing_tests'))}",
          f"- Security/privacy: {lst(f.get('security_privacy_requirements'))}",
          f"- Dependencies: {lst(f.get('dependencies'))}. Blockers: {lst(f.get('blockers'))}",
          f"- External acceptance: {esc(f.get('external_acceptance',''))}",
          f"- Related branches/PRs: {lst([ (b.get('ref','')+'@'+str(b.get('sha',''))[:8]+(' #'+str(b.get('pr')) if b.get('pr') else '')+(' '+b.get('note','') if b.get('note') else '')) for b in (f.get('related_branches') or []) ])}",
          f"- Strategy: **{f.get('strategy','')}** — {esc(f.get('strategy_detail',''))}",
          f"- Effort (estimate): {(f.get('effort') or {}).get('size','')} {(f.get('effort') or {}).get('engineer_days','')} engineer-days",
          f"- Unverified: {lst(f.get('unverified'))}", ""]
open(out, "w").write("\n".join(L) + "\n")
print("rendered", len(rows), "features ->", out)
