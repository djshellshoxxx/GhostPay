# Owner action: protect `main` and release tags

`main` had no branch protection and no rulesets when PR #203 merged (API `404 Branch not protected`, `rulesets: []`).
The GitHub tools available to Claude sessions cannot change repository settings, so this is an owner action. Run the
script below on your own machine with an authenticated `gh` (repository admin). It saves the previous protection,
is safe to rerun, and prints the resulting required checks.

Choices encoded here:

- **Required checks:** only CI jobs that run on every pull request and report success when skipped for a docs-only
  change: `typescript`, `contracts`, `e2e (full)`, `e2e (lean)`, `lean-candidate`, `secrets-and-egress`, and `CodeQL`.
  Path-filtered workflows (Pages, Beta acceptance, Integration, Hosting kit, CLI operator, Contract analysis) are not
  required, because a pull request that does not touch their paths would otherwise wait forever. Contract analysis is
  enforced at release time by `release.yml` instead.
- **Pull request required, zero approvals:** a solo maintainer cannot approve their own PR; raise the count when a
  second reviewer exists. `enforce_admins` is off so the owner can still recover from a broken check.
- **No force pushes or deletion of `main`.**
- **`v*` tags:** a tag ruleset blocks deleting or moving release tags (creation stays allowed).
- **Rollback:** `gh api -X DELETE repos/djshellshoxxx/GhostPay/branches/main/protection`, and delete the
  "Protect release tags" ruleset under Settings → Rules.

Target shell: bash. Privilege: GitHub repository admin. No values to supply.

```bash
#!/usr/bin/env bash
# Protect GhostPay main and v* tags. Run on your own machine with an authenticated `gh` (repo admin).
set -euo pipefail
REPO="djshellshoxxx/GhostPay"
command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login" >&2; exit 1; }
backup="$(mktemp -t ghostpay-protection-XXXX.json)"
gh api "repos/$REPO/branches/main/protection" > "$backup" 2>/dev/null || echo '{}' > "$backup"
echo "Previous protection saved to $backup (rollback: gh api -X DELETE repos/$REPO/branches/main/protection)"

# Required checks: only always-running CI aggregates (they pass when skipped for docs-only changes).
# Path-filtered workflows (Pages, Beta, Integration, Hosting, CLI, Contract analysis) are deliberately not required.
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON' >/dev/null
{
  "required_status_checks": {
    "strict": false,
    "checks": [
      {"context": "typescript"},
      {"context": "contracts"},
      {"context": "e2e (full)"},
      {"context": "e2e (lean)"},
      {"context": "lean-candidate"},
      {"context": "secrets-and-egress"},
      {"context": "CodeQL"}
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": false
}
JSON
echo "main protection applied"

# v* tags: block deletion, update (moving a tag) and non-fast-forward; creation stays open to the admin.
if gh api "repos/$REPO/rulesets" --jq '.[].name' | grep -qx 'Protect release tags'; then
  echo "tag ruleset already present"
else
  gh api -X POST "repos/$REPO/rulesets" --input - <<'JSON' >/dev/null
{
  "name": "Protect release tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["refs/tags/v*"], "exclude": []}},
  "rules": [{"type": "deletion"}, {"type": "update"}, {"type": "non_fast_forward"}]
}
JSON
  echo "tag ruleset created"
fi
gh api "repos/$REPO/branches/main/protection" --jq '{checks: [.required_status_checks.checks[].context], force_push: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
```
