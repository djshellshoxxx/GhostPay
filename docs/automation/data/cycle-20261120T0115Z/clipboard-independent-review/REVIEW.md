# Independent clipboard qualification — cycle 20261120T0115Z

Reviewer: `/root/final_independent_review`, a separate native ChatGPT worker from the implementer and coordinator. This is a bounded internal review, not an external security audit or merge approval.

## Source and environment

- PR: https://github.com/djshellshoxxx/GhostPay/pull/293
- Exact reviewed head: `6c648770f5647ca7993cc108ef9e5ede9b46b4c9`.
- Parent integration source: `d74af79ebabdc8cead843361c3497b46d8c421f9`; fresh integration #278 was `417f7c71daf8645e1432f2ec8f070110879b80bd` at discovery. Relevant base runtime files were unchanged between these integration heads.
- Detached checkout: `/workspace/scratch/a13b43b0f3c9/GhostPay-clipboard-review`.
- Node `24.22.3`; repository Vitest `5.1.0`; original repository ESLint configuration.
- Matching dependencies were copied from our existing integration checkout. Prerequisite package build outputs were copied from our QR supplement checkout only after comparing each entire tracked package tree for exact equality. No new install, dependency change or fresh package-build claim.
- Lockfile blob: `539274d58048bc3edf066ca1a7891f247b2aea36`, identical to #278.
- Runtime blobs: `clipboardPrivacy.ts` = `5e55f2ca693ef3112e8d12409572b29d96ef86a8`; `Common.tsx` = `6d83d05d31ce3812f3ac9faebdea994a491bf188`.
- Test blobs: `clipboardPrivacy.test.ts` = `2af15327f398c18c7dc09cb890b9008d150c4198`; `Common.test.tsx` = `0d7bbf035fc95e8f79c84b7766b87c7b43eaed37`.

## Confirmed qualification defects

1. **Vitest expectation mismatch — high confidence, CI correctness.** `apps/web/src/lib/clipboardPrivacy.test.ts:108` expects `vi.advanceTimersByTimeAsync(30000)` to resolve to `undefined`. Installed repository Vitest returns the `vi` utility object. The committed original-config command below completed with **23 passed, 1 failed**, across two files. The denial behavior itself reaches the expected clear attempt; the unrelated timer-utility return assertion fails. Preserve the denial assertion and await successful timer advancement without asserting an incorrect return contract.

   Command, from `apps/web`: `../../node_modules/.bin/vitest run src/lib/clipboardPrivacy.test.ts src/components/Common.test.tsx --maxWorkers=1`.

   Raw evidence: `committed-vitest.log`. Exit status 1. No tests skipped.

2. **Original ESLint failures — high confidence, CI correctness.** The four-file scoped command completed with **18 errors**: two require-await errors in the added `Common.test.tsx` test, and sixteen require-await/unused-parameter/unbound-method diagnostics in `clipboardPrivacy.test.ts`. Both runtime files had zero scoped diagnostics. Retain every behavioral assertion while using Promise-returning mocks and separately named spy references.

   Command, from `apps/web`: `../../node_modules/.bin/eslint src/lib/clipboardPrivacy.ts src/lib/clipboardPrivacy.test.ts src/components/Common.tsx src/components/Common.test.tsx`.

   Exact structured diagnostics: `eslint.json`. Exit status 1. No rule or configuration changes proposed.

## Conditional runtime concern

**Pending same-value re-copy can be cleared by the previous timer under a commit-before-settlement interleaving.** Source: `Common.tsx:69–71`, `clipboardPrivacy.ts:19–32` at the exact head above.

The module increments its generation only after `writeText` settles successfully. A reviewer-only React/Vitest probe deliberately separates a second write's content update from its Promise settlement. At t=0 an opted-in copy completes with a 30-second interval; at t=10s a second copy of the same value writes the value but its Promise remains pending. At t=30s the old generation sees matching content twice and empties it. When the second Promise settles, the button reports `Copied`, although the simulated clipboard is empty. A different-value control passes because the old cleanup observes the mismatch.

Probe results: **one expected behavior assertion failed, one control passed**. Files: `Common.clipboardPending.probe.test.tsx`, `pending-copy-probe.log`. The probe was copied temporarily into the detached checkout to use original repository Vitest, then removed. No tracked source changed.

Classification: low-severity conditional correctness concern; high confidence in the modeled source behavior, with real-browser scheduling reachability **not verified**. This is not evidence of secret exfiltration, spending authority or a real-browser exploit. It is separate from the already documented non-atomic clipboard read/write race. A future owner may invalidate prior timers when an app copy begins, with explicit failed-copy semantics; any already-dispatched clipboard write remains outside atomic cancellation. The test-only qualification correction can proceed without claiming this runtime concern fixed.

## Bounded security assessment

- Opt-in defaults and invalid delays do not read/clear the clipboard; every recorded successful app copy advances the generation, including disabled-delay copies.
- The helper checks content and generation after both reads, and catches unavailable/denied read and write operations. These checks narrow stale-read risks but cannot provide atomic compare-and-swap.
- A later external write after the second read, or an already-dispatched delayed clear, can still race. OS history/sync and JavaScript string erasure are explicitly outside the guarantee.
- A pending timer retains its value until expiry even after superseded; the configured bound is five minutes. No zeroization or permission guarantee is inferred.
- No confirmed unclaimed security defect emerged from the earlier limited Blob-download triage. The shared helper removes its anchor and revokes the object URL on synchronous failure; the principal sensitive key-export callers already report failure. This is not a complete download/session audit.

## Hosted evidence and limits

Exact-head workflow query returned:

- CI: queued — https://github.com/djshellshoxxx/GhostPay/actions/runs/44649152819
- Hosting kit: successful — https://github.com/djshellshoxxx/GhostPay/actions/runs/44649152850
- Pages: successful — https://github.com/djshellshoxxx/GhostPay/actions/runs/44649152985
- Beta acceptance: successful — https://github.com/djshellshoxxx/GhostPay/actions/runs/44649152855
- CLI operator qualification: successful — https://github.com/djshellshoxxx/GhostPay/actions/runs/44649152909

No full web test/typecheck, workspace build, browser acceptance, security scanner or new hosted execution was performed by this reviewer. Workflow success does not override the reproduced local failures or confer merge eligibility. Integration-lock ownership and protected-branch checks remain coordinator gates.

Final review worktree was clean; `git diff --check` passed. No remote writes, branch mutations, deployments, releases, real-funds operations, paid APIs or external agents were used.
