# Evidence notes

This packet retains successful, failed and restricted attempts. Read each result with its source identity and the completion report; a failed attempt is not converted into a pass by a later successful run.

- `SOURCE_MANIFEST.json` pins the 33 changed files in local `8461dbdf`, published as `07a7497d`, before this final documentation/evidence commit.
- `PUBLICATION_MAP.json` maps local commits to published commits with identical full Git trees. The final documentation commit is identified by the PR and Git history, avoiding a self-referential hash.
- `crypto-evidence/` contains original-threshold crypto/vault coverage, fresh-environment standalone recovery, pinned Foundry authority proof and the passphrase-input red/green finding.
- `lifecycle-evidence/` contains the atomic replacement and verification regression history, report with source hashes, and final test-fixture follow-up.
- `coordinator/` preserves download retry red/green, catalog/extraction attempts, local process/heap failures and the failed full-web coverage run.
- `hosted/` contains decoded job logs and job-status snapshots for the source-pinned published candidates. Git checkout and workflow URLs identify the executed source.

Historical local wrapper fields named `source` and `tree` identify Git HEAD when the command started. They do not prove a dirty or changing worktree was immutable. The completion report explicitly identifies those limitations; no killed attempt is used as positive exact-source validation. The local full-web run also overlapped a receiver-binding-only test edit and is retained as failed/incomplete evidence. The corrected hosted checkout and final focused source manifest are the immutable-input validation references.

Logs contain synthetic test data and public CI output. No real wallet was used. Complete test/key vectors remain in the existing repository vector files; these logs do not establish third-party wallet compatibility or a professional audit.

The final evidence index hashes stored artifact bytes. The index excludes itself to avoid a self-referential digest.

Raw `.log` artifacts retain original trailing spaces and terminal blank lines. The unrestricted `git diff --check` therefore reports log whitespace; source and human-authored documentation are checked separately with only these raw log artifacts excluded. No Git configuration, workflow, lint rule or security gate was changed. Log bytes and their hashes are preserved.
