# Original source history

The integration branch is published through GitHub's Git Data API using an
exactly verified tree and a normal branch-ref lease. That preserves the delivered
files, but an aggregate publication commit does not automatically make every
original local worker commit available to a fresh clone. Some evidence tools
intentionally read those earlier commits with `git show`.

`remaining-work-original-history.bundle` preserves this workstream's original
2026-11-19 branch heads and their nonpublic ancestry. `manifest.json` freezes the
ref, commit and tree identities, archive digest, public prerequisites and actual
fresh-repository verification. The unrelated read-only 2026-11-18 branch is not
included as an advertised ref. This archive is evidence, not another candidate
to merge wholesale.

## Load the original evidence commits

Use a full clone of the repository. Fetch the public prerequisite commits listed
in `manifest.json` before importing the bundle; a shallow checkout may not contain
their complete ancestry. The archive's actual prerequisites are also printed by
`git bundle verify`. Fetching the public prerequisite tips recorded in the
manifest supplies those boundary objects.

From the repository root:

```sh
python docs/completion/remaining-20261119/provenance/verify-history.py
git fetch docs/completion/remaining-20261119/provenance/remaining-work-original-history.bundle 'refs/heads/chatgpt/*:refs/remotes/remaining-evidence/*'
python docs/completion/remaining-20261119/provenance/verify-history.py --check-imported
```

The fetch stores evidence refs in a separate namespace and does not replace a
working branch. Original source hashes can then be used by the archived evidence
tools. Historical public-PR references and upstream-project action/OP references
remain public source citations; consult their recorded repository and PR rather
than treating them as newly authored work.

Restoring commit objects does not install Node or Foundry and does not rewrite
verbatim capture scripts. Some older OP and Mythril harnesses retain absolute
session paths or sibling-worktree assumptions. Their execution records are
preserved as captured; reproducing those runs requires mapping the recorded
paths and installing the pinned dependencies. The repository-aware comparison
and read-only verification tools are distinguished from those historical
execution harnesses in the verification receipt.

The capture commit precedes the generated ledger and archive-record commit.
An archive cannot contain its own enclosing commit. The publication record's
verified tree identifies the final delivered files; the bundle identifies the
original implementation and execution sources. Neither mechanism implies that
all required checks passed or that the candidate merged into main.
