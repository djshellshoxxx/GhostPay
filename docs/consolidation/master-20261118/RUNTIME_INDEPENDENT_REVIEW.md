# Runtime recovery: independent relayer source review

Review date: 2026-11-19. Reviewer: CI/release reviewer, independent of the runtime recovery author. This review is read-only and ran no tests or installs, as requested by the coordinator after local memory failures.

## Result

No blocking source defect was found in the bounded relayer/guard integration reviewed below. A regression fixture that failed before the intended admission boundary was corrected by the author during review. An already-touched deviation note was updated to describe current signature behavior. Hosted tests, lint, typecheck, coverage and complete candidate qualification remain pending.

The reviewed worktree was `GhostPay-runtime-recovery`, based on the master integration checkpoint `c5f9b190` with ownership claim `da3a8728d7284a02918c9ef178311596fa1321a0`. Staged blob identities are recorded below so the final implementation commit can be checked against the reviewed source. The author is restoring the bounded PR #218 delta and preserving the current #222 privacy implementation. This is AI-assisted review, not an external security audit.

## Reviewed boundaries

- **Admission and custody of lane slots:** canonical signature form is checked before the first await and before taking a client slot. The salted client slot is reserved synchronously before asynchronous recovery/policy checks. A finally path releases admission failures; after submission the lane owns the release until the job's settlement promise finishes. Closed/full lane rejection releases the ticket. The existing serial nonce lane, simulation, budget reservation and send/receipt logic remain in place.
- **Signature parity:** validated requests carry 65-byte hex signatures. The half-order constant, byte offsets and v=27/28 requirement agree with the contract's OpenZeppelin ECDSA path. The vendored bytes overload rejects lengths other than 65; its low-s check and zero-recovery rejection were inspected. A malformed or malleated signature cannot spend owner failure strikes through the new pre-admission check.
- **Per-peer connections:** the cap uses the actual parsed socket peer, normalized network buckets and per-process HMAC keys; untrusted forwarded headers do not define this cap. Trusted-proxy exemption is explicit. Counts are released on close, total connections remain capped, and the new metric contains only a count. Header/request/keepalive limits remain bounded; the check interval makes the existing timeout intent effective.
- **Quote-path breaker:** concurrent quote lookups still share a single gas-price promise. Consecutive real lookup failures can open a closed breaker; successful reads reset the streak; quoted cap refusals remain neutral. Quotes do not take a half-open sweep probe or extend an already-open cooldown.
- **Limiter and loss accounting:** key and group-overflow tables remain bounded. Eviction considers at most eight old entries and removes only fully refilled token buckets or stale loss windows. The shared overflow bucket remains a last resort. The added per-resolution held-key sets prevent a later source from evicting an earlier stale hit and orphaning its new charge. Global loss is still charged once per reservation, with retained settlement/release paths.
- **Privacy and client error boundary:** config retains the privacy field and strict padding parser while adding server/queue controls. Request padding stripping, strict body/field validation, exact-origin CORS and allowlist-only logging remain. Logger failures are contained without adding request fields. The browser classifies client_queue_full as pre-broadcast; that error is thrown only before lane dispatch.

CLI command behavior, invoice test restoration and full devnet behavior were not independently qualified by this bounded review.

## Correction made during review

The new hardening test for admission-failure slot cleanup originally used 65 zero bytes. Its v=0 was rejected by the new canonical-form check before reservation, contradicting its comment and leaving the intended finally path untested. The author changed it to 64 zero bytes followed by 1b. That passes the cheap form check, fails recovery with zero r/s after reservation, and keeps the subsequent successful maxPerClient=1 request plus final heldClientSlots=0 assertion. This is a test correction, not a claimed test pass.

The high-s simulation statement in DEVIATIONS item 6 was stale. The author replaced it with the current pre-recovery/pre-reservation/pre-RPC form rejection and no-owner-strike behavior.

## Reviewed staged blobs

| Path | Git blob |
|---|---|
| apps/relayer/src/config.ts | 6800de3a2eca21495fea8d56ffdba9ef1ee34b5c |
| apps/relayer/src/hardening.test.ts | fe8e316ad7684ebd84f4c199f8c75ff5c30cea49 |
| apps/relayer/src/lane.ts | ec73822ae52d7ea459db0ff07b609605e5cceebe |
| apps/relayer/src/log.ts | aebf834a9a76e1727515e17084a6dc533e173c44 |
| apps/relayer/src/main.ts | 817e8c27c8d197e681bbd5aed1471f2af543d9d7 |
| apps/relayer/src/server.ts | c99e9b66f88bc99b9b082c968c3023dbd7454a68 |
| apps/relayer/src/service.ts | a7b3dfb5fc01b7cf7b8e7f9bc9dc58c7bd17b3ef |
| apps/relayer/src/validate.ts | 5192ff6783dcfa91638cbdd928860abc1d3ba888 |
| apps/web/src/lib/relayerClient.ts | 005edbbed22ccd6a6fa11f490480c02ed77408a6 |
| packages/relayer-guard/src/limiter.abuse.test.ts | 944162cb2dcea4f92ebadcba38956aacf1a17a0b |
| packages/relayer-guard/src/limiter.ts | 79cf96b346911d45bad68ca0ce0930043ba260ff |

No remote merge, release, deployment, suppression, dependency change or policy edit was performed by this reviewer.

## Final source identity

All 11 reviewed blobs above were independently checked against final implementation commit `d80aa890c6492247cccbe13ac0621f1242749254` and match exactly. The fixture and deviation-note corrections are included. The source-review result applies to that final implementation; hosted qualification remains pending.
