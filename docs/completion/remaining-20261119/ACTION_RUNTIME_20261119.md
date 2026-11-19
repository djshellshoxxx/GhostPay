# GitHub Action runtime maintenance — 2026-11-19

Implementation: `f42553ab44d2bf8f544f0287656bbc184679014d`.
Historical input: PR #207 at `199ab7ef1e80e6368fdc17c09b94c87a62871861`.

The two existing `peter-evans/create-pull-request` references now use the reviewed
v8.1.3 commit `3ffccacd46053766916f087ce41d627c0b8cf2d1`, whose action metadata
declares Node 24. The previous v7 commit declared Node 20. GitHub announced
[the retirement of Node 20 in Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).
This is compatibility maintenance; no current v7 execution failure is asserted.

Independent upstream comparison found identical input definitions, defaults and
outputs for the reviewed versions. Existing jobs use Ubuntu 24.04 and already
use Node 24 actions. The two pin/comment replacements are the entire workflow
diff: triggers, permissions, inputs, output consumers, job conditions and paid
activation policy retain their original bytes. No workflow was dispatched and
no paid agent was activated. The setup-python v7 changes proposed in #207 remain
optional: both its current and proposed metadata already declare Node 24, and
the removed input is unused here.

The three existing automation hardening/workflow suites pass **33/33**, with no
skips. The existing action-pin check validates **114 references**; secret scan
and diff check pass. Commands, exact source, timing, raw output and upstream
review material are retained in [action-runtime-evidence](action-runtime-evidence/manifest.json).
These local checks do not claim a live create-pull-request execution or a passed
hosted matrix for the new integration candidate. Independent final source review
is recorded separately in the agent handoff.
