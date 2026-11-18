# Initial Pages candidate publication — 2026-11-18

Draft PR: https://github.com/djshellshoxxx/GhostPay/pull/238

| Item | Exact value |
| --- | --- |
| Remote branch | `integration/ghostpay-pages-completion-20261118` |
| Original local candidate | `e8c77e7e8699dd16b86b7a1ff90b834594d07105` |
| Published candidate | `9bad95e5cc0ee73f5adb8d2c587161074b21e080` |
| Identical tree | `81341de7972041b5f7ce53da76027846356fab90` |
| Main before and after publication | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Recreated local commits | 61 |
| Preserved merge commits | 15 |
| Verified root trees | 61 |
| Uploaded distinct blobs | 95 |

## What was verified

Every created blob and root tree returned the expected local SHA. Every recreated commit was read back through the Git Data API: its tree, ordered parents and complete provenance trailers matched the publication plan. All 12 reused remote boundary-parent commits were fetched and confirmed at their original identities. The final PR head, branch, base and draft status were verified, and main remained unchanged.

The connector cannot set author/date fields. Every reconstructed commit therefore records Original-Local-Commit, Original-Author, Original-Author-Date, Original-Committer, Original-Committer-Date and Original-Parent-Commits. No published commit was rewritten and no force update, branch deletion, main merge, deployment or release occurred.

## Local remote-object inventory corrections

The initial missing-object calculation used the absolute `git rev-list --objects --remotes=origin` object set. GitHub rejected two blobs that existed in that local inventory. Only those API-rejected blobs were restored from exact local bytes, and their returned hashes matched:

- `56c6f59ae4184c9c356e33581a0a1a6e1a7e696a`: apps/web/src/lib/scanClient.ts
- `0b7718da4874ad99b1329fde88a57fe893e41f59`: apps/web/src/AppShell.tsx

## Qualification boundary

This is a draft publication and transport-verification result. Combined tests and hosted qualification remain coordinator-owned and were explicitly pending in the PR body. The CI owner was notified of the published head. Final documentation deltas can be appended with the recorded mapping and a non-force, expected-head fast-forward.

## Provenance files

- `publication-map.json`: complete ordered local-to-remote commit mapping, original author/committer metadata, original messages, parent mapping and PR verification.
- `publication-map.sha256`: SHA-256 of the current mapping file (`c047b2e53a548d53c6434b8acc8a7312b663d966abe50a327faa198c677fb2c6`).
- `publication-events.jsonl`: append-only per-object mutation and verification records.
- `publication-plan.json`: original immutable commit records and per-tree diffs.
- `publication-state.json`: resumable verified-object and commit state.
- `remote-objects.txt`, `target-objects.txt`: absolute object inventory used for the initial difference.

The repository worktree was read only throughout publication; all local publisher files are under `analysis-publish/`.
