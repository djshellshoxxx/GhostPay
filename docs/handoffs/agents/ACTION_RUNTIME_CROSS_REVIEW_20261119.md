# Independent create-pull-request runtime review — 2026-11-19

**Verdict: PASS for the two scoped source changes and the action interface.**
Reviewer: `contract_security`. Root source commit:
`f42553ab44d2bf8f544f0287656bbc184679014d`.

The change replaces one action pin in each of
`.github/workflows/ghostpay-codex-cloud.yml` and
`.github/workflows/ghostpay-parallel-review.yml`:

| Pin | Upstream commit | Declared runtime |
| --- | --- | --- |
| Previous `v7` | `22a9089034f40e5a961c8808d113e2c98fb63676` | `node20` |
| New `v8.1.3` | `3ffccacd46053766916f087ce41d627c0b8cf2d1` | `node24` |

Each full workflow is byte-for-byte equal to its parent after applying that
single SHA/version-comment replacement. No other file changes in the source
commit. Triggers, conditions, permissions, token expressions, permitted paths,
draft rules, paid activation, exact-head approval requirements and check gates
are unchanged. Both workflow files use `ubuntu-24.04` runners. The parallel
publisher remains draft-only; the cloud publisher retains its existing
validation-dependent draft expression.

## Independently checked upstream interface

The reviewer independently retrieved `action.yml` at both exact pinned commits
from the upstream repository. Their Git blob IDs are
`9d28570cb5eeba6ff4850b6ea9a4bbe21bdbe46f` and
`e09c1f3ba9e9673bfbde34d7dbf2a9529cb1fef8`, respectively. Their only manifest
difference is `runs.using: node20` to `runs.using: node24`. All input definitions,
defaults, outputs and the `dist/index.js` entry point are identical. Every input
and output referenced by these two workflows remains defined.

The independently retrieved
[v8.1.3 tag ref](https://api.github.com/repos/peter-evans/create-pull-request/git/refs/tags/v8.1.3)
resolves directly to the newly pinned commit. The
[old manifest](https://github.com/peter-evans/create-pull-request/blob/22a9089034f40e5a961c8808d113e2c98fb63676/action.yml),
[new manifest](https://github.com/peter-evans/create-pull-request/blob/3ffccacd46053766916f087ce41d627c0b8cf2d1/action.yml)
and ref response are retained in
`evidence/action-runtime-cross-review-20261119/`. The reviewer verifies the
manifest Git blob hashes against the independent tool responses, in addition to
recording SHA-256. No setup-python update is included in this change.

## Qualification and limits

The coordinator ran the existing automation-hardening, cloud-workflow and
parallel-review suites at the exact source commit: **33/33 passed**, none
skipped, process exit **0**, elapsed **2.388 seconds**. The pinned-action check
inspected **114** action references and passed. The secret scan and diff check
also exited **0**. Their original receipt and four logs are archived verbatim
with hashes and explicitly attributed to the coordinator; the reviewer did not
rerun those suites.

The independent [verifier](evidence/action-runtime-cross-review-20261119/verify.py)
checks the exact committed source difference, both upstream manifest blobs, tag
resolution, interface references and those archived result claims. It reads Git
objects and evidence files only:

```sh
python3 docs/handoffs/agents/evidence/action-runtime-cross-review-20261119/verify.py \
  --repository /absolute/path/to/GhostPay
```

The [machine review](ACTION_RUNTIME_CROSS_REVIEW_20261119.json) records the
source-file hashes, used inputs/outputs and artifact hashes. This is an
interface and source review, not a full audit of the upstream bundled
JavaScript or a live action execution. No workflow was dispatched and no pull
request was created for this verification. The unchanged strict analyzer
failure and hosted release or merge decisions remain outside this maintenance
review.
