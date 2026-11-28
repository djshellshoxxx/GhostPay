#!/usr/bin/env bash
# Back up the SECONDARY tracker and reports to origin/secondary/tracker.
set -euo pipefail
cd /workspace/secondary/trackerwt
git pull -q --ff-only origin secondary/tracker || true
mkdir -p reports
cp /workspace/secondary/TRACKER.md .
cp /workspace/secondary/reports/*.md reports/ 2>/dev/null || true
cp /workspace/secondary/lock.sh /workspace/secondary/mkwt.sh /workspace/secondary/sync.sh .
git add -A
if ! git diff --cached --quiet; then git commit -q -m "secondary: tracker backup ${1:-update}"; git push -q origin secondary/tracker; echo pushed; else echo unchanged; fi
