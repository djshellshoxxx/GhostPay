#!/usr/bin/env python3
"""Dropped-fix lead detector.

For every non-merge commit whose subject starts with `fix` in the ancestry of TARGET, measure how many of the source
lines it added still exist in TARGET's version of the same file. A low survival ratio is a lead, not proof: the code
may have moved to another file, been rewritten, or been superseded. Each lead needs a manual check, and a "lost"
verdict needs a test that fails on TARGET because the protection is missing.

Usage: python3 lost-fix-scan.py <target-ref> <out.json>      (run from the repository root; needs full history)
Purpose: this scan found that merge 84c2c185 (2026-10-22) had dropped fixes that audits recorded as present.
Author: Claude Code session (GhostPay completion run), 2026-11-11. Licence: same as the repository."""
import subprocess, sys, re, json
target = sys.argv[1]
def sh(*a):
    return subprocess.run(a, capture_output=True, text=True, errors='replace').stdout
commits = [l.split('\t', 2) for l in sh('git', 'log', '--no-merges', '--format=%H\t%cI\t%s', target).splitlines()]
commits = [c for c in commits if len(c) == 3 and re.match(r'^fix(\(|:|!)', c[2])]
skip = re.compile(r'(\.test\.|/test/|\.t\.sol$|^docs/|\.md$|package-lock\.json$|/dist/|\.json$|\.snap$|/e2e/|\.gas-snapshot$|testutil)')
cache = {}
def target_lines(path):
    if path not in cache:
        txt = sh('git', 'show', f'{target}:{path}')
        cache[path] = set(l.strip() for l in txt.splitlines()) if txt else None
    return cache[path]
out = []
for h, date, subj in commits:
    diff = sh('git', 'show', '--format=', '-U0', '--no-renames', h)
    path = None; per = {}
    for line in diff.splitlines():
        if line.startswith('+++ '):
            path = line[6:] if line.startswith('+++ b/') else None
            continue
        if path is None or skip.search(path): continue
        if line.startswith('+') and not line.startswith('+++'):
            t = line[1:].strip()
            if len(t) < 28 or t.startswith(('//', '*', '/*', '#', 'import ', '}', '{')): continue
            per.setdefault(path, []).append(t)
    total = present = 0; files = []
    for pth, lines in per.items():
        tl = target_lines(pth)
        if tl is None:
            files.append((pth, len(lines), None)); continue
        p = sum(1 for l in lines if l in tl)
        total += len(lines); present += p
        files.append((pth, len(lines), p))
    if total >= 4:
        out.append(dict(commit=h[:9], date=date[:10], subject=subj[:110], added=total, surviving=present, ratio=round(present / total, 2),
                        files=[dict(path=f, added=a, surviving=s) for f, a, s in files]))
json.dump(out, open(sys.argv[2], 'w'), indent=1)
low = [o for o in out if o['ratio'] < 0.5]
print(f"fix commits analysed: {len(out)}; with <50% of added source lines surviving: {len(low)}")
for o in sorted(low, key=lambda o: (o['ratio'], -o['added']))[:60]:
    worst = sorted([f for f in o['files'] if f['surviving'] is not None], key=lambda f: (f['surviving'] / max(1, f['added'])))[:2]
    print(f"{o['commit']} {o['date']} {o['surviving']}/{o['added']}  {o['subject'][:84]}  [{'; '.join(f['path'].split('/')[-1] + ' ' + str(f['surviving']) + '/' + str(f['added']) for f in worst)}]")
