# GhostPay GP-BUG-R12 — Reject long JWS-shaped query values from static caches

Date: 2026-11-23 UTC. Status: **isolated draft bug-only repair, unmerged**.

## Baseline, ownership and coordination

- Live `main` baseline: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, and `docs/ai/ACTIVE_WORK.md` from that baseline; preserved all existing registry entries.
- Isolated branch `automation/20261123/bug/notify-jws-query-cache-r12`.
- Owned: `packages/ux-notify/src/urlsafety.ts`, new `packages/ux-notify/src/urlsafety.jwt-query.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim, this handoff. No other source or tests changed.
- Inspected the **complete changed-file inventories for all 253 open PRs** on 2026-11-23 UTC (100 + 100 + 53). Neither owned source nor new focused regression path was modified by another open PR. Nearby but untouched ux-notify files belong to PRs #465 (notification.ts), #458/#409 (cache-policy.ts), #439 (manifest.ts), #433 (redact.ts); broad PRs own unrelated `redact.test.ts` and `package.json`.
- Exact PR #390 head `b655bc273a6704c9c140287b8adcdf4085b91882`: five pull-request workflow groups (`CI`, `Pages`, `Beta acceptance`, `Hosting kit`, `CLI operator qualification`) completed **successfully** and Snyk status succeeded. `list_pull_request_reviews` returned no submitted review; #390 is OPEN and *not draft*. Left its owner-controlled branch untouched.
- Fresh lock read: `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, file `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`; generation **11**, status **held**, owner `994a0d214fb9-root-r3`. The expired timestamp is **not** authority to override, acquire, or merge.

## Observed defect and root cause

The shared `hasSensitiveQuery()` classifier claims to exclude long opaque values from both manifest URLs and service-worker static cache eligibility. The old algorithm matched a single uninterrupted base64url-like string of length >= 32, but compact signed tokens (JWS/JWT) contain literal or percent-decoded periods between the three base64url segments. A synthetic 72-character JWS-like value under the innocuous query key `v` returned `false` (not sensitive). An allowlisted hashed asset URL with the same query would therefore follow the cache-first branch and could retain a secret-bearing URL in CacheStorage if the response were cached.

The original file was fetched from `main` and independently verified via `git hash-object`: `9d2f5e1854641629c1321fb65fe64242a45f920a`. The unmodified file compiled using local TypeScript **5.8.3** and was executed under Node **22.16.0**; baseline assertion replay: **4/6 passed, two failed**, specifically raw-dot and encoded-dot compact tokens. No external traffic or valid credential was used.

## Test-first repair

- Ownership/claim commit: `a0194d83f668ec59b4fd141998e616688ceff670`.
- Focused failing regression **committed before the production edit**: `e1621979474de5150439aade4fb0f54f20008e5d`, `urlsafety.jwt-query.test.ts`. It asserts raw and percent-encoded token detection, as well as the corresponding static cache decision, and protects ordinary dotted version values and existing secret-key/plain opaque-string checks.
- Minimal source repair: `38f6cd60a712a594a6f546e826618818a8d6919f`. A single additional guard recognizes long three-segment JWS-shaped base64url values. No cache policy implementation, network behavior, UI or dependency was otherwise changed.
- Fixed source blob: `c479936e3e819daa75187aee3b51b4335fc6f385`, independently matched by local `git hash-object`.
- After fix, **6/6 directed original-file Node checks passed**, and **505/505 broader source-exact Node checks passed**, including raw and percent-encoded compact tokens, short/long opaque strings, ordinary dotted version strings, malformed encoding, and 400 neighboring strings. The change also detects truncated-but-still-token-shaped input; this is intentional protection, not a control drift.
- These are **standalone exact-source compilation/execution checks**, not `vitest` against a native checkout. Native `git clone` was blocked by local DNS failure resolving `github.com`; no local repository `vitest`, ESLint, full build, security checks or native browser run is claimed. The focused Vitest file is committed but unexecuted locally.

## Outstanding integration gates

- Publish/open narrow draft PR; inspect exact final PR-head CI checks and rerun only where supported/necessary. Do not infer success from running/queued checks.
- Full hosted workspace CI, lint, tests, build, Pages and browser qualification as applicable must be confirmed at the **final** head. A real separate independent reviewer/verifier must inspect and approve. This coordinator cannot self-certify independent review.
- Recheck live `main`, every current PR's changed paths, dependencies and the held integration lock before any integration.
- No merge, branch consolidation, lease takeover, deployment/release, fund or contract activity, private secret, real-world traffic probing or new feature was performed.

Next bug-only cycle: verify PR #390's independent review gate first, then select a different *unowned* existing-functionality failure in another Pages runtime/package.
