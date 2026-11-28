#!/usr/bin/env bash
# Create an isolated SECONDARY worktree with installed dependencies and prebuilt libraries.
# Usage: mkwt.sh <worktree-name> <new-branch-name> [base-ref]
# The worktree lands in /workspace/wt/<worktree-name>. node_modules and packages/*/dist are copied from the
# fully installed and built base checkout /workspace/GhostPay (whose HEAD must equal the base ref for dist to match).
set -euo pipefail
name="$1"; branch="$2"; base="${3:-origin/main}"
src=/workspace/GhostPay
dst=/workspace/wt/$name
mkdir -p /workspace/wt
git -C "$src" fetch -q origin main
git -C "$src" worktree add -b "$branch" "$dst" "$base"
cp -a "$src/node_modules" "$dst/"
for d in "$src"/apps/*/node_modules "$src"/packages/*/node_modules; do
  [ -d "$d" ] || continue
  rel="${d#$src/}"
  cp -a "$d" "$dst/$rel"
done
for d in "$src"/packages/*/dist; do
  [ -d "$d" ] || continue
  rel="${d#$src/}"
  cp -a "$d" "$dst/$rel"
done
echo "worktree ready: $dst on $branch from $(git -C "$dst" rev-parse --short HEAD)"
echo "If base differs from $(git -C "$src" rev-parse --short HEAD), run: npm run build:libs"
