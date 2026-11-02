#!/usr/bin/env bash
# Run a command against a clean export of HEAD as an unprivileged user, the way GitHub's runners do.
#
# Purpose: root ignores file modes, so a test can pass in a root container and fail in CI. One real case: the
# deploy/selftest.sh tarball fixture had 0644 directories, which only a non-root extract refuses (fixed in 915d710).
# Written by Claude Code (AI agent) for GhostPay, 2026-10-29; same licence as the repository.
#
# Usage (as root): scripts/dev/nonroot-run.sh [--user NAME] -- COMMAND [ARGS...]
#   e.g. scripts/dev/nonroot-run.sh -- bash deploy/selftest.sh
# The command runs in a fresh `git archive HEAD` copy under the user's home (no node_modules, no untracked files),
# so it suits shell and Python checks; for npm steps, run `npm ci` inside the command first.
# Creates the user (no password, no sudo) when it does not exist. The copy is removed afterwards.
set -euo pipefail

user="ghosttest"
while [ $# -gt 0 ]; do
  case "$1" in
    --user) user="${2:?--user needs a name}"; shift 2 ;;
    --) shift; break ;;
    *) echo "usage: $0 [--user NAME] -- COMMAND [ARGS...]" >&2; exit 2 ;;
  esac
done
[ $# -gt 0 ] || { echo "usage: $0 [--user NAME] -- COMMAND [ARGS...]" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "run as root: it switches to the unprivileged user itself" >&2; exit 2; }
case "$user" in (*[!a-z0-9_-]*|'') echo "bad user name: $user" >&2; exit 2 ;; esac

root="$(git rev-parse --show-toplevel)"
if ! id "$user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$user"
fi
home="$(getent passwd "$user" | cut -d: -f6)"
# The work dir must be reachable by the user: some container temp dirs are mode 700 and owned by root.
work="$(mktemp -d "$home/nonroot-run.XXXXXX")"
trap 'rm -rf "$work"' EXIT
git -C "$root" archive --format=tar HEAD | tar -x -C "$work"
chown -R "$user:" "$work"

# Quote each argument for the inner shell.
cmd=""
for a in "$@"; do cmd+=" $(printf '%q' "$a")"; done
su -s /bin/bash "$user" -c "cd $(printf '%q' "$work") &&$cmd"
