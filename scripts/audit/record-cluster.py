#!/usr/bin/env python3
"""Record one fix-cluster result into the audit data set (docs/audits/data/24/status.json).

Purpose: each fix round (implementation plus adversarial review) returns a JSON result; this keeps the per-item
outcomes and the review issues next to the findings, so gen-audit24-report.py and the next agent can read them.
Written by Claude Code (AI agent) for GhostPay, 2026-10-29; same licence as the repository.

Usage: python3 scripts/audit/record-cluster.py RESULT.json [--data DIR]
RESULT.json is either the result object itself or a wrapper {"result": {...}}, shaped like the output of
scripts/agents/fix-audit-cluster.js: {cluster, branch, approved, rounds, impl: {commits, items, commands,
open_questions}, review: {summary, issues}}. Commit entries must be bare SHAs (strip any message first).
"""
import argparse
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser(description='Record a fix-cluster result into status.json')
ap.add_argument('result')
ap.add_argument('--data', default=os.path.join(ROOT, 'docs', 'audits', 'data', '24'))
args = ap.parse_args()

raw = json.load(open(args.result))
obj = raw.get('result', raw)
bad = [c for c in obj['impl']['commits'] if not re.fullmatch(r'[0-9a-f]{7,40}', c)]
if bad:
    raise SystemExit(f'commits must be bare SHAs: {bad}')
path = os.path.join(args.data, 'status.json')
st = json.load(open(path)) if os.path.exists(path) else {}
cid = obj['cluster']
for it in obj['impl']['items']:
    st[it['id']] = {'cluster': cid, 'outcome': it['outcome'], 'change': it['change'],
                    'tests': it.get('tests', ''), 'fail_before': it.get('fail_before', '')}
review = obj.get('review') or {}
st.setdefault('_clusters', {})[cid] = {
    'branch': obj['branch'], 'approved': obj['approved'], 'rounds': obj['rounds'],
    'commits': obj['impl']['commits'], 'commands': obj['impl'].get('commands', ''),
    'review_summary': review.get('summary', ''), 'review_issues': review.get('issues', []),
    'open_questions': obj['impl'].get('open_questions', '')}
with open(path, 'w') as f:
    json.dump(st, f, indent=1)
print(f"cluster {cid}: approved={obj['approved']} rounds={obj['rounds']} commits={len(obj['impl']['commits'])}")
for it in obj['impl']['items']:
    print(f"  {it['id']}: {it['outcome']}")
print('  review issues:', [(i['severity'], i['where'][:60]) for i in review.get('issues', [])])
