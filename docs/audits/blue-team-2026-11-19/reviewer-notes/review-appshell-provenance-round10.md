> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# AppShell source-provenance closure — round 10

**Result:** The complete committed file was freshly read and manually reviewed. No new concrete security issue was confirmed within this one-file static review.

| Evidence | Verified value |
| --- | --- |
| Commit | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| Path | `apps/web/src/AppShell.tsx` |
| Git blob | `ae90814b2edb359cf1d72d0a728cfb619870933f` |
| Lines | 551 |
| Bytes | 27,940 |
| Status | `reviewed` |
| Method | `full-content` |
| Inclusive read ranges | 1–150, 151–300, 301–450, 451–551 |
| SHA-256 | `956b71b282cadd2c9186e0b32e5842a7519d75829ed7c6353351ede803ffe47e` |

## Provenance

The commit object type was verified as `commit`. `git rev-parse SHA:path` returned the expected blob. An independent Git blob SHA-1 computation over the full committed bytes matched it. The byte stream contains 551 newline characters and ends with a newline; both line-count methods returned 551.

Every source line was displayed in four nonoverlapping, untruncated chunks using `git show SHA:path`, line numbering, and inclusive ranges. Tool chunk identifiers: `9b35fe`, `36ebea`, `2fa16a`, and `fdb4f4`.

This fresh full-content read establishes coverage directly at the stated commit and blob. It closes the file's coverage provenance without inferring any parent revision or relying on the historical browser report's ambiguous full-read baseline.

## Static review

The review covered view selection and backup gating; frame-refusal dispatch and suspended-session rendering; invoice-fragment handling and privacy-scope resets; settings synchronization, execution-setting changes, RPC authorization calls, and cache invalidation; idle clocks, lease identity, synchronous suspension, asynchronous custody guards, activity rearming, and event cleanup; unload protection and backup/status notices.

No additional confirmed finding was identified. This conclusion is limited to the visible source in this file. Imported implementations and their contracts were not independently revalidated, and no runtime claim is made.

## Work boundaries

No target execution, tests, builds, probes, installs, network access, Git mutations, or source edits were performed. Only these review notes were written, outside the repository in scratch. The existing audit findings were not modified.
