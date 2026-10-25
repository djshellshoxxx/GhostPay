# GhostPay restart — lean core

**2026-10-24 UTC.** Start here before the historical [next-agent prompt](NEXT_AGENT_PROMPT.md). This handoff does not grant implementation, push, merge, release or deployment authority; follow the active owner task and supported access.

## Read and verify

1. Confirm repository `djshellshoxxx/GhostPay`, the current `origin/main` SHA, concurrent work and applicable repository instructions. Docs baseline was `a6a2a1c5cbccb7d97c36decba78a99fa83e8a6f8` after PRs #27/#28; do not restart from the older `7ea6c3c` description blindly.
2. Read [lean scope](LEAN_RELEASE_SCOPE.md), [SESSION_STATUS](SESSION_STATUS.md), [prior handoff](../HANDOFF-2026-10-24-PR26-CAS.md), [work plan](../WORK-PLAN-2026-10-24.md) and [spec index](../specs/README.md). Existing session/test records are historical evidence, not reruns or acceptance of new cases.
3. Ask the owner to supply the private review packet through the executor's supported channel before detailed reproductions. Do not assume Claude or another executor can automatically access a private Library, chat, local path or preparation pack. Do not publish packet contents or detailed unverified findings.
4. Verify exact-head EVM network/asset/registry/contracts/trust configuration before selecting the supported local/test path. Lack of verified prerequisites must fail closed, not become an invented deployment.

## First milestone

Disposition the assigned core cases before optional work, then establish one invoice → pay → detect/receipt → sweep → encrypted backup/fresh-profile restore demonstration. Reproduce each assigned failure before the smallest authorized fix and preserve valid-flow, expiry, cancellation, stale-session, reorg and unknown-outcome behavior.

Archive/import is a beta blocker only if reachable or a shipped dependency; otherwise prove exclusion and retain it for later. BTC and other chains remain preserved, conditional work. Generic relayer retries/fallback and feature expansion are not the next slice under this override.

Use the existing validation commands and gates recorded in SESSION_STATUS and repository instructions. Keep historical results, new focused checks, full reruns, skipped tests and blocked execution distinct. A documentation-only check is not an application test pass.

At each authorized milestone record exact SHA, files/functions changed, commands/results, review, skipped gates, unresolved cases and next unreviewed area. Read back published hashes when publication is authorized; inspect push/PR/merge workflow side effects first. No force-push, releases, deployments or production funds.
